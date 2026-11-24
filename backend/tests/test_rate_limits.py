"""24 Nov (deployment audit, item 3): usage limits.

conftest.py raises every limit for the rest of the suite (all test requests come from one address); these tests put
small real limits back with monkeypatch. Counts live in PostgreSQL (request_counts), so they also hold across
restarts and backend workers; parallel requests are counted atomically.
"""
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from conftest import sql


@pytest.fixture
def small_limits(monkeypatch, db):
    from app.config import settings
    from app.services import rate_limit
    monkeypatch.setattr(settings, "ai_requests_per_hour", 3)
    monkeypatch.setattr(settings, "ai_requests_per_day", 50)
    monkeypatch.setattr(settings, "ip_limit_multiplier", 1)
    monkeypatch.setattr(settings, "ai_parallel_per_user", 100)     # the parallel-slot test sets its own
    monkeypatch.setitem(rate_limit.IP_LIMITS, "forgot", (2, rate_limit.HOUR, "password-reset requests"))
    monkeypatch.setitem(rate_limit.IP_LIMITS, "register", (2, rate_limit.HOUR, "sign-ups"))
    sql(db, "delete from request_counts")
    yield
    sql(db, "delete from request_counts")


def suggest(client, h):
    return client.post("/profile/projects/suggest", headers=h, json={"name": "Shop API", "description": "A shop backend."})


def test_the_ai_limit_stops_one_user_and_not_another(client, users, small_limits):
    a, b = users.student(skills=()), users.student(skills=())
    codes = [suggest(client, users.h(a)).status_code for _ in range(4)]
    assert all(c != 429 for c in codes[:3]) and codes[3] == 429
    r = suggest(client, users.h(a))
    assert "limit of 3 AI requests an hour" in r.json()["detail"] and int(r.headers["Retry-After"]) > 0
    assert suggest(client, users.h(b)).status_code != 429          # a second account still works


def test_parallel_requests_cannot_slip_past_the_limit(client, users, small_limits, monkeypatch):
    from app.config import settings
    from app.main import app
    monkeypatch.setattr(settings, "ai_requests_per_hour", 5)
    h = users.h(users.student(skills=()))
    start = threading.Barrier(12)

    def one(_):
        c = TestClient(app)
        start.wait()
        return suggest(c, h).status_code
    with ThreadPoolExecutor(12) as pool:
        codes = list(pool.map(one, range(12)))
    assert sum(c != 429 for c in codes) == 5                        # exactly the limit, not more


def test_the_ai_limit_is_kept_in_the_database(client, db, users, small_limits):
    a = users.student(skills=())
    suggest(client, users.h(a))
    n = sql(db, "select sum(count) from request_counts where key like 'ai:hour:user:%'").scalar()
    assert n == 1                                                   # a restart reads the same count


def test_per_address_limits_on_reset_and_sign_up(client, small_limits):
    codes = [client.post("/auth/forgot-password", json={"identifier": "nobody_here"}).status_code for _ in range(3)]
    assert codes[:2] == [200, 200] and codes[2] == 429
    body = {"first_name": "Ann", "last_name": "Lee", "password": "Harbour-Lantern-42", "role": "student",
            "accept_privacy": True}
    codes = [client.post("/auth/register", json={**body, "username": f"limit{i}x", "email": f"limit{i}x@example.com"}).status_code
             for i in range(3)]
    assert codes[:2] == [201, 201] and codes[2] == 429


def test_production_refuses_a_raised_address_limit(monkeypatch):
    from app.config import settings
    from app.services.production import production_problems
    monkeypatch.setattr(settings, "ip_limit_multiplier", 100)
    assert any("IP_LIMIT_MULTIPLIER" in p for p in production_problems())


# ── 24 Nov, after the fix re-check: limits at the AI call itself ─────────────────────────────────────────────────

class _FakeGroq:
    """Stands in for the Groq client: counts calls, optionally slow, answers with an empty skill list."""
    def __init__(self, delay=0.0):
        import time as _t
        self.calls, self._t, self.delay = 0, _t, delay
        self.chat = self
        self.completions = self

    def create(self, **kwargs):
        self.calls += 1
        self._t.sleep(self.delay)
        msg = type("M", (), {"content": "[]"})()
        return type("R", (), {"choices": [type("C", (), {"message": msg, "finish_reason": "stop"})()], "usage": None})()


