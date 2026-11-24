"""
Usage limits (24 Nov 2026, deployment audit item 3).

Why: SkillMap's AI features share one Groq account and its daily quota. Without a limit, one signed-in account sending
requests (even in parallel) could use it all up for everyone. Public entry points (register, sign-in, password reset,
code resends) also get a per-address limit on top of their per-account rules.

How: fixed time windows counted in PostgreSQL (table request_counts) with one atomic statement per request:
INSERT ... ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count. Every request is counted before it runs, so
100 parallel requests let exactly the first N through. Kept in the database, so limits hold across restarts and
across several backend workers. Over a limit: HTTP 429 with how long to wait (and a Retry-After header).

AI limits are applied where SkillMap calls Groq or Gemini (ai_create / ai_generate below), not only on chosen routes,
so a save that reads skills when none were sent counts too (24 Nov re-check). At most AI_PARALLEL_PER_USER AI calls of
one user run at the same moment.

Limits are STARTING values, set well above what one person needs in normal use; adjust them after measuring real
use (e.g. during the SUS sessions). The AI ones can be changed in backend/.env:
  AI, per user, all AI features together: AI_REQUESTS_PER_HOUR (60) and AI_REQUESTS_PER_DAY (200).
  Per IP address: register 20 an hour, sign-in 60 per 10 minutes, forgot password 20 an hour, verification resends
    20 an hour. Generous on purpose: testers in one room (a SUS session) may share one Wi-Fi address.
Behind a reverse proxy the backend must be told the proxy's address (uvicorn --proxy-headers --forwarded-allow-ips),
otherwise every visitor looks like the proxy and shares one per-address count (README "Deployment").
"""
import threading
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config import settings
from app.database import SessionLocal
from app.models.request_count import RequestCount

HOUR, DAY = 3600, 86400
IP_LIMITS = {                       # name: (requests, window in seconds, what it is called in the message)
    "register": (20, HOUR, "sign-ups"),
    "login": (60, 600, "sign-in attempts"),
    "forgot": (20, HOUR, "password-reset requests"),
    "resend": (20, HOUR, "code requests"),
}


def _window(now: datetime, seconds: int) -> datetime:
    epoch = int(now.timestamp())
    return datetime.fromtimestamp(epoch - epoch % seconds, tz=timezone.utc)


class AILimitReached(HTTPException):
    """An AI limit was reached. The AI call sites catch errors broadly (a failed call falls back or says "not
    available"); they let THIS one through, so the user sees the real reason and when to try again."""


