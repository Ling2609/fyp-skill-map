"""24 Nov (deployment audit, items 4 and 5): requests that arrive at the same moment.

Item 4: wrong passwords counted at once must all count (one atomic database statement), so the 10-try pause holds.
Item 5: two "Forgot password" or "change email" requests at once send ONE code (the account row is locked while
issuing), not two competing ones.
"""
import threading
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from conftest import PASSWORD, sql


def together(fn, n):
    """Runs fn(client, i) n times at once, each on its own client (its own database session)."""
    from app.main import app
    start = threading.Barrier(n)

    def run(i):
        c = TestClient(app)
        start.wait()
        return fn(c, i)
    with ThreadPoolExecutor(n) as pool:
        return list(pool.map(run, range(n)))


def test_ten_wrong_passwords_at_once_still_pause_sign_in(client, db, users):
    email = users.student(skills=())
    codes = together(lambda c, i: c.post("/auth/login", json={"email": email, "password": f"wrong-{i}-password"}).status_code, 10)
    assert codes.count(401) + codes.count(429) == 10
    # every wrong try counted: the pair is paused, so even the right password is refused now
    r = client.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 429 and "Too many failed sign-ins" in r.json()["detail"]
    sql(db, "delete from login_attempts where identifier = (select username from users where email = :e)", e=email)


def test_the_count_is_exact_when_requests_overlap(client, db, users):
    email = users.student(skills=())
    together(lambda c, i: c.post("/auth/login", json={"email": email, "password": f"wrong-{i}-password"}), 6)
    n = sql(db, "select failed_count from login_attempts where identifier = (select username from users where email = :e)",
            e=email).scalar()
    assert n == 6                                         # not fewer: no lost updates
    assert client.post("/auth/login", json={"email": email, "password": PASSWORD}).status_code == 200   # clears it
    assert sql(db, "select count(*) from login_attempts where identifier = (select username from users where email = :e)",
               e=email).scalar() == 0


def test_two_forgot_password_requests_at_once_send_one_code(client, db, users, monkeypatch):
    import app.routers.auth as auth
    email = users.student(skills=())
    sent = []
    monkeypatch.setattr(auth, "send_email", lambda to, subject, text, html=None: sent.append(to))
    together(lambda c, i: c.post("/auth/forgot-password", json={"identifier": email}).status_code, 2)
    codes = sql(db, "select count(*) from password_reset_otps where purpose = 'reset' and user_id = "
                    "(select id from users where email = :e)", e=email).scalar()
    assert codes == 1 and len(sent) == 1


def test_two_email_changes_at_once_send_one_code(client, users, monkeypatch):
    import app.routers.auth as auth
    email = users.student(skills=())
    h = users.h(email)
    sent = []
    monkeypatch.setattr(auth, "send_email", lambda to, subject, text, html=None: sent.append(to))
    codes = together(lambda c, i: c.put("/auth/me/email", headers=h, json={"new_email": f"moved{i}x@example.com",
                                                                           "current_password": PASSWORD}).status_code, 2)
    assert sorted(codes) == [200, 429] and len(sent) == 1
