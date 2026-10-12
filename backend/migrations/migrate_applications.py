"""
Run once to add the applications table (11 Oct, Employer flow batch 2): a student applies to a job posted on
SkillMap, and the employer moves the application through Applied -> Shortlisted -> Accepted / Rejected.
Running it twice changes nothing.
Usage (from backend/): python migrations/migrate_applications.py
"""
import sys
sys.path.append(".")

from app.database import engine
from app.models import job, user  # noqa: F401  (the tables applications points at)
from app.models.application import Application

Application.__table__.create(bind=engine, checkfirst=True)
print("Migration complete: applications table ready.")
