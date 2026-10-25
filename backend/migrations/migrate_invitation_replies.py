"""
Run once for invitation replies (25 Oct 2026). Safe to rerun.

job_invitations.decline_reason, job_invitations.decline_note: when a student says "No thanks" to an employer's
invitation, the optional reason the employer sees (app/services/invitations.py). The API refuses to start until
this has run.

Usage (from backend/):  python migrations/migrate_invitation_replies.py
"""
import sys
sys.path.insert(0, ".")

from sqlalchemy import text
from app.database import engine

with engine.begin() as conn:
    conn.execute(text("ALTER TABLE job_invitations ADD COLUMN IF NOT EXISTS decline_reason VARCHAR(20)"))
    conn.execute(text("ALTER TABLE job_invitations ADD COLUMN IF NOT EXISTS decline_note VARCHAR(200)"))
print("job_invitations.decline_reason, decline_note: ok")
print("Done. Start the backend again.")
