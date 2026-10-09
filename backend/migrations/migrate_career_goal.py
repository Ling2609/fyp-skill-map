"""
Run once for the career goal (9 Oct). Safe to rerun.

users.target_category: the job category the student is working towards (one of the ICT categories every job ad
carries, e.g. "Developers/Programmers"); empty = "Open to all ICT roles". Steers the Dashboard and the category Job
Matches opens on.

Usage (from backend/):  python migrations/migrate_career_goal.py
"""
import sys
sys.path.insert(0, ".")

from sqlalchemy import text
from app.database import engine

with engine.begin() as conn:
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS target_category VARCHAR(80)"))
print("users.target_category: ok")
print("Done. Start the backend again.")
