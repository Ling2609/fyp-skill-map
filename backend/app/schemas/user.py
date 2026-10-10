import re
from typing import Literal
from pydantic import BaseModel, EmailStr, Field, field_validator
from app.models.user import UserRole
from app.services.password_policy import MAX_BYTES, MIN_LENGTH

NAME_PATTERN = re.compile(r"^[a-zA-Z\s\-']+$")   # same rule as the Register page


def check_password(v: str) -> str:
    """Length only, so a bad request is refused before the router runs. The numbers come from
    app/services/password_policy.py, the one place the password rule lives (the router adds the common-password check)."""
    if len(v) < MIN_LENGTH:
        raise ValueError(f"Use at least {MIN_LENGTH} characters")
    if len(v.encode("utf-8")) > MAX_BYTES:  # bcrypt only accepts up to 72 bytes
        raise ValueError(f"Please use a shorter password (up to {MAX_BYTES} characters)")
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
    company_name: str | None = Field(default=None, max_length=120)   # employers (7 Oct)

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
    # 7 Oct: the employer's approval state and the student's programme/intake (the setup step reads them)
    company_name: str | None = None
    employer_status: str | None = None
    programme_id: int | None = None
    intake_id: int | None = None
    target_category: str | None = None    # 9 Oct: career goal (empty = open to all ICT roles)
    # 10 Oct: a student with no programme, or no intake while their programme has intakes, is sent to the setup step
    needs_study: bool = False

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


class EmailCodeIn(BaseModel):
    code: str                  # the 6-digit code sent to the new address


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


class VerifyCodeIn(BaseModel):
    identifier: str
    code: str


class ResetPasswordIn(BaseModel):
    reset_token: str           # from /auth/verify-reset-code: proves the code was checked
    new_password: str

    @field_validator("new_password")
    @classmethod
    def valid_password(cls, v: str) -> str:
        return check_password(v)
