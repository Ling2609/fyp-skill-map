"""
Student side of applying (11 Oct, Employer flow batch 2; mock-ups 9 Oct boards 5 and 6).

A job posted on SkillMap (source "employer") has no outside site to apply on, so the student applies here with
their SkillMap profile: the employer then sees that profile and the student's match for this job (employer.py).
My applications lists every application with its status; the employer sets the status, and "rejected" is shown
to the student as "Not selected" (her 9 Oct mock-up, board 6).
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import engine, get_db
from app.models.application import Application, JobInvitation, OutsideApplication
from app.models.job import Job, JobSkill
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
    # 25 Oct: the reason a student gives when declining an invitation
    if "job_invitations" in inspect(engine).get_table_names() and \
            "decline_reason" not in {c["name"] for c in inspect(engine).get_columns("job_invitations")}:
        raise RuntimeError("Database not updated: run  python migrations/migrate_invitation_replies.py  "
                           "from the backend folder, then start the backend again.")


def require_student(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.student:
        raise HTTPException(status_code=403, detail="Students only.")
    return current_user


def _job_open(job: Job) -> bool:
    """The same "current" rule as Job Matches (jobs.current_jobs_filter): not gone, closed or hidden by the career
    office (12 Oct, audit: gone_at was missing here; employer posts never go "gone" today, but one rule is safer)."""
    return not (job.gone_at or job.closed_at or job.hidden_by_admin_at)


class ApplyIn(BaseModel):
    job_id: str          # the job's reference, as in /jobs/:jobId


@router.post("")
def apply(data: ApplyIn, student: User = Depends(require_student), db: Session = Depends(get_db)):
    # 21 Oct (outside audit: a timing race with an employer's edit): the job's row is locked until this application is
    # saved, so an edit saved at the same moment waits and then sees it (employer.save_edit locks the same row)
    job = db.query(Job).filter(Job.job_id == data.job_id).with_for_update().first()
    if not job or job.source != "employer":
        raise HTTPException(status_code=404, detail="Only jobs posted on SkillMap can be applied for here.")
    if not _job_open(job):
        raise HTTPException(status_code=400, detail="This job is closed.")
    if job.applications_stopped_at:          # 14 Oct: the employer stopped new applications (still deciding)
        raise HTTPException(status_code=400, detail="This job isn't taking new applications.")
    if db.query(Application).filter(Application.job_id == job.id, Application.student_id == student.id).first():
        raise HTTPException(status_code=409, detail="You already applied for this job.")
    from app.services.skill_profile import EMPTY_PROFILE_MESSAGE, build_skill_profile
    if not build_skill_profile(student.id, db):
        raise HTTPException(status_code=400, detail=EMPTY_PROFILE_MESSAGE)
    a = Application(job_id=job.id, student_id=student.id)
    _snapshot(a, student, job, db)
    # 21 Oct: keep exactly what this employer is shown now (references.md "After applying")
    from app.routers.employer import sent_copy
    a.sent_profile, a.sent_at = sent_copy(student, job, db), datetime.now(timezone.utc)
    db.add(a)
    try:
        db.commit()
    except IntegrityError:        # two clicks at once: the unique (job, student) constraint stops the second
        db.rollback()
        raise HTTPException(status_code=409, detail="You already applied for this job.")
    db.refresh(a)
    return _mine(a, job)


def _snapshot(a: Application, student: User, job: Job, db: Session) -> dict | None:
    """The applicant's required skills for the job, kept on the application for "where you stand" (14 Oct)."""
    from app.routers.skillgap import skill_gap_for
    try:
        s = skill_gap_for(student, job.job_id, db)["summary"]
    except HTTPException:
        return None
    a.match_have, a.match_total = s["matched_skills"], s["matched_skills"] + s["missing_skills"]
    a.match_at = datetime.now(timezone.utc)
    return s


