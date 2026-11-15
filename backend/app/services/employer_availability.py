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
