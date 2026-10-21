"""
Run once for more evidence on the profile (21 Oct, references.md "What employers look for in graduates").
Safe to rerun.

1. users: languages, cgpa, show_cgpa
2. user_projects: role, team_size, outcome, demo_url
3. new table user_experiences (work experience and activities, with their skills)

Usage (from backend/):  python migrations/migrate_profile_more_evidence.py
"""
import sys
sys.path.insert(0, ".")

from sqlalchemy import text
from app.database import engine
from app.models.user import User  # noqa: F401  (user_experiences points at users, so that table must be known)
from app.models.profile import UserExperience

COLUMNS = {
    "users": ["languages JSON NOT NULL DEFAULT '[]'", "cgpa NUMERIC(3,2)", "show_cgpa BOOLEAN NOT NULL DEFAULT false"],
    "user_projects": ["role VARCHAR(80)", "team_size INTEGER", "outcome VARCHAR(300)", "demo_url VARCHAR(500)"],
}

with engine.begin() as conn:
    for table, columns in COLUMNS.items():
        for column in columns:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column}"))
            print(f"{table}.{column.split()[0]}: ok")

UserExperience.__table__.create(bind=engine, checkfirst=True)
print("user_experiences table: ok")
print("Done. Start the backend again.")
