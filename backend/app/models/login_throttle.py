from sqlalchemy import Column, DateTime, Integer, String
from app.database import Base


class LoginThrottle(Base):
    """Failed sign-ins per (account or typed name, IP address) (4 Oct; NIST SP 800-63B rate limiting, OWASP
    Authentication Cheat Sheet): 10 wrong passwords -> 15-minute pause for that pair only. Keyed on what was typed,
    not on the account, so unknown names are counted the same way (a pause doesn't reveal that an account exists),
    and someone guessing from their own machine doesn't pause the owner's sign-in from hers.
    Replaces the 4 Oct per-account table "login_throttle" (dropped by migrations/migrate_account_security.py)."""
    __tablename__ = "login_attempts"

    identifier   = Column(String, primary_key=True)   # the username if the account exists, else what was typed (lower case)
    ip           = Column(String, primary_key=True)
    failed_count = Column(Integer, nullable=False, default=0)
    locked_until = Column(DateTime(timezone=True), nullable=True)
