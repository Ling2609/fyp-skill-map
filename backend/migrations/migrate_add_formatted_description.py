"""
Run once to add the formatted_description column to the jobs table.
Usage: python migrations/migrate_add_formatted_description.py
(Already applied to the existing database. A fresh database gets these tables/columns from app/models/.)
"""
import sys
sys.path.append(".")   # run from backend/

from app.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    conn.execute(text(
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS formatted_description TEXT"
    ))
    conn.commit()
    print("Migration complete: formatted_description column added.")
