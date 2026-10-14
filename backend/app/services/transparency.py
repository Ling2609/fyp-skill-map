"""
The transparency flow between employers and students (14 Oct 2026; her design after research, references.md
"Employer replies, ghosting and transparency" and "Closing a job vs stopping applications").

What it fixes: a student waiting weeks, then a job closing with no reason. SkillMap can't force an employer to reply,
so it (1) gets a promise up front, the employer's own decision date; (2) closes the gap at that date for the student
("no decision by the date", not a rejection in the employer's name: DfE's teacher-training service found automatic
rejection the worst experience); (3) asks for a reason whenever an outcome is given, one tap; (4) shows students
what is happening on the job and the employer's record of deciding on time, from data SkillMap already has.
"""
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.application import Application
from app.models.job import Job

DECIDE_DAYS = (14, 28, 30, 42)      # 2 weeks, 4 weeks, 30 days (default; DfE: decide within 30 working days), 6 weeks
DEFAULT_DECIDE_DAYS = 30
EXTEND_DAYS = (7, 14)                # one extension, with a reason students see
STAND_MIN_APPLICANTS = 5             # "where you stand" only from 5 applicants, so no one can be singled out
NOTE_MAX = 300

# Reasons for "Not selected" an employer can pick (or "other" with a note). Student-facing words on the frontend.
REASONS = ("missing_skills", "position_filled", "experience", "other")
# Closing a job gives every applicant still waiting an outcome with the closing reason
CLOSE_REASONS = {"filled_skillmap": "job_filled", "filled_other": "job_filled", "not_filling": "job_cancelled"}
WAITING = ("applied", "shortlisted")
DECIDED = ("accepted", "rejected")


def _aware(t):
    return t.replace(tzinfo=timezone.utc) if t and t.tzinfo is None else t


def decide_by_from(days: int, start: datetime | None = None) -> datetime:
    if days not in DECIDE_DAYS:
        raise HTTPException(status_code=400, detail="Pick when you will decide: 2 weeks, 4 weeks, 30 days or 6 weeks.")
    return (start or datetime.now(timezone.utc)) + timedelta(days=days)


def past_date(job: Job, now: datetime | None = None) -> bool:
    """The employer's own decision date has passed (and the job is still open)."""
    return bool(job.decide_by and (now or datetime.now(timezone.utc)) > _aware(job.decide_by) and not job.closed_at)


def set_reason(a: Application, reason: str | None, note: str | None, missing: list[str] | None):
    """Record why an application was not selected. "other" needs a note; a note can go with any reason."""
    note = " ".join((note or "").split()) or None
    if reason is not None and reason not in REASONS:
        raise HTTPException(status_code=400, detail="Unknown reason.")
    if reason == "other" and not note:
        raise HTTPException(status_code=400, detail="Write the reason for students.")
    if note and len(note) > NOTE_MAX:
        raise HTTPException(status_code=400, detail=f"The note can be {NOTE_MAX} characters at most.")
    a.reason, a.note = reason, note
    a.reason_skills = missing if reason == "missing_skills" else None


def clear_reason(a: Application):
    a.reason = a.note = a.reason_skills = None


def job_stats(job_ids: list[int], db: Session) -> dict[int, dict]:
    """Per job: how many applied, how many were shortlisted (shortlisted or accepted now), how many have a decision."""
    out = {j: {"applied": 0, "shortlisted": 0, "decided": 0} for j in job_ids}
    if job_ids:
        for job_id, status in db.query(Application.job_id, Application.status).filter(Application.job_id.in_(job_ids)):
            s = out[job_id]
            s["applied"] += 1
            s["shortlisted"] += status in ("shortlisted", "accepted")
            s["decided"] += status in DECIDED
    return out


def employer_record(employer_id: int, db: Session, now: datetime | None = None) -> dict:
    """"Decided on time for X of Y jobs": jobs with applicants whose date has passed or that are closed; on time =
    every applicant had an outcome (accepted / not selected, also by closing the job) by the employer's date."""
    now = now or datetime.now(timezone.utc)
    jobs = db.query(Job).filter(Job.posted_by_user_id == employer_id, Job.decide_by.isnot(None)).all()
    due = on_time = 0
    for job in jobs:
        apps = db.query(Application).filter(Application.job_id == job.id).all()
        deadline = _aware(job.decide_by)
        if not apps or (now <= deadline and not job.closed_at):
            continue                                   # nothing to judge yet
        due += 1
        on_time += all(a.status in DECIDED and a.status_changed_at and _aware(a.status_changed_at) <= deadline
                       for a in apps)
    return {"on_time": on_time, "of": due}


def stand(mine: Application, all_apps: list[Application]) -> dict | None:
    """Where this applicant stands among everyone who applied, on required skills only; None below 5 applicants or
    when the counts are missing."""
    if len(all_apps) < STAND_MIN_APPLICANTS or mine.match_total in (None, 0) or mine.match_have is None:
        return None
    others = [a for a in all_apps if a.id != mine.id and a.match_have is not None]
    return {"have": mine.match_have, "total": mine.match_total, "others": len(others),
            "ahead_of": sum(1 for a in others if a.match_have < mine.match_have)}
