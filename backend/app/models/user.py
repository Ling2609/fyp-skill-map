import enum
from sqlalchemy import Column, Integer, String, Enum, DateTime, Boolean, JSON, ForeignKey, Text
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
    # Set when the password is changed or reset; sign-in tokens issued under an older password are refused
    # (4 Oct, migrations/migrate_account_security.py)
    password_changed_at     = Column(DateTime(timezone=True), nullable=True)
    # Admin + Employer flows (7 Oct, migrations/migrate_admin_structure.py)
    programme_id    = Column(Integer, ForeignKey("programmes.id", ondelete="SET NULL"), nullable=True)  # students
    intake_id       = Column(Integer, ForeignKey("intakes.id", ondelete="SET NULL"), nullable=True)     # students
    company_name    = Column(String(120), nullable=True)                                                 # employers
    employer_status = Column(String(10), nullable=True)   # employers: pending / approved / rejected (by Admin)
    # Showcase profile (8 Oct, Mr Au): shown on My Profile and to employers (migrations/migrate_profile_showcase.py)
    headline      = Column(String(120), nullable=True)   # one line, e.g. "Final-year Software Engineering student"
    about         = Column(Text, nullable=True)          # a short paragraph about the student
    linkedin_url  = Column(String(300), nullable=True)
    portfolio_url = Column(String(300), nullable=True)
    github_url    = Column(String(300), nullable=True)
    show_grades_to_employers = Column(Boolean, default=False, nullable=False, server_default="false")

# Load the tables users point at (programmes, intakes), so any script that saves a User works on its own (7 Oct)
from app.models import programme  # noqa: E402,F401
