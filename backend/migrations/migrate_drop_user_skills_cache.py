"""
Drop the user_skills_cache table (29 Sep 2026). Run once.

Why: since the shared Graduate Skill Profile (app/services/skill_profile.py,
commit c347a02) nothing reads or writes this table, and its model (UserSkillCache)
was removed. Removing a model does not remove its table, so this does.
The table definition is kept in migrate_phase1.py if it is ever needed again.

Usage (from backend/):
    python migrations/migrate_drop_user_skills_cache.py
"""
import sys
sys.path.append(".")   # run from backend/

from sqlalchemy import text

from app.database import engine

with engine.connect() as conn:
    conn.execute(text("DROP TABLE IF EXISTS user_skills_cache"))
    conn.commit()

print("Migration complete: user_skills_cache dropped (if it existed).")