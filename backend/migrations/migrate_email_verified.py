"""
Run once for registration email verification (23 Nov 2026). Safe to rerun: a rerun never marks anyone verified.

users.email_verified_at: when the owner proved the email is theirs. NULL = not verified (every new account).
email_code_sends: one row per attempt to email a registration code (cooldown and daily limit).

First run (the column doesn't exist yet), all in ONE transaction:
  - adds users.email_verified_at (no default, so new accounts start unverified),
  - creates email_code_sends with its primary key, foreign key to users and index,
  - marks every account that exists right now as verified (they signed up before verification existed),
  - prints how many. Any error -> rolled back, nothing changed.
Rerun (the column exists): only checks that the table, keys and index are all there. All there -> "nothing
changed". Something missing -> stops with an error saying what. It never backfills on a rerun, so accounts made
after the first run stay unverified until their owners verify.

Usage (from backend/):  python migrations/migrate_email_verified.py
"""
import sys
sys.path.insert(0, ".")

from sqlalchemy import inspect, text
from app.database import engine

INDEX = "ix_email_code_sends_user_purpose_sent"


def missing_parts(conn) -> list[str]:
    insp = inspect(conn)
    missing = []
    if "email_code_sends" not in insp.get_table_names():
        return ["table email_code_sends"]
    if not insp.get_pk_constraint("email_code_sends").get("constrained_columns"):
        missing.append("primary key of email_code_sends")
    if not any(fk["referred_table"] == "users" and fk["constrained_columns"] == ["user_id"]
               for fk in insp.get_foreign_keys("email_code_sends")):
        missing.append("foreign key email_code_sends.user_id -> users.id")
    if INDEX not in {i["name"] for i in insp.get_indexes("email_code_sends")}:
        missing.append(f"index {INDEX}")
    return missing


with engine.begin() as conn:
    columns = {c["name"] for c in inspect(conn).get_columns("users")}
    if "email_verified_at" in columns:
        missing = missing_parts(conn)
        if missing:
            sys.exit("Stopped: users.email_verified_at exists but these are missing: " + "; ".join(missing) + ".\n"
                     "Nothing was changed (and no account was marked verified). Fix the database by hand, or ask "
                     "for help, then run this again.")
        print("Already done: nothing changed.")
        sys.exit(0)

    conn.execute(text("ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMP WITH TIME ZONE"))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS email_code_sends (
            id       SERIAL PRIMARY KEY,
            user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            purpose  VARCHAR(20) NOT NULL,
            sent_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            accepted BOOLEAN NOT NULL DEFAULT false
        )"""))
    conn.execute(text(f"CREATE INDEX IF NOT EXISTS {INDEX} ON email_code_sends (user_id, purpose, sent_at)"))
    missing = missing_parts(conn)
    if missing:   # e.g. an old email_code_sends table without the key: roll everything back
        raise RuntimeError("Stopped, nothing changed: email_code_sends is missing " + "; ".join(missing) + ".")
    marked = conn.execute(text("UPDATE users SET email_verified_at = COALESCE(created_at, now()) "
                               "WHERE email_verified_at IS NULL")).rowcount
print(f"users.email_verified_at and email_code_sends: added. {marked} existing account(s) marked verified.")
print("Done. Start the backend again.")
