"""
Run once for the 4 Oct project/certificate skills change. Safe to rerun.

  user_projects.skill_quotes          : skill -> the student's own words that show it (projects added before: {})
  user_certifications.skills_source   : "listed" (typed from the certificate) or "estimated" (AI guess from the name);
                                        certificates added before stay NULL and are shown as estimated

Usage (from the backend folder, venv active):
  python migrations/migrate_profile_skill_evidence.py
"""
import sys
sys.path.append(".")

from sqlalchemy import text

from app.database import engine

STATEMENTS = [
    "ALTER TABLE user_projects ADD COLUMN IF NOT EXISTS skill_quotes JSON NOT NULL DEFAULT '{}'",
    "ALTER TABLE user_certifications ADD COLUMN IF NOT EXISTS skills_source VARCHAR(10)",
]

with engine.connect() as conn:
    for sql in STATEMENTS:
        conn.execute(text(sql))
    conn.commit()
    found = conn.execute(text(
        "SELECT count(*) FROM information_schema.columns WHERE (table_name='user_projects' AND column_name='skill_quotes')"
        " OR (table_name='user_certifications' AND column_name='skills_source')")).scalar()

print("Migration complete." if found == 2 else "Migration INCOMPLETE, check the messages above.")
print(f"  user_projects.skill_quotes + user_certifications.skills_source: {found}/2")
