"""
Run once (21 Oct): each application keeps a copy of what the employer was shown when the student applied
(references.md "After applying: profile as it was, or as it is now?"). Safe to rerun.

applications: sent_profile (JSON), sent_at. Applications made before stay empty: the employer sees the latest profile.

Usage (from backend/):  python migrations/migrate_application_copy.py
"""
import sys
sys.path.insert(0, ".")

from sqlalchemy import text
from app.database import engine

with engine.begin() as conn:
    for column in ("sent_profile JSON", "sent_at TIMESTAMP WITH TIME ZONE"):
        conn.execute(text(f"ALTER TABLE applications ADD COLUMN IF NOT EXISTS {column}"))
        print(f"applications.{column.split()[0]}: ok")
print("Done. Start the backend again.")
