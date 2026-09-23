import enum
from sqlalchemy import Column, Integer, String, Enum, DateTime, Boolean, JSON
from sqlalchemy.sql import func
from app.database import Base

class UserRole(str, enum.Enum):
    student = "student"
    employer = "employer"
    admin = "admin"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.student)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_visible_to_employers = Column(Boolean, default=False, nullable=False)
    is_active               = Column(Boolean, default=True, nullable=False)
    notification_prefs      = Column(JSON, nullable=False, server_default='{}')