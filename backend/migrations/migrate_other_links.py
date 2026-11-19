"""
Run once for other profile links (20 Nov 2026). Safe to rerun.

users.other_links: a student's extra profile links (Google Scholar, ORCID, a blog...), as [{"label", "url"}].

Usage (from backend/):  python migrations/migrate_other_links.py
"""
import sys
sys.path.insert(0, ".")

from sqlalchemy import text
from app.database import engine

with engine.begin() as conn:
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS other_links JSON NOT NULL DEFAULT '[]'"))
print("users.other_links: ok")
print("Done. Start the backend again.")
