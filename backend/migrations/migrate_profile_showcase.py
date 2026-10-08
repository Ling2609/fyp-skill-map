"""
Run once for the showcase profile (8 Oct, Mr Au: portfolio, LinkedIn and awards on one profile). Safe to rerun.

1. users: headline, about, linkedin_url, portfolio_url, github_url, show_grades_to_employers
2. new table user_awards (honours and awards, with their skills)

Usage (from backend/):  python migrations/migrate_profile_showcase.py
"""
import sys
sys.path.insert(0, ".")

from sqlalchemy import text
from app.database import engine
from app.models.user import User  # noqa: F401  (user_awards points at users, so that table must be known)
from app.models.profile import UserAward

COLUMNS = [
    "headline VARCHAR(120)",
    "about TEXT",
    "linkedin_url VARCHAR(300)",
    "portfolio_url VARCHAR(300)",
    "github_url VARCHAR(300)",
    "show_grades_to_employers BOOLEAN NOT NULL DEFAULT false",
]

with engine.begin() as conn:
    for column in COLUMNS:
        conn.execute(text(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {column}"))
        print(f"users.{column.split()[0]}: ok")

UserAward.__table__.create(bind=engine, checkfirst=True)
print("user_awards table: ok")
print("Done. Start the backend again.")
