import re
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserRegister, UserLogin, UserOut, Token
from app.auth.utils import hash_password, verify_password, create_access_token, decode_token

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
    try:
        payload = decode_token(token)
        user_id = int(payload.get("sub"))
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


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

    # Check uniqueness
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if db.query(User).filter(User.username == payload.username.lower()).first():
        raise HTTPException(status_code=400, detail="Username already taken")

    user = User(
        username=payload.username.lower(),  # store lowercase
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return {"access_token": token, "token_type": "bearer"}
