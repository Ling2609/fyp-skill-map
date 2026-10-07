"""
Run once to add users.last_login_at (7 Oct): the time of each account's last successful sign-in, shown on Admin >
Users (Google Workspace's user list has a "Last sign in" column; NIST SP 800-53 AC-2(3): disable accounts inactive
for a set period). Accounts with no sign-in since this was added show "Not recorded". Running it twice changes nothing.
Usage (from backend/): python migrations/migrate_last_sign_in.py
"""
import sys
sys.path.append(".")

from sqlalchemy import text

from app.database import engine

with engine.connect() as conn:
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ"))
    conn.commit()
print("Migration complete: users.last_login_at ready.")
