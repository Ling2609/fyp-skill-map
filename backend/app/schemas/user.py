from typing import Literal
from pydantic import BaseModel, EmailStr, field_validator
from app.models.user import UserRole

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
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if len(v.encode("utf-8")) > 72:  # bcrypt only accepts up to 72 bytes
            raise ValueError("Password must be at most 72 characters")
        return v

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