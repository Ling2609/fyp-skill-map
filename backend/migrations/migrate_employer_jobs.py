"""
Run once to add jobs.closed_at (11 Oct, Employer flow batch 1): an employer closes one of their own job posts (it
leaves Job Matches at once) and can open it again. Running it twice changes nothing.
Usage (from backend/): python migrations/migrate_employer_jobs.py
"""
import sys
sys.path.append(".")

from app.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    conn.execute(text("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ"))
    conn.commit()
    print("Migration complete: closed_at column added to jobs.")
