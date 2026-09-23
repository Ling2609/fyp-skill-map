"""
Phase 1 migration — run once.
Creates: user_modules, user_skills_cache tables
Alters: users table (adds is_visible_to_employers, is_active, notification_prefs)
Creates: password_reset_otps table
Usage: python migrate_phase1.py
"""
from app.database import engine
from sqlalchemy import text

migrations = [
    # ── users table — new columns ──────────────────────────────────────────────
    """
    ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_visible_to_employers BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{}'
    """,

    # ── user_modules — saves graduate module grades to DB ──────────────────────
    """
    CREATE TABLE IF NOT EXISTS user_modules (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        module_code VARCHAR(20) NOT NULL,
        grade       FLOAT NOT NULL,
        updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (user_id, module_code)
    )
    """,

    # ── user_skills_cache — materialised skill profile per graduate ────────────
    """
    CREATE TABLE IF NOT EXISTS user_skills_cache (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        skill_name  VARCHAR(200) NOT NULL,
        weight      FLOAT NOT NULL,
        source      VARCHAR(20) NOT NULL CHECK (source IN ('module', 'project', 'cert')),
        updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (user_id, skill_name)
    )
    """,

    # ── password_reset_otps — for forgot password flow ─────────────────────────
    """
    CREATE TABLE IF NOT EXISTS password_reset_otps (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        otp_hash      VARCHAR(64) NOT NULL,
        expires_at    TIMESTAMP WITH TIME ZONE NOT NULL,
        used          BOOLEAN NOT NULL DEFAULT FALSE,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
    """,
]

with engine.connect() as conn:
    for sql in migrations:
        conn.execute(text(sql))
    conn.commit()
    print("Phase 1 migration complete.")