def _mine(a: Application, job: Job, match: str | None = None, events=None, usually_days: int | None = None,
          extra: dict | None = None) -> dict:
    from app.services.application_progress import progress
    return {"id": a.id, "job_ref": job.job_id, "title": job.job_title, "company": job.company,
            "status": a.status, "status_label": STUDENT_STATUS[a.status], "applied_at": a.created_at,
            "status_changed_at": a.status_changed_at, "job_closed": not _job_open(job), "match": match,
            # 12 Oct: Applied -> Viewed -> Shortlisted -> Decision with dates, and a nudge after a quiet spell;
            # 14 Oct: "no_decision" once the employer's own date has passed
            "progress": progress(a, events or [], _job_open(job), decide_by=job.decide_by),
            "employer_usually_days": usually_days,
            # 14 Oct (transparency flow): the employer's date, whether the job still takes applications, why it
            # closed, and why this application wasn't selected (reason, note, the missing skills then)
            "decide_by": job.decide_by, "decide_extended_reason": job.decide_extended_reason,
            "decide_by_original": job.decide_by_original,
            "taking_applications": _job_open(job) and not job.applications_stopped_at,
            "close_reason": job.close_reason, "category": job.subcategory,
            "reason": a.reason, "note": a.note, "reason_skills": a.reason_skills or [],
            **(extra or {})}


@router.get("/job/{job_ref}/preview")
def preview_for_job(job_ref: str, view: str = "sent", student: User = Depends(require_student),
                    db: Session = Depends(get_db)):
    """21 Oct (her idea): before applying, what this employer will see, built by the SAME function as the employer's
    applicant page (employer._profile_for), so the two can't differ. Contact details are never in it: the employer gets
    them only after shortlisting."""
    job = db.query(Job).filter(Job.job_id == job_ref).first()
    if not job or job.source != "employer":
        raise HTTPException(status_code=404, detail="Only jobs posted on SkillMap can be applied for here.")
    from app.routers.employer import _profile_for, with_versions
    applied = db.query(Application).filter(Application.job_id == job.id, Application.student_id == student.id).first()
    live = _profile_for(student, job, db, contact=False)
    # 21 Oct: once applied, what she sent (as the employer sees it by default), with "see latest" if she changed since
    shown = with_versions(applied, live, view, job, db) if applied else {**live, "versions": None}
    return {**shown, "company": job.company, "job_ref": job.job_id, "applied": applied is not None}


@router.get("/job/{job_ref}/open")
def job_open_now(job_ref: str, student: User = Depends(require_student), db: Session = Depends(get_db)):
    """14 Oct: is this SkillMap job taking applications right now, and its decision date. Always fresh: Job Detail
    keeps the skill gap for 15 minutes, so a job stopped or reopened since then would show the wrong button."""
    job = db.query(Job).filter(Job.job_id == job_ref).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return {"closed": not _job_open(job), "taking_applications": _job_open(job) and not job.applications_stopped_at,
            "decide_by": job.decide_by}


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
    """My applications, newest first, each with the student's match for that job ("4 of 4 required") and, 14 Oct,
    what is happening on the job (applied / shortlisted / decided), where the student stands among the applicants
    (5 or more, required skills only) and the employer's record of deciding by their own date."""
    from app.services.application_progress import employer_review_days, events_for
    from app.services.transparency import employer_record, job_stats, stale, stand
    rows = (db.query(Application, Job).join(Job, Job.id == Application.job_id)
            .filter(Application.student_id == student.id).order_by(Application.created_at.desc()).all())
    events = events_for([a.id for a, _ in rows], db)
    stats = job_stats([job.id for _, job in rows], db)
    usually, records = {}, {}
    out = []
    for a, job in rows:
        emp = job.posted_by_user_id
        if emp not in usually:
            usually[emp] = employer_review_days(emp, db) if emp else None
            records[emp] = employer_record(emp, db) if emp else None
        s = _snapshot(a, student, job, db)           # her own count, fresh
        match = f"{s['matched_skills']} of {s['matched_skills'] + s['missing_skills']} required" if s else None
        everyone = db.query(Application).filter(Application.job_id == job.id).all()
        # Others' counts: worked out again when missing or over a day old (14 Oct audit: a profile can change after
        # applying, so a stored count can go stale). Only from 5 applicants, when "where you stand" is shown.
        if len(everyone) >= 5:
            for other in everyone:
                if other.id != a.id and stale(other):
                    person = db.get(User, other.student_id)
                    if person:
                        _snapshot(other, person, job, db)
        out.append(_mine(a, job, match, events[a.id], usually[emp],
                         {"job_stats": stats[job.id], "stand": stand(a, everyone), "employer_record": records[emp],
                          "job_changed": _job_changed(a, job, db)}))
    db.commit()                                       # the refreshed counts
    return out


