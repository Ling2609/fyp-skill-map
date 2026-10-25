from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
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
    # 14 Oct: why "Not selected" (missing_skills / position_filled / experience / other, or job_filled / job_cancelled
    # when the job was closed), the employer's own note, and the missing skills at that moment
    reason = Column(String(20), nullable=True)
    note = Column(String(300), nullable=True)
    reason_skills = Column(JSON, nullable=True)
    # 14 Oct: this applicant's required skills for the job (have / total), kept so "where you stand" compares
    # applicants without working out every applicant's match each time; refreshed whenever it is worked out
    match_have = Column(Integer, nullable=True)
    match_total = Column(Integer, nullable=True)
    match_at = Column(DateTime(timezone=True), nullable=True)   # 14 Oct audit: when the counts were worked out
    # 21 Oct (her pick; references.md "After applying: profile as it was, or as it is now?"): exactly what the employer
    # was shown when the student applied (her profile and her match, no contact details). The employer sees this by
    # default, with "see latest" when her profile has changed since. NULL for applications made before (latest only)
    sent_profile = Column(JSON, nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)


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
    One per job per student; the student can apply or say "No thanks" (dismissed_at, with an optional reason the
    employer sees: 25 Oct, option D). With no answer it ends after 14 days ("No reply"; app/services/invitations.py)."""
    __tablename__ = "job_invitations"
    __table_args__ = (UniqueConstraint("job_id", "student_id", name="uq_invitation_job_student"),)

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    dismissed_at = Column(DateTime(timezone=True), nullable=True)       # "No thanks" (the student declined)
    # 25 Oct (her plan, option D): the employer sees "Declined" and the reason, if the student gave one
    decline_reason = Column(String(20), nullable=True)   # not_looking / wrong_role / have_offer / other
    decline_note = Column(String(200), nullable=True)    # "other": the student's own words


class OutsideApplication(Base):
    """A student's own record of applying for a job on another site (20 Oct, her idea; research in references.md
    "Recording applications to outside jobs"). SkillMap can't see that employer's replies, so the student sets the
    status; nobody else sees it. Kept apart from `applications` so employer counts, records and "where you stand"
    are untouched. New table: main.py's create_all makes it."""
    __tablename__ = "outside_applications"
    __table_args__ = (UniqueConstraint("job_id", "student_id", name="uq_outside_job_student"),)

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(14), nullable=False, default="applied", server_default="applied")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    status_changed_at = Column(DateTime(timezone=True), nullable=True)
