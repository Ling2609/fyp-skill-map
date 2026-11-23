from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.sql import func
from app.database import Base


class EmailCodeSend(Base):
    """One row per attempt to email a registration code (23 Nov, email verification). Written BEFORE the email is
    sent, under a lock on the user, so it reserves the send slot: the 60 s cooldown counts every attempt. `accepted`
    becomes true as soon as the mail server accepted the email (not proof it reached the inbox); the rolling cap of
    5 a day counts accepted emails. Codes themselves are replaced on every send, so they can't be counted. Rows older
    than 48 h are deleted at start-up (only the last 24 h matter)."""
    __tablename__ = "email_code_sends"

    id       = Column(Integer, primary_key=True)
    user_id  = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    purpose  = Column(String(20), nullable=False)
    sent_at  = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    accepted = Column(Boolean, nullable=False, default=False, server_default="false")

    __table_args__ = (Index("ix_email_code_sends_user_purpose_sent", "user_id", "purpose", "sent_at"),)
