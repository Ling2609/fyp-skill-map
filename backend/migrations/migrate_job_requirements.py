"""
Run once for the employer's requirement fields (19 Oct 2026). Safe to rerun.

jobs.min_qualification, study_field, languages: what a SkillMap post asks for besides skills, chosen by the employer
in Post a Job (minimum qualification on the Malaysian Qualifications Framework names or the employer's own words,
field of study, languages from a list or typed under "Other").
Students see them as pills on Job Detail. Existing posts keep them empty (no pills).

Usage (from backend/):  python migrations/migrate_job_requirements.py
"""
import sys
sys.path.insert(0, ".")

from sqlalchemy import text
from app.database import engine

with engine.begin() as conn:
    for sql in (
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS min_qualification VARCHAR(80)",
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS study_field VARCHAR(200)",
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS languages JSON",
    ):
        conn.execute(text(sql))
print("jobs.min_qualification, study_field, languages: ready")
