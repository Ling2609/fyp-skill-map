"""
Run once for employer details (20 Nov 2026). Safe to rerun.

users.company_website, users.company_ssm: what an employer gives at sign-up so the career office can check the
company is real before approving it. Required at sign-up from now on; the columns allow empty only because
accounts made before this date have none.

Usage (from backend/):  python migrations/migrate_employer_details.py
"""
import sys
sys.path.insert(0, ".")

from sqlalchemy import text
from app.database import engine

with engine.begin() as conn:
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS company_website VARCHAR(200)"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS company_ssm VARCHAR(20)"))
print("users.company_website, company_ssm: ok")
print("Done. Start the backend again.")