def count_and_check(key: str, limit: int, seconds: int, what: str, error=HTTPException) -> None:
    """Counts one request for `key` in the current window; 429 if that makes it more than `limit`."""
    now = datetime.now(timezone.utc)
    start = _window(now, seconds)
    with SessionLocal() as db:      # its own short transaction: counted even if the request then fails
        n = db.execute(pg_insert(RequestCount).values(key=key, window_start=start, count=1)
                       .on_conflict_do_update(index_elements=[RequestCount.key, RequestCount.window_start],
                                              set_={"count": RequestCount.count + 1})
                       .returning(RequestCount.count)).scalar_one()
        db.commit()
    if n > limit:
        wait = int((start + timedelta(seconds=seconds) - now).total_seconds()) + 1
        minutes, hours = -(-wait // 60), -(-wait // HOUR)
        when = f"{minutes} minute{'s' if minutes != 1 else ''}" if wait < 2 * HOUR else f"{hours} hours"
        raise error(status_code=429, headers={"Retry-After": str(wait)},
                    detail=f"You've reached the limit of {limit} {what}. Please try again in {when}.")


# ── AI limits (24 Nov, after the fix re-check) ─────────────────────────────────────────────────────────────────────
# Enforced where SkillMap actually calls Groq or Gemini (ai_create / ai_generate), so EVERY route that reaches the
# AI is covered, including saves that read skills when none were sent, and any route added later. Who is asking comes
# from the request's sign-in token (bound by a small middleware in app/main.py); calls with no signed-in user
# (offline scripts) are not limited. Per request, the hourly and daily allowance is counted once. While a call runs it
# holds one of the user's AI_PARALLEL_PER_USER slots (a row in request_counts, taken under a per-user database lock,
# renewed every RENEW_SECONDS while the call runs, deleted when it ends, ignored after LEASE_SECONDS only if a server
# stopped mid-call): a burst of parallel requests can't run more than that many AI calls at once, however long they
# take. request_counts therefore holds two kinds of row: request-window counters and temporary AI concurrency slots.
LEASE_SECONDS = 120       # a slot not renewed for this long is ignored (only after a crash: running calls renew it)
RENEW_SECONDS = 30        # 25 Nov (fix re-check): a running call renews its slot this often, however long it takes
_request_user: ContextVar = ContextVar("ai_request_user", default=None)
_request_state: ContextVar = ContextVar("ai_request_state", default=None)


def bind_request(user_id: int | None) -> None:
    """Called once per request by the middleware: who is asking (None = not signed in)."""
    _request_user.set(user_id)
    _request_state.set({"counted": False})


def _count_allowance(user_id: int) -> None:
    state = _request_state.get()
    if state is not None and state["counted"]:
        return
    count_and_check(f"ai:hour:user:{user_id}", settings.ai_requests_per_hour, HOUR, "AI requests an hour", AILimitReached)
    count_and_check(f"ai:day:user:{user_id}", settings.ai_requests_per_day, DAY, "AI requests a day", AILimitReached)
    if state is not None:
        state["counted"] = True


def ai_limit(user) -> None:
    """Optional early check at the start of a route that will ask an AI model (answers 429 before any other work).
    Counts the same allowance as the AI call itself, once per request."""
    _count_allowance(user.id)


@contextmanager
def ai_call():
    """Around one AI call: the allowance (once per request) and one parallel slot while the call runs."""
    user_id = _request_user.get()
    if user_id is None:
        yield
        return
    _count_allowance(user_id)
    prefix = f"ai:inflight:user:{user_id}:"
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        db.execute(text("SELECT pg_advisory_xact_lock(4242, :u)"), {"u": user_id})   # one slot check at a time per user
        running = db.query(RequestCount).filter(RequestCount.key.like(prefix + "%"),
                                                RequestCount.window_start > now - timedelta(seconds=LEASE_SECONDS)).count()
        if running >= settings.ai_parallel_per_user:
            db.commit()
            raise AILimitReached(status_code=429, headers={"Retry-After": "10"},
                                 detail=f"You already have {running} AI requests running. Please wait for them to finish.")
        key = prefix + uuid.uuid4().hex[:12]
        db.add(RequestCount(key=key, window_start=now, count=1))
        db.commit()
    # 25 Nov (fix re-check): a call that runs longer than LEASE_SECONDS must not lose its slot, or a third call could
    # start. A small timer renews the slot's time every RENEW_SECONDS until the call ends; the expiry then only
    # matters if the server stopped mid-call.
    stop = threading.Event()

    def keep_slot():
        while not stop.wait(RENEW_SECONDS):
            try:
                with SessionLocal() as renew:
                    renew.query(RequestCount).filter(RequestCount.key == key)                         .update({"window_start": datetime.now(timezone.utc)}, synchronize_session=False)
                    renew.commit()
            except Exception as e:   # noqa: BLE001 — a missed renewal is retried on the next tick
                print(f"[ai limit] renewing slot {key} failed: {e}")
    renewer = threading.Thread(target=keep_slot, name="ai-slot-renew", daemon=True)
    renewer.start()
    try:
        yield
    finally:
        stop.set()
        renewer.join(timeout=5)
        with SessionLocal() as db:
            db.query(RequestCount).filter(RequestCount.key == key).delete(synchronize_session=False)
            db.commit()


def ai_create(client, **kwargs):
    """client.chat.completions.create(**kwargs) for Groq, inside the AI limits."""
    with ai_call():
        return client.chat.completions.create(**kwargs)


def ai_generate(gemini, **kwargs):
    """gemini.models.generate_content(**kwargs) for Gemini, inside the AI limits."""
    with ai_call():
        return gemini.models.generate_content(**kwargs)


def ip_limit(request: Request, name: str) -> None:
    limit, seconds, what = IP_LIMITS[name]
    limit *= max(1, settings.ip_limit_multiplier)   # tests / local browser runs only (refused in production)
    ip = request.client.host if request.client else "unknown"
    count_and_check(f"{name}:ip:{ip}", limit, seconds, what + (" an hour" if seconds == HOUR else " in 10 minutes"))


def delete_old_counts(db) -> None:
    """Start-up tidy (with delete_old_codes): windows older than 2 days are never needed again."""
    db.query(RequestCount).filter(RequestCount.window_start < datetime.now(timezone.utc) - timedelta(days=2)) \
        .delete(synchronize_session=False)
