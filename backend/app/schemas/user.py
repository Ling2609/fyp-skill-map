import re
from typing import Literal
from pydantic import BaseModel, EmailStr, field_validator
from app.models.user import UserRole

NAME_PATTERN = re.compile(r"^[a-zA-Z\s\-']+$")   # same rule as the Register page


def check_password(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters")
    if len(v.encode("utf-8")) > 72:  # bcrypt only accepts up to 72 bytes
        raise ValueError("Password is too long (max 72 bytes, e.g. 72 English letters)")
    return v


def check_name(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("This field is required")
    if len(v) > 50:
        raise ValueError("Must be under 50 characters")
    if not NAME_PATTERN.match(v):
        raise ValueError("Only letters, spaces, hyphens and apostrophes allowed")
    return v


class UserRegister(BaseModel):
    username: str
    first_name: str
    last_name: str
    email: EmailStr
    password: str
    # Only these two can be chosen at sign-up. Admin accounts are created by the seed script.
    role: Literal["student", "employer"] = "student"

    @field_validator("password")
    @classmethod
    def check_password_length(cls, v: str) -> str:
        return check_password(v)

class UserLogin(BaseModel):
    email: str
    password: str

class UserOut(BaseModel):
    id: int
    username: str
    first_name: str
    last_name: str
    email: str
    role: UserRole

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str


# ── Account settings (4 Oct) ──────────────────────────────────────────────────

class NameUpdate(BaseModel):
    first_name: str
    last_name: str

    @field_validator("first_name", "last_name")
    @classmethod
    def valid_name(cls, v: str) -> str:
        return check_name(v)


class EmailChange(BaseModel):
    new_email: EmailStr
    current_password: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def valid_password(cls, v: str) -> str:
        return check_password(v)


# ── Forgot password (4 Oct) ───────────────────────────────────────────────────

class ForgotPasswordIn(BaseModel):
    identifier: str            # username or email, as on the login page


class ResetPasswordIn(BaseModel):
    identifier: str
    code: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def valid_password(cls, v: str) -> str:
        return check_password(v)
