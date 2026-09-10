from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String, unique=True, index=True)
    job_title = Column(String, nullable=False)
    company = Column(String)
    location = Column(String)
    category = Column(String)
    subcategory = Column(String)
    salary = Column(String)
    description = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class JobSkill(Base):
    __tablename__ = "job_skills"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    job_ref = Column(String, nullable=False)
    skill_name = Column(String, nullable=False)
    extracted_by = Column(String, default="openai/gpt-oss-120b")
    created_at = Column(DateTime(timezone=True), server_default=func.now())