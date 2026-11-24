from sqlalchemy import Column, DateTime, Integer, String
from app.database import Base


class RequestCount(Base):
    """How many requests one key made in one time window (24 Nov 2026, deployment audit item 3). A key is a limit and
    who it applies to, e.g. "ai:hour:user:12" or "register:ip:203.0.113.5"; also temporary AI concurrency slots
    ("ai:inflight:user:12:<id>", renewed while the call runs). Counted with one atomic
    INSERT ... ON CONFLICT DO UPDATE (app/services/rate_limit.py), so parallel requests can't slip past a limit, and
    kept in PostgreSQL, so limits hold across restarts and workers. Rows older than 2 days are deleted at start-up."""
    __tablename__ = "request_counts"

    key          = Column(String(120), primary_key=True)
    window_start = Column(DateTime(timezone=True), primary_key=True)
    count        = Column(Integer, nullable=False, default=0, server_default="0")   # same default as the migration
