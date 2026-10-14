"""
Run once for the audit fixes (14 Oct 2026). Safe to rerun.

jobs.decide_by_original: the decision date first promised, kept when the employer moves it (audit trail).
applications.match_at: when match_have / match_total were worked out, so "where you stand" only compares recent counts.
users.privacy_version: which privacy notice the user accepted (the notice's date in privacyText.js VERSIONS).
Existing users who accepted a notice are given "2026-10-14", the only version so far.

Usage (from backend/):  python migrations/migrate_record_keeping.py
"""
import sys
sys.path.insert(0, ".")

from sqlalchemy import text
from app.database import engine

with engine.begin() as conn:
    for sql in (
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS decide_by_original TIMESTAMPTZ",
        "ALTER TABLE applications ADD COLUMN IF NOT EXISTS match_at TIMESTAMPTZ",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_version VARCHAR(10)",
    ):
        conn.execute(text(sql))
    n = conn.execute(text("UPDATE users SET privacy_version = '2026-10-14' "
                          "WHERE privacy_accepted_at IS NOT NULL AND privacy_version IS NULL")).rowcount
print(f"jobs, applications and users columns: ok; {n} users marked as accepting the 14 Oct 2026 notice")
print("Done. Start the backend again.")
