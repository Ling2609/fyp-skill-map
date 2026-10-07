import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import func, inspect, or_
from sqlalchemy.orm import Session
from app.database import SessionLocal, engine, get_db
from app.models.login_throttle import LoginThrottle
from app.models.password_reset import PasswordResetOTP
from app.models.user import User, UserRole
from app.schemas.user import (EmailChange, EmailCodeIn, ForgotPasswordIn, NameUpdate, PasswordChange, ResetPasswordIn,
                              Token, UserLogin, UserOut, UserRegister, VerifyCodeIn)
from app.auth.utils import hash_password, verify_password, create_access_token, decode_token
from app.config import settings
from app.services import account_emails
from app.services.mailer import send_email
from app.services.password_policy import common_passwords, password_problem

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# Reserved usernames that cannot be registered
RESERVED_USERNAMES = {
    'admin', 'administrator', 'support', 'help', 'root', 'system',
    'moderator', 'mod', 'staff', 'official', 'skillmap', 'api',
    'login', 'register', 'logout', 'dashboard', 'profile', 'settings',
    'null', 'undefined', 'anonymous', 'guest', 'user', 'test',
}

USERNAME_REGEX = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9._]{1,28}[a-zA-Z0-9]$')
EMAIL_SHAPE = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')   # something@something.something


def validate_username_format(username: str) -> tuple[bool, str]:
    """Validate username format. Returns (is_valid, error_message)."""
    if len(username) < 3:
        return False, "Username must be at least 3 characters"
    if len(username) > 30:
        return False, "Username must be under 30 characters"
    if not re.match(r'^[a-zA-Z0-9]', username):
        return False, "Username must start with a letter or number"
    if not re.match(r'.*[a-zA-Z0-9]$', username):
        return False, "Username must end with a letter or number"
    if not re.match(r'^[a-zA-Z0-9._]+$', username):
        return False, "Username can only contain letters, numbers, dots and underscores"
    if username.lower() in RESERVED_USERNAMES:
        return False, "This username is reserved"
    return True, ""


# Signing out other devices after a password change or reset (4 Oct). Every sign-in token carries a stamp of the
# password it was issued under ("pwd" = users.password_changed_at in microseconds, 0 if never changed). A change
# moves the stamp, so older tokens no longer match and are refused. An exact match instead of comparing the token's
# issue time (iat, whole seconds) with the change time: no rounding window where an old token from the same second
# still works or a new one is refused. The device that made the change gets a fresh token with the new stamp.
SIGNED_OUT = "Your password was changed. Please sign in again."
DEACTIVATED = "This account has been deactivated. Please contact the career office."


def _pw_stamp(user: User) -> int:
    changed = user.password_changed_at
    return int(changed.timestamp() * 1_000_000) if changed else 0


def _login_token(user: User) -> str:
    return create_access_token({"sub": str(user.id), "role": user.role, "pwd": _pw_stamp(user)})


