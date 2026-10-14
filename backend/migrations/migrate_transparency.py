"""
Run once for the transparency flow (14 Oct 2026). Safe to rerun.

jobs.decide_by: the date the employer promises a decision by (existing posts: 30 days after posting);
jobs.decide_extended_reason: why it was moved (once); jobs.applications_stopped_at: "Stop new applications";
jobs.close_reason: why the job was closed (filled through SkillMap / filled another way / not filling).
applications.reason, note, reason_skills: why "Not selected", the employer's note, the missing skills then;
applications.match_have, match_total: the applicant's required skills for the job, for "where you stand".

Usage (from backend/):  python migrations/migrate_transparency.py
"""
import sys
sys.path.insert(0, ".")

from sqlalchemy import text
from app.database import engine

with engine.begin() as conn:
    for sql in (
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS decide_by TIMESTAMPTZ",
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS decide_extended_reason VARCHAR(200)",
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS applications_stopped_at TIMESTAMPTZ",
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS close_reason VARCHAR(20)",
        "ALTER TABLE applications ADD COLUMN IF NOT EXISTS reason VARCHAR(20)",
        "ALTER TABLE applications ADD COLUMN IF NOT EXISTS note VARCHAR(300)",
        "ALTER TABLE applications ADD COLUMN IF NOT EXISTS reason_skills JSON",
        "ALTER TABLE applications ADD COLUMN IF NOT EXISTS match_have INTEGER",
        "ALTER TABLE applications ADD COLUMN IF NOT EXISTS match_total INTEGER",
    ):
        conn.execute(text(sql))
    n = conn.execute(text("UPDATE jobs SET decide_by = listing_date + INTERVAL '30 days' "
                          "WHERE source = 'employer' AND decide_by IS NULL AND listing_date IS NOT NULL")).rowcount
print(f"jobs and applications columns: ok; {n} existing posts given a decision date 30 days after posting")
print("Done. Start the backend again.")
