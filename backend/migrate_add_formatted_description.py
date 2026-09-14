"""
Run once to add the formatted_description column to the jobs table.
Usage: python migrate_add_formatted_description.py
"""
from app.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    conn.execute(text(
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS formatted_description TEXT"
    ))
    conn.commit()
    print("Migration complete: formatted_description column added.")
