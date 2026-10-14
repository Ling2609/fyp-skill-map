"""
Run once for personal data (14 Oct 2026). Safe to rerun.

users.phone, users.city, users.available_from: contact details a student may add; an employer sees them (and the
email) only after shortlisting the student. users.privacy_accepted_at: when the privacy notice was accepted at
sign-up (accounts made before this date have none).

Usage (from backend/):  python migrations/migrate_privacy_contact.py
"""
import sys
sys.path.insert(0, ".")

from sqlalchemy import text
from app.database import engine

with engine.begin() as conn:
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30)"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(80)"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS available_from VARCHAR(7)"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ"))
print("users.phone, city, available_from, privacy_accepted_at: ok")
print("Done. Start the backend again.")
