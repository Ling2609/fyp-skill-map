"""
Run once to add the live-job columns to the jobs table.
Existing (2024 JobStreet) rows become source='dataset', country='MY'.

Usage (from the backend folder):
  python migrate_add_live_job_columns.py
"""
import sys
sys.path.append(".")

from sqlalchemy import text

from app.database import engine

STATEMENTS = [
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source VARCHAR NOT NULL DEFAULT 'dataset'",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_url VARCHAR",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS publisher VARCHAR",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS listing_date TIMESTAMPTZ",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS country VARCHAR(2) NOT NULL DEFAULT 'MY'",
]

with engine.connect() as conn:
    for sql in STATEMENTS:
        conn.execute(text(sql))
    conn.commit()
    counts = conn.execute(text("SELECT source, country, COUNT(*) FROM jobs GROUP BY source, country")).fetchall()

print("Migration complete: source, source_url, publisher, listing_date, country added.")
for source, country, n in counts:
    print(f"  {source:8} {country}: {n} jobs")