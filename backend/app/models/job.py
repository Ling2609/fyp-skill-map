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
    formatted_description = Column(String, nullable=True)  # JSON array of bullet strings
    # Where the job came from
    source = Column(String, nullable=False, default="dataset", server_default="dataset")  # "dataset" (JobStreet 2024) or "live" (JSearch)
    source_url = Column(String, nullable=True)       # apply link (live jobs only)
    publisher = Column(String, nullable=True)        # e.g. LinkedIn, Hiredly (live jobs only)
    listing_date = Column(DateTime(timezone=True), nullable=True)
    country = Column(String(2), nullable=False, default="MY", server_default="MY")  # ISO code; stats use MY only
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class JobSkill(Base):
    __tablename__ = "job_skills"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    job_ref = Column(String, nullable=False)
    skill_name = Column(String, nullable=False)
    extracted_by = Column(String, default="openai/gpt-oss-120b")
    # Fix plan Stage 1 (migrate_add_job_skill_evidence.py); NULL for skills extracted before it
    evidence_quote = Column(String, nullable=True)   # words from the ad that mention the skill
    level = Column(String, nullable=True)            # required / preferred / trained / unspecified
    skill_type = Column(String, nullable=True)       # hard / soft
    match_score = Column(Float, nullable=True)       # quote vs ad text, 1.0 = exact
    alternative_group = Column(String, nullable=True)  # same label = the ad accepts any one of these
    created_at = Column(DateTime(timezone=True), server_default=func.now())