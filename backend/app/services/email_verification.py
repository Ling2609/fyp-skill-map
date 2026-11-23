"""
Registration email verification (23 Nov 2026; behaviour agreed in skillmap-design/email-verification-spec.md v3).

A new account is unverified (users.email_verified_at is NULL) until its owner types the 6-digit code emailed to it.
Until then it can't sign in; signing in with the right password brings the owner back to the "Check your email"
page instead (with a fresh code only if the limits below allow and no usable code exists).

Sending a code (request_code):
  1. one short transaction with the user row locked (SELECT ... FOR UPDATE) checks the limits and, if they allow,
     inserts an attempt row in email_code_sends and commits. That reserves the send slot: a second request for the
     same account waits on the lock and then sees the attempt, so two clicks / tabs / workers can't both send.
       - cooldown: 60 s since the last attempt (accepted or not)
       - rolling cap: 5 emails ACCEPTED by the mail server in any 24 h
  2. the email is sent in the request (send_email_now). Not accepted -> nothing stored, the previous usable code
     still works, the attempt stays accepted = false (the cooldown applies, the cap is not used).
  3. the attempt is marked accepted (the mail server took it, so it counts towards the cap) and committed.
  4. the new code is stored (replacing the previous one) and committed.
  Sending and storing can't be one atomic step: if 4 fails after the mail server accepted the email, the emailed
  code won't work. The caller is told ("store_failed"); the next send replaces everything.

Automatic sends (register, sign-in) reuse a usable code instead of sending another; "Send again" always replaces it.
A usable code is unused, unexpired and has fewer than 5 wrong tries.

The verification ticket is NOT a sign-in token: a JWT with its own key, holding the user id, the email it was issued
for and the purpose, valid 30 minutes. Every use rechecks that the account exists, is still unverified and still has
that email.
"""
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from jwt import PyJWTError
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models.email_code_send import EmailCodeSend
from app.models.password_reset import PasswordResetOTP
from app.models.user import User
from app.services import account_emails
from app.services.mailer import MailNotSent, send_email_now

PURPOSE = "register"
VERIFY_CODE_MINUTES = 10        # registration codes (password-reset codes stay 15 min: auth.RESET_CODE_MINUTES)
TICKET_MINUTES = 30
COOLDOWN_SECONDS = 60
DAILY_CAP = 5
MAX_WRONG = 5                   # = auth.RESET_MAX_ATTEMPTS
TICKET_EXPIRED = "This page has expired. Sign in again to get a new code."


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ticket_key() -> str:
    return settings.secret_key + "|verify-email"   # not the login-token key, not the reset key


def make_ticket(user: User) -> str:
    return jwt.encode({"sub": str(user.id), "email": (user.email or "").lower(), "purpose": "verify-email",
                       "exp": _now() + timedelta(minutes=TICKET_MINUTES)}, _ticket_key(), algorithm=settings.algorithm)


def read_ticket(ticket: str, db: Session) -> User | None:
    """The unverified account the ticket was issued for, or None (expired, tampered, account gone, already
    verified, or its email has changed since)."""
    try:
        claims = jwt.decode(ticket or "", _ticket_key(), algorithms=[settings.algorithm])
        user_id, email = int(claims["sub"]), claims["email"]
        if claims.get("purpose") != "verify-email":
            return None
    except (PyJWTError, KeyError, TypeError, ValueError):
        return None
    user = db.get(User, user_id)
    if not user or user.email_verified_at is not None or (user.email or "").lower() != email:
        return None
    return user


def usable_code(db: Session, user_id: int) -> PasswordResetOTP | None:
    return (db.query(PasswordResetOTP)
            .filter(PasswordResetOTP.user_id == user_id, PasswordResetOTP.purpose == PURPOSE,
                    PasswordResetOTP.used.is_(False), PasswordResetOTP.expires_at > _now(),
                    PasswordResetOTP.attempt_count < MAX_WRONG)
            .order_by(PasswordResetOTP.created_at.desc()).first())