def _job_changed(a: Application, job: Job, db: Session) -> dict | None:
    """21 Oct (her question; references.md "Changing a job's requirements after people applied"): the employer may
    only ask for LESS after people applied, so the student is told which required skills the job no longer asks for
    (compared with the copy kept when she applied). None when nothing she was matched on changed."""
    sent = (a.sent_profile or {}).get("job_skills")
    if not sent:
        return None
    from app.services.job_skill_store import skill_key
    now = db.query(JobSkill).filter(JobSkill.job_id == job.id).all()
    soft = {skill_key(r.skill_name) for r in now if r.skill_type == "soft"}
    req_now = {skill_key(r.skill_name) for r in now if r.skill_type == "hard" and r.level in ("required", "unspecified")}
    dropped = [name for name, level in sent if level in ("required", "unspecified")
               and skill_key(name) not in soft and skill_key(name) not in req_now]
    fit = (a.sent_profile or {}).get("fit") or {}
    was = f"{fit['have']} of {fit['total']}" if fit.get("total") else None       # her match when she applied
    return {"no_longer_required": dropped, "was": was} if dropped else None


def _open_invitations(student: User, db: Session):
    applied = {a.job_id for a in db.query(Application).filter(Application.student_id == student.id)}
    rows = (db.query(JobInvitation, Job).join(Job, Job.id == JobInvitation.job_id)
            .filter(JobInvitation.student_id == student.id, JobInvitation.dismissed_at.is_(None))
            .order_by(JobInvitation.created_at.desc()).all())
    from app.services.invitations import expired
    # 25 Oct: one with no answer ends after 14 days (the employer then sees "No reply")
    return [(i, j) for i, j in rows if j.id not in applied and _job_open(j) and not expired(i)]


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
    reason: str | None = Field(default=None, max_length=20)    # 25 Oct: optional (app/services/invitations.py)
    note: str | None = Field(default=None, max_length=400)     # "other": her own words (checked to 200 below)


@router.patch("/invitations/{inv_id}")
def dismiss_invitation(inv_id: int, data: DismissIn, student: User = Depends(require_student), db: Session = Depends(get_db)):
    """"No thanks": the invitation goes away for the student; the employer sees "Declined" and the reason, if one was
    given (25 Oct, her option D: recruiters regard a polite no better than silence; references.md). She can still
    apply while the job is open. dismissed=false takes it back (Undo)."""
    from app.services.invitations import check_reason
    i = db.query(JobInvitation).filter(JobInvitation.id == inv_id, JobInvitation.student_id == student.id).first()
    if not i:
        raise HTTPException(status_code=404, detail="Invitation not found.")
    from datetime import datetime, timezone
    if data.dismissed:
        i.decline_reason, i.decline_note = check_reason(data.reason, data.note)
        i.dismissed_at = datetime.now(timezone.utc)
    else:
        i.dismissed_at, i.decline_reason, i.decline_note = None, None, None
    db.commit()
    return {"id": i.id, "dismissed": i.dismissed_at is not None}


@router.get("/refs")
def refs(student: User = Depends(require_student), db: Session = Depends(get_db)):
    """12 Oct: for the tags on Job Matches cards: the jobs this student applied for (with the status they see) and
    the open invitations, by job reference."""
    out = {}
    for a, job in db.query(Application, Job).join(Job, Job.id == Application.job_id).filter(Application.student_id == student.id):
        out[job.job_id] = {"applied": True, "status": a.status, "status_label": STUDENT_STATUS[a.status]}
    # 20 Oct (her pick P1+P2): jobs she recorded applying for on another site get the same tag, with the site
    for o, job in (db.query(OutsideApplication, Job).join(Job, Job.id == OutsideApplication.job_id)
                   .filter(OutsideApplication.student_id == student.id)):
        out[job.job_id] = {"applied": True, "status": o.status, "status_label": OUTSIDE_STATUS.get(o.status, o.status),
                           "site": job.publisher or "another site"}
    for i, job in _open_invitations(student, db):
        out[job.job_id] = {"applied": False, "invited": True, "company": job.company}
    return out


@router.get("/counts")
def counts(student: User = Depends(require_student), db: Session = Depends(get_db)):
    """The sidebar badge on My applications: open invitations to apply."""
    return {"invitations": len(_open_invitations(student, db))}


