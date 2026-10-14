"""
Where an application stands, for the student (12 Oct; her request: a clear process instead of waiting in silence
and then a sudden "Not selected"). Research in references.md "Application progress for students":
- LinkedIn shows applicants "Application Viewed" when the employer opens the application in their system;
- Talent Board (75,000 candidates, 2015): nearly half never received a status update;
- Indeed shows an employer's typical response time to job seekers.

Steps: Applied -> Viewed -> Shortlisted -> Decision (Accepted / Not selected). "Viewed" is recorded the first time
the employer opens the applicant's profile (a status change also counts: they had to look to decide).

When nothing has moved for a while the student is told to keep applying elsewhere (pre-set, not tuned):
- NUDGE_DAYS = 14: MyCareersFuture (Singapore) advises following up 1-2 weeks after applying and starting other
  applications meanwhile;
- MOVE_ON_DAYS = 30: the same article: no reply a month on, it may be time to move on (Ask a Manager: 4-6 weeks of
  silence usually means no).
"""
from datetime import datetime, timezone
from statistics import median

from sqlalchemy.orm import Session

from app.models.application import Application, ApplicationEvent

NUDGE_DAYS = 14
MOVE_ON_DAYS = 30
RESPONSE_MIN_SAMPLES = 3     # "usually reviews within N days" only once an employer has viewed at least 3 applications
DECIDED = ("accepted", "rejected")


def _aware(t):
    return t.replace(tzinfo=timezone.utc) if t and t.tzinfo is None else t


def events_for(app_ids: list[int], db: Session) -> dict[int, list[ApplicationEvent]]:
    out: dict[int, list[ApplicationEvent]] = {i: [] for i in app_ids}
    if app_ids:
        for e in (db.query(ApplicationEvent).filter(ApplicationEvent.application_id.in_(app_ids))
                  .order_by(ApplicationEvent.created_at, ApplicationEvent.id)):
            out[e.application_id].append(e)
    return out


def first_seen(a: Application, events: list[ApplicationEvent]):
    """When the employer first looked: the first view, or the first status change if that came first."""
    times = [_aware(e.created_at) for e in events]
    if times:
        return min(times)
    # applications from before 12 Oct have no events: a status other than "applied" means they were looked at
    return _aware(a.status_changed_at) if a.status != "applied" else None


def _shortlisted_at(a: Application, events: list[ApplicationEvent]):
    statuses = [e for e in events if e.kind == "status"]
    if not statuses:
        return _aware(a.status_changed_at) if a.status == "shortlisted" else None
    at = None
    for e in statuses:                       # oldest first: moving back to Applied clears an earlier shortlist
        if e.status == "shortlisted":
            at = _aware(e.created_at)
        elif e.status == "applied":
            at = None
    return at


def progress(a: Application, events: list[ApplicationEvent], job_open: bool, now: datetime | None = None,
             decide_by: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    applied = _aware(a.created_at)
    seen = first_seen(a, events)
    short = _shortlisted_at(a, events)
    decided = _aware(a.status_changed_at) if a.status in DECIDED else None
    steps = [
        {"key": "applied", "label": "Applied", "at": applied},
        {"key": "viewed", "label": "Viewed", "at": seen},
        {"key": "shortlisted", "label": "Shortlisted", "at": short},
        {"key": "decision", "label": "Accepted" if a.status == "accepted" else "Not selected" if a.status == "rejected"
         else "Decision", "at": decided},
    ]
    stage = "decision" if decided else "shortlisted" if short else "viewed" if seen else "applied"
    last = max([applied] + [_aware(e.created_at) for e in events] + ([_aware(a.status_changed_at)] if a.status_changed_at else []))
    quiet = (now - last).days
    waiting = a.status not in DECIDED
    nudge = None
    if waiting and job_open:
        # 14 Oct: the employer's own decision date replaces the 30-day guess: once it passes with no decision, the
        # student is told so ("no_decision"); before it, the 14-day "keep applying" still shows
        if decide_by and now > _aware(decide_by):
            nudge = "no_decision"
        elif not decide_by and quiet >= MOVE_ON_DAYS:
            nudge = "move_on"
        elif quiet >= NUDGE_DAYS:
            nudge = "keep_applying"
    return {"steps": steps, "stage": stage, "last_update": last, "quiet_days": quiet, "nudge": nudge,
            "closed_without_decision": waiting and not job_open}


def employer_review_days(employer_id: int, db: Session) -> int | None:
    """Median days from applying to the employer first looking, over that employer's applications (Indeed-style
    "usually responds within"). None until they have looked at RESPONSE_MIN_SAMPLES applications."""
    from app.models.job import Job
    apps = (db.query(Application).join(Job, Job.id == Application.job_id)
            .filter(Job.posted_by_user_id == employer_id).all())
    ev = events_for([a.id for a in apps], db)
    days = []
    for a in apps:
        seen = first_seen(a, ev[a.id])
        if seen:
            days.append(max(0, (seen - _aware(a.created_at)).total_seconds() / 86400))
    if len(days) < RESPONSE_MIN_SAMPLES:
        return None
    return max(1, round(median(days)))


def record_view(a: Application, db: Session):
    """The employer opened this applicant's profile: the student's "Viewed" step (first time only). (A status change
    made from the list before opening also counts as looked at: see first_seen.)"""
    if not db.query(ApplicationEvent).filter(ApplicationEvent.application_id == a.id, ApplicationEvent.kind == "viewed").first():
        db.add(ApplicationEvent(application_id=a.id, kind="viewed"))
        db.commit()
