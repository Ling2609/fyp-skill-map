from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.sql import func

from app.database import Base


class Application(Base):
    """A student's application to a job posted on SkillMap (11 Oct, Employer flow batch 2). One per student per job.
    status: applied -> shortlisted -> accepted / rejected, set by the employer (students see "rejected" as
    "Not selected"). Applying shares the student's profile and their match for this job with that employer only,
    even if the student is not "Visible to employers"; grades follow the student's "Show grades" switch."""
    __tablename__ = "applications"
    __table_args__ = (UniqueConstraint("job_id", "student_id", name="uq_application_job_student"),)

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(12), nullable=False, default="applied", server_default="applied")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    status_changed_at = Column(DateTime(timezone=True), nullable=True)   # the employer's last status change