# ── Jobs applied for on other sites (20 Oct) ─────────────────────────────────────────────────────────────────────
# Statuses from the trackers in the research (Indeed: Interviewing / Offer received / Not selected; Huntr: Applied,
# Interviewing, Offer, Rejected), worded as the student would say them
OUTSIDE_STATUS = {"applied": "Applied", "interviewing": "Interviewing", "offer": "Offer", "not_selected": "Not selected",
                  "withdrew": "Withdrew"}


def _outside(o: OutsideApplication, job: Job) -> dict:
    return {"id": o.id, "job_ref": job.job_id, "title": job.job_title, "company": job.company,
            "location": job.location, "publisher": job.publisher, "source_url": job.source_url,
            "status": o.status, "status_label": OUTSIDE_STATUS.get(o.status, o.status),
            "created_at": o.created_at, "status_changed_at": o.status_changed_at,
            # 20 Oct: False once the latest job search no longer returns the ad (hidden, not deleted)
            "listed": job.gone_at is None}


class OutsideIn(BaseModel):
    job_id: str


@router.post("/outside")
def record_outside(data: OutsideIn, student: User = Depends(require_student), db: Session = Depends(get_db)):
    """"Yes, I applied" on a job from another site. Recording twice returns the same record."""
    job = db.query(Job).filter(Job.job_id == data.job_id).first()
    if not job or job.source != "live":
        raise HTTPException(status_code=404, detail="Only jobs on other sites can be recorded here.")
    o = db.query(OutsideApplication).filter(OutsideApplication.job_id == job.id,
                                            OutsideApplication.student_id == student.id).first()
    if not o:
        o = OutsideApplication(job_id=job.id, student_id=student.id, status="applied")
        db.add(o)
        try:
            db.commit()
        except IntegrityError:                       # recorded in another tab at the same moment
            db.rollback()
            o = db.query(OutsideApplication).filter(OutsideApplication.job_id == job.id,
                                                    OutsideApplication.student_id == student.id).first()
        db.refresh(o)
    return _outside(o, job)


def _own_outside(oid: int, student: User, db: Session) -> tuple[OutsideApplication, Job]:
    row = (db.query(OutsideApplication, Job).join(Job, Job.id == OutsideApplication.job_id)
           .filter(OutsideApplication.id == oid, OutsideApplication.student_id == student.id).first())
    if not row:
        raise HTTPException(status_code=404, detail="Record not found.")
    return row


class OutsideStatusIn(BaseModel):
    status: str


@router.patch("/outside/{oid}")
def update_outside(oid: int, data: OutsideStatusIn, student: User = Depends(require_student),
                   db: Session = Depends(get_db)):
    o, job = _own_outside(oid, student, db)
    if data.status not in OUTSIDE_STATUS:
        raise HTTPException(status_code=400, detail="Pick a status from the list.")
    if data.status != o.status:
        o.status, o.status_changed_at = data.status, datetime.now(timezone.utc)
        db.commit()
    return _outside(o, job)


@router.delete("/outside/{oid}", status_code=204)
def delete_outside(oid: int, student: User = Depends(require_student), db: Session = Depends(get_db)):
    """Undo, or removing a record the student no longer wants (nothing else depends on it)."""
    o, _ = _own_outside(oid, student, db)
    db.delete(o)
    db.commit()


@router.get("/outside")
def my_outside(student: User = Depends(require_student), db: Session = Depends(get_db)):
    rows = (db.query(OutsideApplication, Job).join(Job, Job.id == OutsideApplication.job_id)
            .filter(OutsideApplication.student_id == student.id).order_by(OutsideApplication.created_at.desc()).all())
    # 20 Oct (her review): her match for each job, as on SkillMap applications ("3 of 5 required"), worked out now
    from app.routers.skillgap import skill_gap_for
    out = []
    for o, j in rows:
        try:
            sm = skill_gap_for(student, j.job_id, db)["summary"]
            match = f"{sm['matched_skills']} of {sm['matched_skills'] + sm['missing_skills']} required"
        except HTTPException:
            match = None
        out.append({**_outside(o, j), "match": match})
    return out


@router.get("/outside/job/{job_ref}")
def outside_for_job(job_ref: str, student: User = Depends(require_student), db: Session = Depends(get_db)):
    """Has the student recorded applying for this job? (Job Detail)"""
    row = (db.query(OutsideApplication, Job).join(Job, Job.id == OutsideApplication.job_id)
           .filter(Job.job_id == job_ref, OutsideApplication.student_id == student.id).first())
    return _outside(*row) if row else None
