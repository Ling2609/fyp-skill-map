"""
Run once for the 4 Oct account-security batch. Safe to rerun (every step checks first).

  1. users.password_changed_at        : sign-in tokens from before a password change or reset stop working
  2. password_reset_otps.purpose      : "reset" (Forgot password) or "email" (confirming a new email address)
     password_reset_otps.new_email    : the new address waiting for its code
  3. drop login_throttle              : the per-account sign-in limit; replaced by login_attempts
                                        (per typed name + IP), which the backend creates on start-up
  4. delete used or expired codes

Usage (from the backend folder, venv active, backend stopped or restarted afterwards):
  python migrations/migrate_account_security.py
"""
import sys
sys.path.append(".")

from sqlalchemy import text

from app.database import Base, engine
from app.models.login_throttle import LoginThrottle  # noqa: F401  registers login_attempts

STATEMENTS = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ",
    "ALTER TABLE password_reset_otps ADD COLUMN IF NOT EXISTS purpose VARCHAR(10) NOT NULL DEFAULT 'reset'",
    "ALTER TABLE password_reset_otps ADD COLUMN IF NOT EXISTS new_email VARCHAR",
    "DROP TABLE IF EXISTS login_throttle",
    "DELETE FROM password_reset_otps WHERE used OR expires_at < now()",
]

with engine.connect() as conn:
    for sql in STATEMENTS:
        conn.execute(text(sql))
    conn.commit()
Base.metadata.create_all(bind=engine, tables=[LoginThrottle.__table__])

with engine.connect() as conn:
    users_col = conn.execute(text(
        "SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='password_changed_at'")).first()
    otp_cols = conn.execute(text(
        "SELECT count(*) FROM information_schema.columns WHERE table_name='password_reset_otps' "
        "AND column_name IN ('purpose','new_email')")).scalar()
    old = conn.execute(text("SELECT to_regclass('login_throttle')")).scalar()
    new = conn.execute(text("SELECT to_regclass('login_attempts')")).scalar()

ok = bool(users_col) and otp_cols == 2 and old is None and new is not None
print("Migration complete." if ok else "Migration INCOMPLETE, check the messages above.")
print(f"  users.password_changed_at: {'yes' if users_col else 'MISSING'}")
print(f"  password_reset_otps purpose + new_email: {otp_cols}/2")
print(f"  login_throttle dropped: {'yes' if old is None else 'NO'} | login_attempts present: {'yes' if new else 'NO'}")