def _password_changed(user: User):
    """Call after setting a new password hash, before commit."""
    user.password_changed_at = datetime.now(timezone.utc)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    # Only a bad/expired token is a 401. A database error must NOT look like
    # "session expired", or the frontend would log the user out for a server problem.
    try:
        payload = decode_token(token)
        user_id = int(payload.get("sub"))
        stamp = int(payload.get("pwd", 0))   # tokens from before 4 Oct have none: valid until the first change
    except (JWTError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if stamp != _pw_stamp(user):
        raise HTTPException(status_code=401, detail=SIGNED_OUT)
    if not user.is_active:   # deactivated by Admin (7 Oct): signed out on the next request
        raise HTTPException(status_code=401, detail=DEACTIVATED)
    return user


def check_account_schema():
    """Start-up check: the 4 Oct columns must exist, otherwise every sign-in would fail with a database error."""
    columns = {c["name"] for c in inspect(engine).get_columns("users")}
    otp_columns = {c["name"] for c in inspect(engine).get_columns("password_reset_otps")}
    if "password_changed_at" not in columns or "purpose" not in otp_columns:
        raise RuntimeError("Database not updated: run  python migrations/migrate_account_security.py  "
                           "from the backend folder, then start the backend again.")


def delete_old_codes():
    """Start-up tidy: used or expired codes are never needed again."""
    db = SessionLocal()
    try:
        db.query(PasswordResetOTP).filter(or_(PasswordResetOTP.used.is_(True),
                                              PasswordResetOTP.expires_at < datetime.now(timezone.utc))) \
            .delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


# ── Account settings (4 Oct) ──────────────────────────────────────────────────
# A wrong current password is a 400, not a 401: the frontend logs the user out on any 401 (api.js).
# Username is not changeable (it is the login name). Changing the email needs the current password AND a code sent
# to the new address; the email only changes once the code is entered, then the old address gets a notice
# (OWASP: confirm a new email before using it; notify the old one).

def _check_new_password(password: str, username: str, email: str):
    """One rule for Register, Account settings and Forgot password (app/services/password_policy.py)."""
    problem = password_problem(password, username, email)
    if problem:
        raise HTTPException(status_code=400, detail=problem)


def _check_current_password(user: User, password: str):
    if not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")


@router.patch("/me", response_model=UserOut)
def update_name(payload: NameUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    current_user.first_name = payload.first_name
    current_user.last_name = payload.last_name
    db.commit()
    db.refresh(current_user)
    return current_user


def _email_taken(email: str, user: User, db: Session) -> bool:
    return db.query(User).filter(func.lower(User.email) == email, User.id != user.id).first() is not None


@router.put("/me/email")
def change_email(payload: EmailChange, background: BackgroundTasks, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)):
    """Step 1: checks the password and the new address, then emails a code to the NEW address. Nothing changes yet."""
    _check_current_password(current_user, payload.current_password)
    email = payload.new_email.strip().lower()   # stored in lower case, as at register (F13)
    if email == (current_user.email or "").lower():
        raise HTTPException(status_code=400, detail="This is already your email")
    if _email_taken(email, current_user, db):
        raise HTTPException(status_code=400, detail="Email already registered")
    code = _issue_code(current_user, "email", db, new_email=email)
    if code is None:   # signed in, so saying why is safe
        raise HTTPException(status_code=429, detail="A code was just sent. Wait a minute before asking for another.")
    background.add_task(send_email, email, *account_emails.email_code(
        current_user.first_name, current_user.username, code, RESET_CODE_MINUTES))
    return {"message": "Code sent", "new_email": email}


@router.post("/me/email/verify", response_model=UserOut)
def verify_email_change(payload: EmailCodeIn, background: BackgroundTasks, db: Session = Depends(get_db),
                        current_user: User = Depends(get_current_user)):
    """Step 2: the right code moves the account to the new address and tells the old one."""
    otp = _check_code(current_user, "email", payload.code, db)
    if _email_taken(otp.new_email, current_user, db):   # someone registered it in the meantime
        otp.used = True
        db.commit()
        raise HTTPException(status_code=400, detail="Email already registered")
    old_email = current_user.email
    current_user.email = otp.new_email
    otp.used = True
    db.commit()
    db.refresh(current_user)
    background.add_task(send_email, old_email, *account_emails.email_changed(
        current_user.first_name, current_user.username, current_user.email))
    return current_user


@router.put("/me/password", response_model=Token)
def change_password(payload: PasswordChange, background: BackgroundTasks, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    """Signs out every other device (their tokens carry the old stamp); this one gets a new token."""
    _check_current_password(current_user, payload.current_password)
    if verify_password(payload.new_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="New password must be different from the current one")
    _check_new_password(payload.new_password, current_user.username, current_user.email)
    current_user.hashed_password = hash_password(payload.new_password)
    _password_changed(current_user)
    db.commit()
    db.refresh(current_user)
    background.add_task(send_email, current_user.email, *account_emails.password_changed(
        current_user.first_name, current_user.username))
    return {"access_token": _login_token(current_user), "token_type": "bearer"}


@router.get("/common-passwords", response_class=PlainTextResponse)
def get_common_passwords():
    """The public blocklist (SecLists top 10,000), so the meter can say "too common" while typing without the
    password ever leaving the browser before Save. The server still checks on save."""
    return PlainTextResponse("\n".join(sorted(common_passwords())), headers={"Cache-Control": "public, max-age=86400"})


@router.get("/check-username/{username}")
def check_username(username: str, db: Session = Depends(get_db)):
    """
    Check if a username is available and valid.
    Returns { available: bool, message: str }
    """
    # Validate format first
    is_valid, error = validate_username_format(username)
    if not is_valid:
        return {"available": False, "message": error}

    # Check uniqueness (case-insensitive)
    existing = db.query(User).filter(
        User.username == username.lower()
    ).first()
    if existing:
        return {"available": False, "message": "Username already taken"}

    return {"available": True, "message": "Username is available"}


@router.post("/register", response_model=UserOut, status_code=201)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    # Validate username format
    is_valid, error = validate_username_format(payload.username)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error)

    # Check first name and last name
    if len(payload.first_name.strip()) < 1:
        raise HTTPException(status_code=400, detail="First name is required")
    if len(payload.last_name.strip()) < 1:
        raise HTTPException(status_code=400, detail="Last name is required")

    # Check uniqueness. Emails are stored and compared in lower case: the email validator already lowercases the
    # domain, so "Ann@Example.com" was stored as "Ann@example.com" and could not log in with what she typed (F13)
    email = payload.email.strip().lower()
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if db.query(User).filter(User.username == payload.username.lower()).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    _check_new_password(payload.password, payload.username, email)

    user = User(
        username=payload.username.lower(),  # store lowercase
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        email=email,
        hashed_password=hash_password(payload.password),
        role=UserRole(payload.role),
    )
    if payload.role == "employer":   # Admin approves employers before they can post jobs (7 Oct)
        user.employer_status = "pending"
        user.company_name = (payload.company_name or "").strip() or None
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# Failed sign-ins (4 Oct; NIST SP 800-63B: limit failed attempts; OWASP Authentication Cheat Sheet): counted per
# (what was typed, IP address). 10 wrong passwords -> that pair paused for 15 minutes, even with the right password;
# a password reset lifts it. Unknown names are counted and answered exactly like real accounts, and the password is
# checked against a dummy hash so both take the same time: the replies reveal nothing about which accounts exist.
# Per IP, so someone guessing from their own machine doesn't pause the owner's sign-in from hers. Limit: an
# attacker with many IP addresses can still guess 10 per address (reduces, doesn't remove, guessing and lock-outs).
MAX_FAILED_LOGINS = 10
LOCK_MINUTES = 15
_DUMMY_HASH = hash_password("not-a-real-password-just-for-timing")


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"   # not X-Forwarded-For: anyone can fake that


@router.post("/login", response_model=Token)
def login(payload: UserLogin, request: Request, db: Session = Depends(get_db)):
    # Try email first, then username; both case-insensitive (usernames are stored in lower case, emails compared
    # with lower() so accounts saved before this fix still match)
    ident = payload.email.strip().lower()
    user = db.query(User).filter(func.lower(User.email) == ident).first()
    if not user:
        user = db.query(User).filter(User.username == ident).first()
    now = datetime.now(timezone.utc)
    key = user.username if user else ident   # username and email of one account share one count
    throttle = db.get(LoginThrottle, (key, _client_ip(request)))
    if throttle and throttle.locked_until and throttle.locked_until > now:
        minutes = max(1, -(-int((throttle.locked_until - now).total_seconds()) // 60))
        raise HTTPException(status_code=429, detail=f"Too many failed sign-ins. Try again in {minutes} "
                            f"minute{'s' if minutes != 1 else ''}, or reset your password.")
    password_ok = verify_password(payload.password, user.hashed_password if user else _DUMMY_HASH)
    if not user or not password_ok:
        throttle = throttle or LoginThrottle(identifier=key, ip=_client_ip(request), failed_count=0)
        throttle.failed_count = (throttle.failed_count or 0) + 1
        if throttle.failed_count >= MAX_FAILED_LOGINS:
            throttle.failed_count = 0
            throttle.locked_until = now + timedelta(minutes=LOCK_MINUTES)
        db.add(throttle)
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if throttle:
        db.delete(throttle)   # a successful sign-in clears the count
        db.commit()
    if not user.is_active:   # told only after the right password, so it reveals nothing to a guesser
        raise HTTPException(status_code=403, detail=DEACTIVATED)
    return {"access_token": _login_token(user), "token_type": "bearer"}


# ── Forgot password (4 Oct; OWASP Forgot Password Cheat Sheet, references.md) ──────────────────────────────────
# A 6-digit code is emailed to the account's address. Same reply whether or not the account exists (no user
# enumeration); the email is sent in the background so both cases take the same time. Code: from `secrets`,
# stored only as an HMAC (keyed with SECRET_KEY, so a leaked table can't be brute-forced offline), valid 15 min,
# single use, 5 wrong tries max, at most one new code a minute per account. Three steps (her request, 4 Oct): the code
# is checked first (/verify-reset-code) and returns a 10-minute reset pass; only then is the new password set.
# The pass is a JWT signed with a DIFFERENT key from login tokens, so it can never be used to log in, and it dies
# when its code is used. A reset signs out every device (password stamp, see get_current_user).
# The same code rules confirm a new email address (purpose "email", Account settings).
RESET_CODE_MINUTES = 15
RESET_MAX_ATTEMPTS = 5
RESET_RESEND_SECONDS = 60
FORGOT_REPLY = {"message": "If an account exists, a 6-digit code has been sent to its email address."}
INVALID_CODE = "Wrong or expired code."
RESET_PASS_MINUTES = 10
EXPIRED_PASS = "This reset has expired. Please start again."


def _reset_key() -> str:
    return settings.secret_key + "|password-reset"   # not the login-token key


def _code_hash(user_id: int, code: str, purpose: str) -> str:
    # purpose in the hash: a password-reset code can never confirm an email change, or the other way round
    return hmac.new(settings.secret_key.encode(), f"{purpose}:{user_id}:{code}".encode(), hashlib.sha256).hexdigest()


def _issue_code(user: User, purpose: str, db: Session, new_email: str | None = None) -> str | None:
    """New 6-digit code for this user and purpose; None if one was sent less than a minute ago.
    Older codes of the same purpose are deleted: only the newest works, and old rows don't pile up."""
    now = datetime.now(timezone.utc)
    mine = db.query(PasswordResetOTP).filter(PasswordResetOTP.user_id == user.id, PasswordResetOTP.purpose == purpose)
    latest = mine.order_by(PasswordResetOTP.created_at.desc()).first()
    if latest and latest.created_at and now - latest.created_at < timedelta(seconds=RESET_RESEND_SECONDS):
        return None
    mine.delete(synchronize_session=False)
    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(PasswordResetOTP(user_id=user.id, purpose=purpose, new_email=new_email,
                            otp_hash=_code_hash(user.id, code, purpose),
                            expires_at=now + timedelta(minutes=RESET_CODE_MINUTES)))
    db.commit()
    return code


def _check_code(user: User, purpose: str, code: str, db: Session) -> PasswordResetOTP:
    """The user's current code for this purpose if `code` matches it; otherwise 400 (wrong tries are counted)."""
    otp = (db.query(PasswordResetOTP)
           .filter(PasswordResetOTP.user_id == user.id, PasswordResetOTP.purpose == purpose,
                   PasswordResetOTP.used.is_(False), PasswordResetOTP.expires_at > datetime.now(timezone.utc))
           .order_by(PasswordResetOTP.created_at.desc()).first())
    if not otp:
        raise HTTPException(status_code=400, detail=INVALID_CODE)
    if otp.attempt_count >= RESET_MAX_ATTEMPTS:
        otp.used = True
        db.commit()
        raise HTTPException(status_code=400, detail="Too many wrong tries. Resend a new code.")
    if not hmac.compare_digest(otp.otp_hash, _code_hash(user.id, code.strip(), purpose)):
        otp.attempt_count += 1
        db.commit()
        raise HTTPException(status_code=400, detail=INVALID_CODE)
    return otp


def _find_user(identifier: str, db: Session) -> User | None:
    ident = identifier.strip().lower()   # username or email, any case (as at login)
    return (db.query(User).filter(func.lower(User.email) == ident).first()
            or db.query(User).filter(User.username == ident).first())


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordIn, background: BackgroundTasks, db: Session = Depends(get_db)):
    # Format only (4 Oct): reveals nothing about which accounts exist, but stops typos like "qwertyjkl;"
    ident = payload.identifier.strip()
    if not (EMAIL_SHAPE.match(ident) or USERNAME_REGEX.match(ident)):
        raise HTTPException(status_code=400, detail="Enter a valid username or email")
    user = _find_user(ident, db)
    if not user:
        return FORGOT_REPLY
    code = _issue_code(user, "reset", db)
    if code is None:
        return FORGOT_REPLY   # asked again within a minute: no new email (stops inbox flooding)
    background.add_task(send_email, user.email, *account_emails.reset_code(
        user.first_name, user.username, code, RESET_CODE_MINUTES))
    return FORGOT_REPLY


@router.post("/verify-reset-code")
def verify_reset_code(payload: VerifyCodeIn, db: Session = Depends(get_db)):
    user = _find_user(payload.identifier, db)
    if not user:
        raise HTTPException(status_code=400, detail=INVALID_CODE)
    otp = _check_code(user, "reset", payload.code, db)
    reset_pass = jwt.encode({"sub": str(user.id), "otp": otp.id,
                             "exp": datetime.now(timezone.utc) + timedelta(minutes=RESET_PASS_MINUTES)},
                            _reset_key(), algorithm=settings.algorithm)
    return {"reset_token": reset_pass}


@router.post("/reset-password", status_code=204)
def reset_password(payload: ResetPasswordIn, background: BackgroundTasks, db: Session = Depends(get_db)):
    try:
        claims = jwt.decode(payload.reset_token, _reset_key(), algorithms=[settings.algorithm])
        user_id, otp_id = int(claims["sub"]), int(claims["otp"])
    except (JWTError, KeyError, TypeError, ValueError):
        raise HTTPException(status_code=400, detail=EXPIRED_PASS)
    otp = db.query(PasswordResetOTP).filter(PasswordResetOTP.id == otp_id).first()
    user = db.query(User).filter(User.id == user_id).first()
    if (not otp or not user or otp.user_id != user.id or otp.purpose != "reset"
            or otp.used):   # used = already reset; a newer code deletes this row
        raise HTTPException(status_code=400, detail=EXPIRED_PASS)
    _check_new_password(payload.new_password, user.username, user.email)
    user.hashed_password = hash_password(payload.new_password)
    _password_changed(user)   # signs out every device
    otp.used = True
    # owner proved access: lift sign-in pauses on her account, from any IP
    db.query(LoginThrottle).filter(LoginThrottle.identifier == user.username).delete(synchronize_session=False)
    db.commit()
    background.add_task(send_email, user.email, *account_emails.password_changed(user.first_name, user.username))