def next_send_at(db: Session, user_id: int, now: datetime | None = None) -> datetime | None:
    """The earliest time another code may be sent, or None if one may be sent now."""
    now = now or _now()
    last = (db.query(func.max(EmailCodeSend.sent_at))
            .filter(EmailCodeSend.user_id == user_id, EmailCodeSend.purpose == PURPOSE).scalar())
    accepted = [t for (t,) in db.query(EmailCodeSend.sent_at)
                .filter(EmailCodeSend.user_id == user_id, EmailCodeSend.purpose == PURPOSE,
                        EmailCodeSend.accepted.is_(True), EmailCodeSend.sent_at > now - timedelta(hours=24))
                .order_by(EmailCodeSend.sent_at)]
    times = []
    if last and now - last < timedelta(seconds=COOLDOWN_SECONDS):
        times.append(last + timedelta(seconds=COOLDOWN_SECONDS))
    if len(accepted) >= DAILY_CAP:
        # the count drops below the cap when the oldest of the newest DAILY_CAP leaves the 24 h window
        times.append(accepted[len(accepted) - DAILY_CAP] + timedelta(hours=24))
    return max(times) if times else None


def _state(db: Session, user: User, result: str) -> dict:
    """What the Check your email page needs to show."""
    code = usable_code(db, user.id)
    nxt = next_send_at(db, user.id)
    limit = None
    if nxt:
        cooling = (db.query(func.count(EmailCodeSend.id))
                   .filter(EmailCodeSend.user_id == user.id, EmailCodeSend.purpose == PURPOSE,
                           EmailCodeSend.accepted.is_(True),
                           EmailCodeSend.sent_at > _now() - timedelta(hours=24)).scalar() or 0) >= DAILY_CAP
        limit = "daily" if cooling else "cooldown"
    return {"result": result, "email": user.email, "role": getattr(user.role, "value", user.role),
            "sent_at": code.created_at if code else None, "expires_at": code.expires_at if code else None,
            "next_send_at": nxt, "limit": limit, "minutes": VERIFY_CODE_MINUTES}


def request_code(db: Session, user: User, explicit: bool) -> dict:
    """Send a registration code if the rules allow. explicit=False (register, sign-in): reuse a usable code.
    explicit=True ("Send again"): replace it. Returns the page state; result is one of
    sent / reused / limited / send_failed / store_failed / verified."""
    db.commit()   # start clean: the lock below must be this transaction's first statement on the user
    locked = db.query(User).filter(User.id == user.id).with_for_update().one()
    if locked.email_verified_at is not None:
        db.commit()
        return {"result": "verified"}
    if not explicit and usable_code(db, locked.id):
        db.commit()
        return _state(db, locked, "reused")
    if next_send_at(db, locked.id):
        db.commit()
        return _state(db, locked, "limited")
    attempt = EmailCodeSend(user_id=locked.id, purpose=PURPOSE, sent_at=_now(), accepted=False)
    db.add(attempt)
    db.commit()                                   # 1. slot reserved; the lock is released
    attempt_id, email, first, username = attempt.id, locked.email, locked.first_name, locked.username

    code = f"{secrets.randbelow(1_000_000):06d}"
    try:                                          # 2. send
        send_email_now(email, *account_emails.verify_code(first, username, code, VERIFY_CODE_MINUTES))
    except MailNotSent:
        return _state(db, locked, "send_failed")

    db.query(EmailCodeSend).filter(EmailCodeSend.id == attempt_id).update({"accepted": True})
    db.commit()                                   # 3. it counts towards the cap

    try:                                          # 4. store the code
        from app.routers.auth import _code_hash   # one hash for every kind of code
        db.query(User).filter(User.id == locked.id).with_for_update().one()
        db.query(PasswordResetOTP).filter(PasswordResetOTP.user_id == locked.id,
                                          PasswordResetOTP.purpose == PURPOSE).delete(synchronize_session=False)
        db.add(PasswordResetOTP(user_id=locked.id, purpose=PURPOSE, otp_hash=_code_hash(locked.id, code, PURPOSE),
                                expires_at=_now() + timedelta(minutes=VERIFY_CODE_MINUTES)))
        db.commit()
    except Exception as e:   # noqa: BLE001 — any database failure here: the emailed code won't work, say so
        db.rollback()
        print(f"[verify] storing the code for user {locked.id} failed after the email was accepted: {e}")
        return _state(db, locked, "store_failed")
    return _state(db, locked, "sent")
