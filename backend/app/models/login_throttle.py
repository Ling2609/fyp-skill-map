from sqlalchemy import Column, DateTime, ForeignKey, Integer
from app.database import Base


class LoginThrottle(Base):
    """Failed sign-ins per account (4 Oct; NIST SP 800-63B rate limiting): 10 wrong passwords -> 15-minute pause."""
    __tablename__ = "login_throttle"

    user_id      = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    failed_count = Column(Integer, nullable=False, default=0)
    locked_until = Column(DateTime(timezone=True), nullable=True)
