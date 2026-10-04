"""
Run once for the 4 Oct project/certificate skills change. Safe to rerun.

  user_projects.skill_quotes          : skill -> the student's own words that show it (projects added before: {})
  user_certifications.skills_source   : "listed" (typed from the certificate), "estimated" (AI guess from the name)
                                        or "confirmed" (estimate checked by the student); before: NULL = estimated
  user_certifications.added_skills    : skills the student typed in with "+ Add skill"   (added 4 Oct 23:10)
  user_certifications.credly_url      : optional Credly badge link                        (added 4 Oct 23:10)

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
    "ALTER TABLE user_certifications ADD COLUMN IF NOT EXISTS added_skills JSON NOT NULL DEFAULT '[]'",
    "ALTER TABLE user_certifications ADD COLUMN IF NOT EXISTS credly_url VARCHAR(500)",
]

with engine.connect() as conn:
    for sql in STATEMENTS:
        conn.execute(text(sql))
    conn.commit()
    found = conn.execute(text(
        "SELECT count(*) FROM information_schema.columns WHERE (table_name='user_projects' AND column_name='skill_quotes')"
        " OR (table_name='user_certifications' AND column_name IN ('skills_source', 'added_skills', 'credly_url'))")).scalar()

print("Migration complete." if found == 4 else "Migration INCOMPLETE, check the messages above.")
print(f"  skill_quotes, skills_source, added_skills, credly_url: {found}/4")
