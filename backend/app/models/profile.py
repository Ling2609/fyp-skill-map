from sqlalchemy import JSON, Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.sql import func
from app.database import Base


class UserProject(Base):
    __tablename__ = "user_projects"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    github_url = Column(String(500), nullable=True)
    extracted_skills = Column(ARRAY(String), nullable=False, default=[])
    # skill -> the words from the student's description that show it (4 Oct; migrate_profile_skill_evidence.py).
    # Projects added before have {} (no quotes shown).
    skill_quotes = Column(JSON, nullable=False, default=dict, server_default='{}')
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UserCertification(Base):
    __tablename__ = "user_certifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    cert_name = Column(String(300), nullable=False)
    issuer = Column(String(200), nullable=False)
    mapped_skills = Column(ARRAY(String), nullable=False, default=[])
    # "listed" = typed by the student from the certificate; "estimated" = guessed by the AI from the name (4 Oct).
    # NULL = added before 4 Oct (guessed, shown as estimated)
    skills_source = Column(String(10), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())