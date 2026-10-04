from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base


class PasswordResetOTP(Base):
    """Emailed 6-digit codes. Despite the table name, two kinds since 4 Oct (purpose): "reset" = Forgot password,
    "email" = confirming a new email address (new_email holds it until the code is entered). One table, so the
    code rules (hash, 15 min, single use, 5 tries, one a minute) are written once for both."""
    __tablename__ = "password_reset_otps"

    id            = Column(Integer, primary_key=True, index=True)
    user_id       = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    otp_hash      = Column(String(64), nullable=False)
    expires_at    = Column(DateTime(timezone=True), nullable=False)
    used          = Column(Boolean, nullable=False, default=False)
    attempt_count = Column(Integer, nullable=False, default=0)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())
    purpose       = Column(String(10), nullable=False, default="reset", server_default="reset")
    new_email     = Column(String, nullable=True)