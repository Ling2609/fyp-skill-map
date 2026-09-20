from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
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
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UserCertification(Base):
    __tablename__ = "user_certifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    cert_name = Column(String(300), nullable=False)
    issuer = Column(String(200), nullable=False)
    mapped_skills = Column(ARRAY(String), nullable=False, default=[])
    created_at = Column(DateTime(timezone=True), server_default=func.now())