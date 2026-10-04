import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.password_reset import PasswordResetOTP
from app.models.user import User, UserRole
from app.schemas.user import (EmailChange, ForgotPasswordIn, NameUpdate, PasswordChange, ResetPasswordIn, Token,
                              UserLogin, UserOut, UserRegister, VerifyCodeIn)
from app.auth.utils import hash_password, verify_password, create_access_token, decode_token
from app.config import settings
from app.services.mailer import send_email

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


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    # Only a bad/expired token is a 401. A database error must NOT look like
    # "session expired", or the frontend would log the user out for a server problem.
    try:
        payload = decode_token(token)
        user_id = int(payload.get("sub"))
    except (JWTError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


# ── Account settings (4 Oct) ──────────────────────────────────────────────────
# A wrong current password is a 400, not a 401: the frontend logs the user out on any 401 (api.js).
# Username is not changeable (it is the login name). Email changes need the current password; a real product would
# also send a confirmation email, which SkillMap has no mail service for (stated as a limitation in the report).

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


@router.put("/me/email", response_model=UserOut)
def change_email(payload: EmailChange, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _check_current_password(current_user, payload.current_password)
    email = payload.new_email.strip().lower()   # stored in lower case, as at register (F13)
    if email == (current_user.email or "").lower():
        raise HTTPException(status_code=400, detail="This is already your email")
    taken = db.query(User).filter(func.lower(User.email) == email, User.id != current_user.id).first()
    if taken:
        raise HTTPException(status_code=400, detail="Email already registered")
    current_user.email = email
    db.commit()
    db.refresh(current_user)
    return current_user


@router.put("/me/password", status_code=204)
def change_password(payload: PasswordChange, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _check_current_password(current_user, payload.current_password)
    if verify_password(payload.new_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="New password must be different from the current one")
    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()


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

    user = User(
        username=payload.username.lower(),  # store lowercase
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        email=email,
        hashed_password=hash_password(payload.password),
        role=UserRole(payload.role),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    # Try email first, then username; both case-insensitive (usernames are stored in lower case, emails compared
    # with lower() so accounts saved before this fix still match)
    ident = payload.email.strip().lower()
    user = db.query(User).filter(func.lower(User.email) == ident).first()
    if not user:
        user = db.query(User).filter(User.username == ident).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return {"access_token": token, "token_type": "bearer"}


# ── Forgot password (4 Oct; OWASP Forgot Password Cheat Sheet, references.md) ──────────────────────────────────
# A 6-digit code is emailed to the account's address. Same reply whether or not the account exists (no user
# enumeration); the email is sent in the background so both cases take the same time. Code: from `secrets`,
# stored only as an HMAC (keyed with SECRET_KEY, so a leaked table can't be brute-forced offline), valid 15 min,
# single use, 5 wrong tries max, at most one new code a minute per account. Three steps (her request, 4 Oct): the code
# is checked first (/verify-reset-code) and returns a 10-minute reset pass; only then is the new password set.
# The pass is a JWT signed with a DIFFERENT key from login tokens, so it can never be used to log in, and it dies
# when its code is used. Known limit: logins already open on other devices stay valid until their token expires.
RESET_CODE_MINUTES = 15
RESET_MAX_ATTEMPTS = 5
RESET_RESEND_SECONDS = 60
FORGOT_REPLY = {"message": "If an account exists, a 6-digit code has been sent to its email address."}
INVALID_CODE = "Wrong or expired code."
RESET_PASS_MINUTES = 10
EXPIRED_PASS = "This reset has expired. Please start again."


def _reset_key() -> str:
    return settings.secret_key + "|password-reset"   # not the login-token key


def _code_hash(user_id: int, code: str) -> str:
    return hmac.new(settings.secret_key.encode(), f"{user_id}:{code}".encode(), hashlib.sha256).hexdigest()


def _find_user(identifier: str, db: Session) -> User | None:
    ident = identifier.strip().lower()   # username or email, any case (as at login)
    return (db.query(User).filter(func.lower(User.email) == ident).first()
            or db.query(User).filter(User.username == ident).first())


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordIn, background: BackgroundTasks, db: Session = Depends(get_db)):
    user = _find_user(payload.identifier, db)
    if not user:
        return FORGOT_REPLY
    now = datetime.now(timezone.utc)
    latest = (db.query(PasswordResetOTP).filter(PasswordResetOTP.user_id == user.id)
              .order_by(PasswordResetOTP.created_at.desc()).first())
    if latest and latest.created_at and now - latest.created_at < timedelta(seconds=RESET_RESEND_SECONDS):
        return FORGOT_REPLY   # asked again within a minute: no new email (stops inbox flooding)
    db.query(PasswordResetOTP).filter(PasswordResetOTP.user_id == user.id, PasswordResetOTP.used.is_(False)) \
        .update({PasswordResetOTP.used: True})   # only the newest code works
    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(PasswordResetOTP(user_id=user.id, otp_hash=_code_hash(user.id, code),
                            expires_at=now + timedelta(minutes=RESET_CODE_MINUTES)))
    db.commit()
    background.add_task(
        send_email, user.email, "Your SkillMap password reset code",
        f"Hi {user.first_name},\n\nYour code to reset your SkillMap password is: {code}\n\n"
        f"It expires in {RESET_CODE_MINUTES} minutes and works once. If you didn't ask for this, ignore this email: "
        "your password stays the same.\n\nSkillMap")
    return FORGOT_REPLY


@router.post("/verify-reset-code")
def verify_reset_code(payload: VerifyCodeIn, db: Session = Depends(get_db)):
    user = _find_user(payload.identifier, db)
    if not user:
        raise HTTPException(status_code=400, detail=INVALID_CODE)
    otp = (db.query(PasswordResetOTP)
           .filter(PasswordResetOTP.user_id == user.id, PasswordResetOTP.used.is_(False),
                   PasswordResetOTP.expires_at > datetime.now(timezone.utc))
           .order_by(PasswordResetOTP.created_at.desc()).first())
    if not otp:
        raise HTTPException(status_code=400, detail=INVALID_CODE)
    if otp.attempt_count >= RESET_MAX_ATTEMPTS:
        otp.used = True
        db.commit()
        raise HTTPException(status_code=400, detail="Too many wrong tries. Resend a new code.")
    if not hmac.compare_digest(otp.otp_hash, _code_hash(user.id, payload.code.strip())):
        otp.attempt_count += 1
        db.commit()
        raise HTTPException(status_code=400, detail=INVALID_CODE)
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
    if not otp or not user or otp.user_id != user.id or otp.used:   # used = already reset, or a newer code was sent
        raise HTTPException(status_code=400, detail=EXPIRED_PASS)
    user.hashed_password = hash_password(payload.new_password)
    otp.used = True
    db.commit()
    background.add_task(
        send_email, user.email, "Your SkillMap password was changed",
        f"Hi {user.first_name},\n\nYour SkillMap password was just changed. If this wasn't you, reset it again "
        "straight away with \"Forgot password?\" on the login page.\n\nSkillMap")
