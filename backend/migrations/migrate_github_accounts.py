"""
Run once for Connect GitHub (14 Oct 2026). Safe to rerun.

github_accounts: the GitHub accounts a student proved are hers (signed in to GitHub); one GitHub account per SkillMap
account. user_projects.repo_check / repo_check_as: whether a project's repo is owned or contributed to by one of her
connected accounts ("yours" / "not_linked"), worked out when the project is saved or an account is connected.

Usage (from backend/):  python migrations/migrate_github_accounts.py
"""
import sys
sys.path.insert(0, ".")

from sqlalchemy import text
from app.database import engine

with engine.begin() as conn:
    for sql in (
        """CREATE TABLE IF NOT EXISTS github_accounts (
               id SERIAL PRIMARY KEY,
               user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
               github_id BIGINT NOT NULL UNIQUE,
               login VARCHAR(40) NOT NULL,
               connected_at TIMESTAMPTZ NOT NULL DEFAULT now())""",
        "CREATE INDEX IF NOT EXISTS ix_github_accounts_user_id ON github_accounts (user_id)",
        "ALTER TABLE user_projects ADD COLUMN IF NOT EXISTS repo_check VARCHAR(12)",
        "ALTER TABLE user_projects ADD COLUMN IF NOT EXISTS repo_check_as VARCHAR(40)",
    ):
        conn.execute(text(sql))
print("github_accounts table and user_projects.repo_check: ok")
print("Done. Start the backend again.")
