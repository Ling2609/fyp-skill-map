"""
Run once to add jobs.gone_at (6 Oct): set by fetch_live_jobs.py when the latest search results no longer return a
live job, so Job Matches shows only the latest ads. Running it twice changes nothing.
Usage (from backend/): python migrations/migrate_add_job_gone_at.py
"""
import sys
sys.path.append(".")

from app.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    conn.execute(text("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS gone_at TIMESTAMPTZ"))
    conn.commit()
    print("Migration complete: gone_at column added to jobs.")
