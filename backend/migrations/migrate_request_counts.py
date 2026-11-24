"""
Run once for usage limits (24 Nov 2026, deployment audit item 3). Safe to rerun.

request_counts: how many requests one key (a limit and who it applies to, e.g. AI requests of user 12 this hour, or
sign-ups from one address) made in one time window. Used by app/services/rate_limit.py; rows older than 2 days are
deleted at start-up. One transaction: the table and its primary key (key, window_start) together, or nothing.

Usage (from backend/):  python migrations/migrate_request_counts.py
"""
import sys
sys.path.insert(0, ".")

from sqlalchemy import text
from app.database import engine

with engine.begin() as conn:
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS request_counts (
            key          VARCHAR(120) NOT NULL,
            window_start TIMESTAMP WITH TIME ZONE NOT NULL,
            count        INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (key, window_start)
        )"""))
print("request_counts: ok")
print("Done. Start the backend again.")