def test_saving_a_project_without_skills_is_limited_too(client, users, small_limits, monkeypatch):
    """The re-check's finding: add_project reads skills with the AI when none are sent; that counts and stops too."""
    import app.routers.profile as profile
    from app.config import settings
    fake = _FakeGroq()
    monkeypatch.setattr(profile, "get_client", lambda: fake)
    monkeypatch.setattr(settings, "ai_requests_per_hour", 2)
    h = users.h(users.student(skills=()))
    codes = [client.post("/profile/projects", headers=h, json={"name": f"Shop API {i}", "description": "A shop backend in Python."}).status_code
             for i in range(3)]
    assert codes[:2] == [201, 201] and codes[2] == 429
    assert fake.calls == 2                                          # the third save never reached the AI


def test_only_two_ai_calls_run_at_once_per_user(client, db, users, small_limits, monkeypatch):
    import app.routers.profile as profile
    from app.config import settings
    from app.main import app
    fake = _FakeGroq(delay=0.8)
    monkeypatch.setattr(profile, "get_client", lambda: fake)
    monkeypatch.setattr(settings, "ai_parallel_per_user", 2)
    monkeypatch.setattr(settings, "ai_requests_per_hour", 100)      # only the parallel rule is tested here
    h = users.h(users.student(skills=()))
    start = threading.Barrier(4)

    def one(_):
        c = TestClient(app)
        start.wait()
        r = c.post("/profile/projects/suggest", headers=h, json={   # long enough for the AI to be asked
            "name": "Shop API", "description": "An online shop backend built with Python and FastAPI, storing orders in PostgreSQL."})
        return r.status_code, (r.json().get("detail") if r.status_code == 429 else "")
    with ThreadPoolExecutor(4) as pool:
        results = list(pool.map(one, range(4)))
    busy = [d for code, d in results if code == 429]
    assert fake.calls == 2 and len(busy) == 2 and all("running" in d for d in busy)
    assert sql(db, "select count(*) from request_counts where key like 'ai:inflight:%'").scalar() == 0   # released


# ── 25 Nov, fix re-check: a call longer than the slot time keeps its slot ──────────────────────────────────────

LONG = {"name": "Shop API", "description": "An online shop backend built with Python and FastAPI, storing orders in PostgreSQL."}


def _long_call_then_second(client, users, monkeypatch, renew_seconds):
    """Call A takes 3.5 s with a 2 s slot time; call B starts at 2.6 s. Returns B's status and the AI calls made."""
    import time
    import app.routers.profile as profile
    from app.config import settings
    from app.main import app
    from app.services import rate_limit
    fake = _FakeGroq(delay=3.5)
    monkeypatch.setattr(profile, "get_client", lambda: fake)
    monkeypatch.setattr(settings, "ai_parallel_per_user", 1)
    monkeypatch.setattr(settings, "ai_requests_per_hour", 100)
    monkeypatch.setattr(rate_limit, "LEASE_SECONDS", 2)
    monkeypatch.setattr(rate_limit, "RENEW_SECONDS", renew_seconds)
    h = users.h(users.student(skills=()))

    def a():
        return TestClient(app).post("/profile/projects/suggest", headers=h, json=LONG).status_code
    with ThreadPoolExecutor(1) as pool:
        first = pool.submit(a)
        time.sleep(2.6)                                     # A is still running, past the 2 s slot time
        b = TestClient(app).post("/profile/projects/suggest", headers=h, json=LONG)
        first.result()
    return b.status_code, fake.calls


def test_a_long_running_call_keeps_its_slot(client, db, users, small_limits, monkeypatch):
    status, calls = _long_call_then_second(client, users, monkeypatch, renew_seconds=0.5)
    assert status == 429 and calls == 1                     # B refused: A renewed its slot while running
    assert sql(db, "select count(*) from request_counts where key like 'ai:inflight:%'").scalar() == 0


def test_without_renewal_the_slot_would_expire_mid_call(client, db, users, small_limits, monkeypatch):
    """Control: the problem the re-check found. With no renewal during the call, B gets in past the limit of 1."""
    status, calls = _long_call_then_second(client, users, monkeypatch, renew_seconds=100)
    assert status != 429 and calls == 2
