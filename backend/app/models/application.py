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


class ApplicationEvent(Base):
    """What happened to an application after the student applied (12 Oct, her request: show the student where it
    stands instead of silence then a sudden "Not selected"). kind "viewed" = the employer first opened the
    applicant's profile (LinkedIn's "Application viewed"); kind "status" = the employer set `status`. New table: main.py's create_all makes it. Undo removes
    the event it undoes. The student's progress steps and the employer's recent activity are read from here."""
    __tablename__ = "application_events"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("applications.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String(10), nullable=False)          # viewed | status
    status = Column(String(12), nullable=True)         # the new status, for kind "status"
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class JobInvitation(Base):
    """An employer invites a visible graduate who fits one of their open jobs to apply (12 Oct; her supervisor's
    point that employers could find graduates but not reach them; Handshake's "invite to apply"). In-app only.
    One per job per student; the student can apply or say "Not interested" (dismissed_at; the employer isn't told)."""
    __tablename__ = "job_invitations"
    __table_args__ = (UniqueConstraint("job_id", "student_id", name="uq_invitation_job_student"),)

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    dismissed_at = Column(DateTime(timezone=True), nullable=True)
