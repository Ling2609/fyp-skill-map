"""Availability of employer-owned listings, independent of their recruitment outcome."""
from sqlalchemy import exists, or_
from app.models.job import Job
from app.models.user import User, UserRole


def owner_available_clause():
    """SQL predicate: external jobs are unchanged; employer posts need an approved active owner."""
    owner = exists().where(
        User.id == Job.posted_by_user_id,
        User.role == UserRole.employer,
        User.is_active.is_(True),
        User.employer_status == "approved",
    ).correlate(Job)
    return or_(Job.source != "employer", owner)


def employer_available(job, db, *, lock=False):
    """Do not turn a suspension into a rejection or permanently close the job.

    The application write takes a shared owner-row lock until commit, so an admin
    status change cannot commit between this check and saving the application.
    """
    if job.source != "employer":
        return True
    if job.posted_by_user_id is None:
        return False
    query = db.query(User.role, User.is_active, User.employer_status).filter(User.id == job.posted_by_user_id)
    if lock:
        query = query.with_for_update(read=True)
    owner = query.first()
    return bool(owner and owner.role == UserRole.employer
                and owner.is_active and owner.employer_status == "approved")


def _utc(value):
    from datetime import timezone
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def decision_window_open(job, now=None):
    """A promise is expired at its exact timestamp. Legacy undated/external jobs are unchanged."""
    from datetime import datetime, timezone
    deadline = getattr(job, "decide_by", None)
    if job.source != "employer" or deadline is None:
        return True
    return _utc(now or datetime.now(timezone.utc)) < _utc(deadline)


def decision_open_clause(now=None):
    """SQL counterpart used by discovery and the recommendation cache."""
    from datetime import datetime, timezone
    return or_(Job.source != "employer", Job.decide_by.is_(None),
               Job.decide_by > _utc(now or datetime.now(timezone.utc)))


def new_applications_open(job, db):
    return bool(not (job.gone_at or job.closed_at or job.hidden_by_admin_at or job.applications_stopped_at)
                and decision_window_open(job) and employer_available(job, db))
