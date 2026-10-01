"""
Run once to add the Stage 1 evidence columns to job_skills (fix plan, Stage 1). Safe to rerun.
Existing rows keep NULL in the new columns until their job is re-extracted with evidence.

  evidence_quote : the words from the ad that mention the skill (checked by app/services/evidence.py)
  level          : required / preferred / trained / unspecified
  skill_type     : hard / soft
  match_score    : how closely the quote matches the ad text (1.0 = exact)
  alternative_group : same label on skills the ad accepts as alternatives ("C#, Python, or equivalent");
                   NULL / "" = needed on its own

Usage (from the backend folder):
  python migrations/migrate_add_job_skill_evidence.py
"""
import sys
sys.path.append(".")

from sqlalchemy import text

from app.database import engine

STATEMENTS = [
    "ALTER TABLE job_skills ADD COLUMN IF NOT EXISTS evidence_quote VARCHAR",
    "ALTER TABLE job_skills ADD COLUMN IF NOT EXISTS level VARCHAR",
    "ALTER TABLE job_skills ADD COLUMN IF NOT EXISTS skill_type VARCHAR",
    "ALTER TABLE job_skills ADD COLUMN IF NOT EXISTS match_score DOUBLE PRECISION",
    "ALTER TABLE job_skills ADD COLUMN IF NOT EXISTS alternative_group VARCHAR",
    "CREATE INDEX IF NOT EXISTS ix_job_skills_job_id ON job_skills (job_id)",   # F15: per-job lookups
]

with engine.connect() as conn:
    for sql in STATEMENTS:
        conn.execute(text(sql))
    conn.commit()
    total, with_evidence = conn.execute(
        text("SELECT COUNT(*), COUNT(evidence_quote) FROM job_skills")).fetchone()

print("Migration complete: evidence_quote, level, skill_type, match_score, alternative_group added; index on job_id.")
print(f"  job_skills rows: {total}, with evidence: {with_evidence}")
