"""
Student side of applying (11 Oct, Employer flow batch 2; mock-ups 9 Oct boards 5 and 6).

A job posted on SkillMap (source "employer") has no outside site to apply on, so the student applies here with
their SkillMap profile: the employer then sees that profile and the student's match for this job (employer.py).
My applications lists every application with its status; the employer sets the status, and "rejected" is shown
to the student as "Not selected" (her 9 Oct mock-up, board 6).
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from app.database import engine, get_db
from app.models.application import Application, JobInvitation
from app.models.job import Job
from app.models.user import User, UserRole
from app.routers.auth import get_current_user

router = APIRouter(prefix="/applications", tags=["applications"])

STUDENT_STATUS = {"applied": "Applied", "shortlisted": "Shortlisted", "accepted": "Accepted", "rejected": "Not selected"}


def check_applications_schema():
    """Start-up check: the applications table (11 Oct) must exist. (The 12 Oct application_events and
    job_invitations tables are new tables, so main.py's create_all makes them; no migration needed.)"""
    if "applications" not in inspect(engine).get_table_names():
        raise RuntimeError("Database not updated: run  python migrations/migrate_applications.py  "
                           "from the backend folder, then start the backend again.")


def require_student(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.student:
        raise HTTPException(status_code=403, detail="Students only.")
    return current_user


def _job_open(job: Job) -> bool:
    return not (job.closed_at or job.hidden_by_admin_at)


class ApplyIn(BaseModel):
    job_id: str          # the job's reference, as in /jobs/:jobId


@router.post("")
def apply(data: ApplyIn, student: User = Depends(require_student), db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.job_id == data.job_id).first()
    if not job or job.source != "employer":
        raise HTTPException(status_code=404, detail="Only jobs posted on SkillMap can be applied for here.")
    if not _job_open(job):
        raise HTTPException(status_code=400, detail="This job is closed.")
    if db.query(Application).filter(Application.job_id == job.id, Application.student_id == student.id).first():
        raise HTTPException(status_code=409, detail="You already applied for this job.")
    from app.services.skill_profile import EMPTY_PROFILE_MESSAGE, build_skill_profile
    if not build_skill_profile(student.id, db):
        raise HTTPException(status_code=400, detail=EMPTY_PROFILE_MESSAGE)
    a = Application(job_id=job.id, student_id=student.id)
    db.add(a)
    db.commit()
    db.refresh(a)
    return _mine(a, job)


def _mine(a: Application, job: Job, match: str | None = None, events=None, usually_days: int | None = None) -> dict:
    from app.services.application_progress import progress
    return {"id": a.id, "job_ref": job.job_id, "title": job.job_title, "company": job.company,
            "status": a.status, "status_label": STUDENT_STATUS[a.status], "applied_at": a.created_at,
            "status_changed_at": a.status_changed_at, "job_closed": not _job_open(job), "match": match,
            # 12 Oct: Applied -> Viewed -> Shortlisted -> Decision with dates, and a nudge after a quiet spell
            "progress": progress(a, events or [], _job_open(job)),
            "employer_usually_days": usually_days}


@router.get("/job/{job_ref}")
def for_job(job_ref: str, student: User = Depends(require_student), db: Session = Depends(get_db)):
    """Has this student applied for this job? (the Apply button on Job Detail)"""
    row = (db.query(Application, Job).join(Job, Job.id == Application.job_id)
           .filter(Job.job_id == job_ref, Application.student_id == student.id).first())
    if not row:
        return None
    from app.services.application_progress import events_for
    return _mine(*row, events=events_for([row[0].id], db)[row[0].id])


@router.get("/mine")
def mine(student: User = Depends(require_student), db: Session = Depends(get_db)):
    """My applications, newest first, each with the student's match for that job ("4 of 4 required")."""
    from app.routers.skillgap import skill_gap_for
    from app.services.application_progress import employer_review_days, events_for
    rows = (db.query(Application, Job).join(Job, Job.id == Application.job_id)
            .filter(Application.student_id == student.id).order_by(Application.created_at.desc()).all())
    events = events_for([a.id for a, _ in rows], db)
    usually = {}
    out = []
    for a, job in rows:
        if job.posted_by_user_id not in usually:
            usually[job.posted_by_user_id] = employer_review_days(job.posted_by_user_id, db) if job.posted_by_user_id else None
        try:
            s = skill_gap_for(student, job.job_id, db)["summary"]
            match = f"{s['matched_skills']} of {s['matched_skills'] + s['missing_skills']} required"
        except HTTPException:
            match = None
        out.append(_mine(a, job, match, events[a.id], usually[job.posted_by_user_id]))
    return out


def _open_invitations(student: User, db: Session):
    applied = {a.job_id for a in db.query(Application).filter(Application.student_id == student.id)}
    rows = (db.query(JobInvitation, Job).join(Job, Job.id == JobInvitation.job_id)
            .filter(JobInvitation.student_id == student.id, JobInvitation.dismissed_at.is_(None))
            .order_by(JobInvitation.created_at.desc()).all())
    return [(i, j) for i, j in rows if j.id not in applied and _job_open(j)]


@router.get("/invitations")
def invitations(student: User = Depends(require_student), db: Session = Depends(get_db)):
    """Employers who invited this student to apply (12 Oct), still open, not applied for, not dismissed."""
    from app.routers.skillgap import skill_gap_for
    out = []
    for i, job in _open_invitations(student, db):
        try:
            sm = skill_gap_for(student, job.job_id, db)["summary"]
            match = f"{sm['matched_skills']} of {sm['matched_skills'] + sm['missing_skills']} required"
        except HTTPException:
            match = None
        out.append({"id": i.id, "job_ref": job.job_id, "title": job.job_title, "company": job.company,
                    "invited_at": i.created_at, "match": match})
    return out


class DismissIn(BaseModel):
    dismissed: bool = True


@router.patch("/invitations/{inv_id}")
def dismiss_invitation(inv_id: int, data: DismissIn, student: User = Depends(require_student), db: Session = Depends(get_db)):
    """"Not interested": the invitation goes away for the student (the employer isn't told)."""
    i = db.query(JobInvitation).filter(JobInvitation.id == inv_id, JobInvitation.student_id == student.id).first()
    if not i:
        raise HTTPException(status_code=404, detail="Invitation not found.")
    from datetime import datetime, timezone
    i.dismissed_at = datetime.now(timezone.utc) if data.dismissed else None
    db.commit()
    return {"id": i.id, "dismissed": i.dismissed_at is not None}


@router.get("/refs")
def refs(student: User = Depends(require_student), db: Session = Depends(get_db)):
    """12 Oct: for the tags on Job Matches cards: the jobs this student applied for (with the status they see) and
    the open invitations, by job reference."""
    out = {}
    for a, job in db.query(Application, Job).join(Job, Job.id == Application.job_id).filter(Application.student_id == student.id):
        out[job.job_id] = {"applied": True, "status_label": STUDENT_STATUS[a.status]}
    for i, job in _open_invitations(student, db):
        out[job.job_id] = {"applied": False, "invited": True, "company": job.company}
    return out


@router.get("/counts")
def counts(student: User = Depends(require_student), db: Session = Depends(get_db)):
    """The sidebar badge on My applications: open invitations to apply."""
    return {"invitations": len(_open_invitations(student, db))}
