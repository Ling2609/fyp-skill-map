from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from app.database import Base


class UserModule(Base):
    __tablename__ = "user_modules"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    module_code = Column(String(20), nullable=False)
    grade      = Column(Float, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "module_code", name="uq_user_module"),
    )