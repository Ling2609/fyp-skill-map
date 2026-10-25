"""
Employer flow, batch 1 (11 Oct; mock-ups 9 Oct "SkillMap Employer Flow Mock-ups", boards 1 and 2).

An employer is one of the university's industry partners. They register with a company name, Admin approves them
(admin.py), and only then can they use these endpoints:
  - My jobs: their own posts, open or closed, with close / reopen
  - Post a job in two steps: SkillMap reads the skills in the ad (the same extractor and quote check as live jobs,
    so a posted job is matched exactly like any other), the employer checks them (Required / Nice to have / Taught on
    the job; remove, add), then publishes. The employer's check is the human review of the extraction (Amershi et
    al. 2019, references.md "Reviewing AI-suggested skills"), as Admin does for module skills.

A published post is source "employer": Job Matches shows it like a live job (marked "Apply on SkillMap") until
the employer closes it; it never expires by age.

Batch 2 (11 Oct; mock-ups boards 3A and 4): the applicants of each post as a list, best match first, with a status
per applicant (Applied / Shortlisted / Accepted / Rejected), and one applicant's profile for this job: their match
with the evidence for each required skill, projects, strongest modules (grades only if the student allows it),
certificates and awards. An employer sees only students who applied to one of their own posts.
"""
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.application import Application, ApplicationEvent, JobInvitation
from app.models.job import Job, JobSkill
from app.models.user import User, UserRole
from app.routers.auth import get_current_user
from app.services.invitations import answered_by as invite_answered, state as invite_state
from app.services.job_skill_store import check_job_skills, skill_key
from app.services.transparency import (CLOSE_REASONS, DEFAULT_DECIDE_DAYS, EXTEND_DAYS, WAITING, clear_reason,
                                       decide_by_from, past_date, set_reason)

router = APIRouter(prefix="/employer", tags=["employer"])

MIN_TITLE, MIN_DESCRIPTION, MAX_DESCRIPTION = 3, 80, 12000
MAX_SKILLS = 40
LEVELS = ("required", "preferred", "trained")
ADDED_BY_EMPLOYER = "added by employer"      # extracted_by for a skill the employer typed (no quote from the ad)


def require_employer(current_user: User = Depends(get_current_user)) -> User:
    """Approved employers only. A pending or rejected employer gets 403 with their status (the page explains it)."""
    if current_user.role != UserRole.employer:
        raise HTTPException(status_code=403, detail="Employers only.")
    if current_user.employer_status != "approved":
        raise HTTPException(status_code=403, detail=f"Employer account {current_user.employer_status or 'pending'}.")
    return current_user


def _status(job: Job) -> str:
    if job.hidden_by_admin_at:
        return "hidden"          # Admin hid it: kept, not shown to students
    return "closed" if job.closed_at else "open"


def _row(job: Job, skills: list[JobSkill], statuses: list[str] = ()) -> dict:
    hard = [s for s in skills if s.skill_type == "hard"]
    return {"id": job.id, "job_ref": job.job_id, "title": job.job_title, "location": job.location,
            "salary": job.salary, "category": job.subcategory, "status": _status(job),
            "posted_at": job.listing_date, "closed_at": job.closed_at,
            "required": sum(1 for s in hard if s.level in ("required", "unspecified")),
            "preferred": sum(1 for s in hard if s.level == "preferred"),
            "applicants": len(statuses), "new_applicants": sum(1 for st in statuses if st == "applied"),
            # 12 Oct: still waiting for a decision (closing the job asks what to tell them)
            "waiting": sum(1 for st in statuses if st in ("applied", "shortlisted")),
            # 14 Oct (transparency flow): the promised decision date, whether it was extended (once), whether new
            # applications are stopped, why the job closed
            "decide_by": job.decide_by, "decide_extended": job.decide_extended_reason is not None,
            "decide_extended_reason": job.decide_extended_reason, "decide_by_original": job.decide_by_original,
            "past_date": past_date(job),
            "stopped": job.applications_stopped_at is not None, "close_reason": job.close_reason}


def _statuses(job_ids: list[int], db: Session) -> dict[int, list[str]]:
    out = {}
    for job_id, status in db.query(Application.job_id, Application.status).filter(Application.job_id.in_(job_ids)):
        out.setdefault(job_id, []).append(status)
    return out


def _own_job(job_id: int, employer: User, db: Session) -> Job:
    job = db.query(Job).filter(Job.id == job_id, Job.posted_by_user_id == employer.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


# ── My jobs ──────────────────────────────────────────────────────────────────────────────────────────────────────
@router.get("/jobs")
def my_jobs(employer: User = Depends(require_employer), db: Session = Depends(get_db)):
    jobs = db.query(Job).filter(Job.posted_by_user_id == employer.id).order_by(Job.listing_date.desc()).all()
    skills = {}
    for s in db.query(JobSkill).filter(JobSkill.job_id.in_([j.id for j in jobs])):
        skills.setdefault(s.job_id, []).append(s)
    statuses = _statuses([j.id for j in jobs], db)
    return [_row(j, skills.get(j.id, []), statuses.get(j.id, [])) for j in jobs]


class CloseIn(BaseModel):
    closed: bool | None = None
    reason: str | None = None          # 14 Oct: closing needs one: filled_skillmap / filled_other / not_filling
    stopped: bool | None = None        # 14 Oct: "Stop new applications" (True) / "Take applications again" (False)


@router.patch("/jobs/{job_id}")
def close_or_reopen(job_id: int, data: CloseIn, employer: User = Depends(require_employer),
                    db: Session = Depends(get_db)):
    """Close (hiring finished), reopen, or stop / restart new applications.
    14 Oct (her design; Homerun, Indeed, CareerPlug in references.md): two different actions. Stopping new
    applications takes the job off Job Matches while the employer keeps deciding by their date. Closing needs a
    reason, and every applicant still waiting is told the outcome with that reason (no silent close)."""
    job = _own_job(job_id, employer, db)
    now = datetime.now(timezone.utc)
    if data.stopped is not None and not job.closed_at:
        # 25 Oct (her review: rules for stopping and restarting): taking applications again only before the decision
        # date passes (a new applicant would at once see "No decision"). The date itself never moves with this: it is
        # the promise to people who already applied, and only "Move decision date" (once, up to 2 weeks) changes it.
        if data.stopped is False and job.applications_stopped_at and past_date(job):
            raise HTTPException(status_code=400, detail="Your decision date has passed, so the job can't take new applications. Decide on the applicants waiting, then close it.")
        job.applications_stopped_at = now if data.stopped else None
    if data.closed is True and not job.closed_at:
        if data.reason not in CLOSE_REASONS:
            raise HTTPException(status_code=400, detail="Say why you are closing the job.")
        if data.reason == "filled_skillmap" and not db.query(Application).filter(
                Application.job_id == job.id, Application.status == "accepted").first():
            raise HTTPException(status_code=400, detail="Mark the person you hired as Accepted first.")
        job.closed_at, job.close_reason = now, data.reason
        for a in db.query(Application).filter(Application.job_id == job.id, Application.status.in_(WAITING)):
            a.status, a.status_changed_at = "rejected", now
            clear_reason(a)
            a.reason = CLOSE_REASONS[data.reason]          # job_filled / job_cancelled: the student sees why
            db.add(ApplicationEvent(application_id=a.id, kind="status", status="rejected", created_at=now))
    elif data.closed is False:
        job.closed_at, job.close_reason = None, None
    db.commit()
    return _row(job, db.query(JobSkill).filter(JobSkill.job_id == job.id).all(), _statuses([job.id], db).get(job.id, []))


class ExtendIn(BaseModel):
    days: int
    reason: str = Field(max_length=200)


@router.post("/jobs/{job_id}/extend")
def extend_decision_date(job_id: int, data: ExtendIn, employer: User = Depends(require_employer),
                         db: Session = Depends(get_db)):
    """14 Oct: move the decision date once, by 1 or 2 weeks, with a reason the applicants see."""
    job = _own_job(job_id, employer, db)
    if job.closed_at:
        raise HTTPException(status_code=400, detail="This job is closed.")
    if job.decide_extended_reason is not None:
        raise HTTPException(status_code=400, detail="The decision date can be moved once only.")
    # 25 Oct (her review: "a rule for delay, a limit"): only before the date passes. Once it has passed, applicants
    # still waiting already see "No decision"; pushing the date back then would hide a missed promise.
    if past_date(job):
        raise HTTPException(status_code=400, detail="Your decision date has passed, so it can't be moved. Decide on the applicants still waiting.")
    if data.days not in EXTEND_DAYS:
        raise HTTPException(status_code=400, detail="Move it by 1 or 2 weeks.")
    reason = " ".join(data.reason.split())
    if len(reason) < 5:
        raise HTTPException(status_code=400, detail="Tell applicants why, in a few words.")
    from datetime import timedelta
    job.decide_by_original = job.decide_by           # 14 Oct audit: the first promise stays on record
    job.decide_by = (job.decide_by or datetime.now(timezone.utc)) + timedelta(days=data.days)
    job.decide_extended_reason = reason
    db.commit()
    return _row(job, db.query(JobSkill).filter(JobSkill.job_id == job.id).all(), _statuses([job.id], db).get(job.id, []))


# ── Post a job, step 1: read the skills in the ad ────────────────────────────────────────────────────────────────
class AdIn(BaseModel):
    title: str = Field(max_length=120)
    description: str = Field(max_length=MAX_DESCRIPTION)


def _check_ad(title: str, description: str):
    if len(title.strip()) < MIN_TITLE:
        raise HTTPException(status_code=400, detail="Add a job title.")
    if len(description.strip()) < MIN_DESCRIPTION:
        raise HTTPException(status_code=400, detail=f"Describe the job in at least {MIN_DESCRIPTION} characters.")


@router.post("/jobs/read")
def read_skills(data: AdIn, employer: User = Depends(require_employer)):
    """The skills SkillMap reads in the ad, for the employer to check. Nothing is saved."""
    _check_ad(data.title, data.description)
    from app.routers.jobs import get_extractor
    try:
        # 24 Oct (TC-64): 2 tries, not 3: an employer is waiting on this page
        mentions = get_extractor().extract_job_skills_with_evidence(data.title.strip(), data.description, retries=2)
    except Exception as e:      # Groq down or its daily limit: the employer can type the skills themselves
        print(f"[employer] skill reading failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=503, detail="SkillMap couldn't read the skills just now. Try again in a "
                                                    "few minutes, or add the skills yourself.")
    checked = check_job_skills(mentions, data.description)
    # 14 Oct: what the AI proposed and what the checks kept / rejected (MongoDB extraction_records); what the employer
    # then changes before publishing is added to the same record
    from app.nlp.skill_extractor import JOB_EVIDENCE_VERSION
    from app.services.extraction_records import record
    record_id = record("job_ad", model=get_extractor().model, prompt_version=JOB_EVIDENCE_VERSION, user_id=employer.id,
                       proposed=mentions, kept=checked.kept, rejected=checked.rejected, tidy=checked.tidy,
                       outcome="suggested")
    hard = [{"name": k["skill"].strip(), "level": _level(k.get("level")), "quote": k.get("evidence_quote") or "",
             "group": k.get("alternative_group") or ""} for k in checked.kept if k.get("type") == "hard"]
    soft = [{"name": k["skill"].strip(), "level": k.get("level") or "unspecified",
             "quote": k.get("evidence_quote") or ""} for k in checked.kept if k.get("type") == "soft"]
    return {"skills": hard, "soft": soft, "record_id": record_id}


def _level(level: str | None) -> str:
    """The employer sees three boxes; "unspecified" (the ad doesn't say) counts as required in matching, so it
    starts there (the employer can move it)."""
    return level if level in LEVELS else "required"


# ── Post a job, step 2: publish ──────────────────────────────────────────────────────────────────────────────────
class SkillIn(BaseModel):
    name: str = Field(max_length=80)
    level: str
    quote: str = Field(default="", max_length=600)     # from step 1; empty = typed by the employer
    group: str = Field(default="", max_length=120)


class SoftIn(BaseModel):
    name: str = Field(max_length=80)
    level: str = "unspecified"
    quote: str = Field(default="", max_length=600)


class RequirementsIn(BaseModel):
    """19 Oct (option F): optional, chosen by the employer; students see them as pills on Job Detail. "Other" is
    always possible: a qualification or languages in the employer's own words (her rule, 19 Oct)."""
    min_qualification: str = Field(default="", max_length=80)    # a POST_LEVELS key, own words, or "" = not required
    study_field: str = Field(default="", max_length=200)
    languages: list[str] = Field(default=[], max_length=12)


MAX_TYPED = 40          # a language or qualification typed under "Other"


def _set_requirements(job: Job, data: RequirementsIn):
    from app.services.ad_requirements import LANGUAGE_NAMES
    qual = " ".join(data.min_qualification.split())
    if len(qual) > MAX_TYPED:
        raise HTTPException(status_code=400, detail=f"Keep the qualification to {MAX_TYPED} characters.")
    langs, seen = [], set()
    for x in data.languages:
        name = " ".join(x.split())
        if not name or name.lower() in seen:
            continue
        if len(name) > MAX_TYPED or not re.fullmatch(r"[^\W\d_][\w '()-]*", name):
            raise HTTPException(status_code=400, detail=f'"{name[:20]}" doesn\'t look like a language.')
        seen.add(name.lower())
        langs.append(next((n for n in LANGUAGE_NAMES if n.lower() == name.lower()), name))   # list spelling
    job.min_qualification = qual or None
    job.study_field = " ".join(data.study_field.split()) or None
    # list languages first (in list order), then the ones typed under "Other"
    job.languages = ([n for n in LANGUAGE_NAMES if n in langs] + [n for n in langs if n not in LANGUAGE_NAMES]) or None


class JobIn(AdIn, RequirementsIn):
    location: str = Field(max_length=120)
    salary: str = Field(default="", max_length=60)
    category: str = Field(max_length=80)
    skills: list[SkillIn]
    soft: list[SoftIn] = []
    decide_days: int = DEFAULT_DECIDE_DAYS     # 14 Oct: "Decide by": 14, 28, 30 or 42 days from posting
    record_id: str | None = Field(default=None, max_length=40)   # 14 Oct: the "Read skills" these came from


def _checked_skills(data) -> tuple[list, set]:
    """The skills to save: tidied, one per canonical name, a known level, at least one required, at most MAX_SKILLS."""
    seen, skills = set(), []
    for s in data.skills:
        name = " ".join(s.name.split())
        if not name or skill_key(name) in seen:
            continue
        if s.level not in LEVELS:
            raise HTTPException(status_code=400, detail=f"Unknown level for {name}.")
        seen.add(skill_key(name))
        skills.append((name, s))
    if not any(s.level == "required" for _, s in skills):
        raise HTTPException(status_code=400, detail="Add at least one required skill: students are matched on them.")
    if len(skills) > MAX_SKILLS:
        raise HTTPException(status_code=400, detail=f"Keep it to {MAX_SKILLS} skills or fewer.")
    return skills, seen


def _skill_rows(job: Job, data, skills: list, seen: set) -> list[JobSkill]:
    from app.nlp.skill_extractor import JOB_EVIDENCE_VERSION
    from app.services.evidence import check_quote
    rows = []
    for name, s in skills:
        # A quote is kept only if it is really in the ad that is being saved (the ad may have been edited)
        found, score, _ = check_quote(s.quote, data.description) if s.quote else (False, None, -1)
        rows.append(JobSkill(job_id=job.id, job_ref=job.job_id, skill_name=name, skill_type="hard", level=s.level,
                             extracted_by=JOB_EVIDENCE_VERSION if found else ADDED_BY_EMPLOYER,
                             evidence_quote=s.quote if found else None, match_score=score if found else None,
                             alternative_group=(s.group or None) if found else None))
    for k in data.soft:      # soft skills: saved as read (listed separately to students, never in the match)
        name = " ".join(k.name.split())
        if name and skill_key(name) not in seen:
            seen.add(skill_key(name))
            rows.append(JobSkill(job_id=job.id, job_ref=job.job_id, skill_name=name, skill_type="soft",
                                 level=k.level if k.level in (*LEVELS, "unspecified") else "unspecified",
                                 extracted_by=JOB_EVIDENCE_VERSION, evidence_quote=k.quote or None))
    return rows


@router.post("/jobs")
def publish(data: JobIn, employer: User = Depends(require_employer), db: Session = Depends(get_db)):
    _check_ad(data.title, data.description)
    if len(data.location.strip()) < 2:
        raise HTTPException(status_code=400, detail="Add where the job is based.")
    if not data.category.strip():
        raise HTTPException(status_code=400, detail="Pick a job category.")
    skills, seen = _checked_skills(data)
    now = datetime.now(timezone.utc)
    job = Job(job_id=f"skillmap-{uuid.uuid4().hex[:12]}", job_title=data.title.strip(), company=employer.company_name,
              location=data.location.strip(), category="Information & Communication Technology",
              subcategory=data.category.strip(), salary=data.salary.strip() or None, description=data.description,
              source="employer", listing_date=now, country="MY", posted_by_user_id=employer.id,
              decide_by=decide_by_from(data.decide_days, now))
    _set_requirements(job, data)
    db.add(job)
    db.flush()
    rows = _skill_rows(job, data, skills, seen)
    db.add_all(rows)
    db.commit()
    _review_job(data, job, employer)
    # 12 Oct: say straight away how many visible graduates fit the new job, so the employer can invite them
    fits = _graduates_who_fit([job], db, limit=None)
    # 24 Oct (her point: with 3-4 required skills "at least half" is easy, so the count sounds bigger than it is): the
    # "is live" note names the graduates with ALL the required skills; it falls back to "at least half" when none do
    return {**_row(job, rows), "graduates_fit": len(fits),
            "graduates_all_required": sum(1 for g in fits if g["have"] == g["total"])}


# ── Edit a posted job (13 Oct; her design after research, references.md "Editing a published job") ──────────────
# The Post a job page, filled in. Title, location and category are locked once published (AJobThing locks the title;
# some boards lock title, location and industry; Indeed advises a new post for those): to change them, close the
# job and post a new one. Description, salary and skills can change; fixing a skill SkillMap misread is the main
# reason to edit. The posted date stays. Applicants stay attached; their match is worked out from the new skills.
@router.get("/jobs/{job_id}/edit")
def job_for_edit(job_id: int, employer: User = Depends(require_employer), db: Session = Depends(get_db)):
    job = _own_job(job_id, employer, db)
    if job.hidden_by_admin_at:
        raise HTTPException(status_code=400, detail="The career office hid this job, so it can't be edited.")
    rows = db.query(JobSkill).filter(JobSkill.job_id == job.id).order_by(JobSkill.id).all()
    hard = [r for r in rows if r.skill_type == "hard"]
    return {**_row(job, hard, _statuses([job.id], db).get(job.id, [])),
            "description": job.description or "",
            "min_qualification": job.min_qualification or "", "study_field": job.study_field or "",
            "languages": job.languages or [],
            "skills": [{"name": r.skill_name, "level": r.level if r.level in LEVELS else "required",
                        "quote": r.evidence_quote or "", "group": r.alternative_group or ""} for r in hard],
            "soft": [{"name": r.skill_name, "level": r.level or "unspecified", "quote": r.evidence_quote or ""}
                     for r in rows if r.skill_type == "soft"]}


class EditIn(RequirementsIn):
    description: str = Field(max_length=MAX_DESCRIPTION)
    salary: str = Field(default="", max_length=60)
    skills: list[SkillIn]
    soft: list[SoftIn] = []
    record_id: str | None = Field(default=None, max_length=40)   # set when the skills were read again


def _review_job(data, job: Job, employer: User):
    """14 Oct: what the employer kept, removed, added or moved to another level, against SkillMap's reading."""
    if not getattr(data, "record_id", None):
        return
    from app.services.extraction_records import review_against
    final = {" ".join(x.name.split()): x.level for x in [*data.skills, *data.soft] if x.name.strip()}
    review_against(data.record_id, "employer", list(final), source=job.job_id, user_id=employer.id,
                   levels_after=final)


QUAL_ORDER = ["certificate", "diploma", "advanced_diploma", "bachelor", "master", "phd"]


def _asks_for_more(job: Job, data: "EditIn", skills: list, db: Session) -> list[str]:
    """21 Oct (her question: unfair to students who already applied? references.md "Changing a job's requirements
    after people applied"): once anyone has applied, an edit may fix the ad or ask for LESS (remove a required skill,
    make one nice-to-have, drop a language), but not ask for MORE: Indeed advises a new post for changed requirements;
    UW-Madison HR needs a new posting to narrow qualifications; "not open to an employer to change the qualifications
    prescribed in the advertisement midstream" (India's Supreme Court). Returns what would be asked for more."""
    if not db.query(Application.id).filter(Application.job_id == job.id).first():
        return []
    old_req = {skill_key(r.skill_name) for r in db.query(JobSkill).filter(
        JobSkill.job_id == job.id, JobSkill.skill_type == "hard", JobSkill.level.in_(("required", "unspecified")))}
    more = [f"{name} as a required skill" for name, sk in skills if sk.level == "required" and skill_key(name) not in old_req]
    old_q, new_q = (job.min_qualification or "").strip(), " ".join(data.min_qualification.split())
    if new_q and new_q != old_q and not (old_q in QUAL_ORDER and new_q in QUAL_ORDER
                                         and QUAL_ORDER.index(new_q) < QUAL_ORDER.index(old_q)):
        more.append("a higher qualification" if old_q else "a qualification")
    new_field = " ".join(data.study_field.split())
    if new_field and new_field.lower() != (job.study_field or "").strip().lower():
        more.append("a field of study")
    old_langs = {x.lower() for x in (job.languages or [])}
    more += [f"{x.strip()} as a language" for x in data.languages if x.strip() and x.strip().lower() not in old_langs]
    return more


@router.put("/jobs/{job_id}")
def save_edit(job_id: int, data: EditIn, employer: User = Depends(require_employer), db: Session = Depends(get_db)):
    job = _own_job(job_id, employer, db)
    if job.hidden_by_admin_at:
        raise HTTPException(status_code=400, detail="The career office hid this job, so it can't be edited.")
    _check_ad(job.job_title, data.description)
    skills, seen = _checked_skills(data)
    # 21 Oct (outside audit): lock the job's row so an application made at the same moment is either counted here or
    # waits for this edit (applications.apply locks the same row); held until the commit below
    db.query(Job).filter(Job.id == job.id).with_for_update().one()
    more = _asks_for_more(job, data, skills, db)
    if more:
        raise HTTPException(status_code=409, detail=(
            f"People have already applied under this job's requirements, so it can't ask for more now "
            f"({', '.join(more)}). Post a new job for the new requirements, and close this one when you're ready."))
    job.description = data.description
    job.salary = data.salary.strip() or None
    _set_requirements(job, data)
    job.formatted_description = None          # the students' bullet-point version is made again from the new text
    db.query(JobSkill).filter(JobSkill.job_id == job.id).delete()
    rows = _skill_rows(job, data, skills, seen)
    db.add_all(rows)
    db.commit()
    _review_job(data, job, employer)
    from app.routers.recommend import forget_job
    forget_job(job.id)                        # Job Matches rebuilds this job from the saved skills
    return _row(job, rows, _statuses([job.id], db).get(job.id, []))


# ── Applicants (batch 2) ─────────────────────────────────────────────────────────────────────────────────────────
STATUSES = ("applied", "shortlisted", "accepted", "rejected")


def _programme(student: User, db: Session) -> str:
    from app.models.programme import Intake, Programme
    programme = db.get(Programme, student.programme_id) if student.programme_id else None
    intake = db.get(Intake, student.intake_id) if student.intake_id else None
    return " · ".join(x for x in (programme.name if programme else "", intake.code if intake else "") if x)


def _fit(student: User, job: Job, db: Session) -> dict | None:
    """The student's match for this job: the same skill gap the student sees on Job Detail."""
    from app.routers.skillgap import skill_gap_for
    try:
        return skill_gap_for(student, job.job_id, db)
    except HTTPException:          # the student removed everything from their profile after applying
        return None


def _applicant(a: Application, student: User, job: Job, db: Session) -> dict:
    gap = _fit(student, job, db)
    have = len(gap["matched_skills"]) if gap else 0
    total = have + len(gap["missing_skills"]) if gap else 0
    if gap:
        a.match_have, a.match_total = have, total      # 14 Oct: kept for the students' "where you stand"
        a.match_at = datetime.now(timezone.utc)
    from app.services.application_progress import first_seen
    events = db.query(ApplicationEvent).filter(ApplicationEvent.application_id == a.id).all()
    return {"id": a.id, "name": f"{student.first_name} {student.last_name}", "programme": _programme(student, db),
            # 12 Oct: shown bold with "Not opened" until the employer opens the profile (like an unread email)
            "opened": first_seen(a, events) is not None,
            # 25 Oct: only when the application answers an open invitation (not after "No thanks" / "No reply")
            "invited": invite_answered(db.query(JobInvitation).filter(JobInvitation.job_id == job.id,
                                                                      JobInvitation.student_id == student.id).first(), a),
            "status": a.status, "applied_at": a.created_at, "status_changed_at": a.status_changed_at,
            "have": have, "total": total, "missing": [m["job_skill"] for m in gap["missing_skills"]] if gap else [],
            "reason": a.reason, "note": a.note}


@router.get("/jobs/{job_id}/applicants")
def applicants(job_id: int, employer: User = Depends(require_employer), db: Session = Depends(get_db)):
    """One post with its applicants, best match first (most required skills they have, then earliest)."""
    job = _own_job(job_id, employer, db)
    skills = db.query(JobSkill).filter(JobSkill.job_id == job.id).order_by(JobSkill.id).all()
    rows = (db.query(Application, User).join(User, User.id == Application.student_id)
            .filter(Application.job_id == job.id).all())
    people = [_applicant(a, u, job, db) for a, u in rows]
    db.commit()                                   # the refreshed counts
    people.sort(key=lambda p: (-(p["have"] / p["total"] if p["total"] else 0), p["applied_at"]))
    return {"job": {**_row(job, skills, [a.status for a, _ in rows]),
                    "required_names": [s.skill_name for s in skills if s.skill_type == "hard"
                                       and s.level in ("required", "unspecified")]},
            "applicants": people}


def _own_application(app_id: int, employer: User, db: Session) -> tuple[Application, Job, User]:
    row = (db.query(Application, Job, User).join(Job, Job.id == Application.job_id)
           .join(User, User.id == Application.student_id)
           .filter(Application.id == app_id, Job.posted_by_user_id == employer.id).first())
    if not row:
        raise HTTPException(status_code=404, detail="Application not found.")
    return row


class StatusIn(BaseModel):
    status: str
    undo: bool = False       # 12 Oct: the Undo in the "Shortlisted" toast puts the previous status back
    # 14 Oct: why "Not selected" (optional; "other" needs the note), shown to the student
    reason: str | None = None
    note: str | None = Field(default=None, max_length=400)


def _change_status(a: Application, job: Job, student: User, data: "StatusIn", db: Session):
    """One status change with its event; "rejected" keeps the reason, note and (for missing skills) the student's
    missing required skills at that moment; any other status clears them."""
    if data.status == "rejected":
        missing = None
        if data.reason == "missing_skills":
            gap = _fit(student, job, db)
            missing = [m["job_skill"] for m in gap["missing_skills"]] if gap else []
        set_reason(a, data.reason, data.note, missing)
    else:
        clear_reason(a)
    if a.status != data.status:
        a.status = data.status
        a.status_changed_at = datetime.now(timezone.utc)
        db.add(ApplicationEvent(application_id=a.id, kind="status", status=data.status, created_at=a.status_changed_at))


@router.patch("/applications/{app_id}")
def set_status(app_id: int, data: StatusIn, employer: User = Depends(require_employer), db: Session = Depends(get_db)):
    """The employer moves an application on; the student sees it on My applications ("rejected" as "Not selected").
    Status rule (12 Oct, after an audit asked for one): any status can follow any other, so a mistake can be put
    right (ATS boards let recruiters move or un-reject candidates). The safeguards are in the UI: Accepted and
    Rejected ask first and say what the student sees; Shortlisted and Applied have Undo, which removes the change.
    Every change is an event, and the student's progress shows the current state with its dates."""
    if data.status not in STATUSES:
        raise HTTPException(status_code=400, detail="Unknown status.")
    a, job, student = _own_application(app_id, employer, db)
    if data.undo:
        # Undo removes the change it undoes (so the student's progress and the employer's activity don't show a
        # change that was taken back) and puts the previous status and its time back
        last = (db.query(ApplicationEvent).filter(ApplicationEvent.application_id == a.id, ApplicationEvent.kind == "status")
                .order_by(ApplicationEvent.created_at.desc(), ApplicationEvent.id.desc()).first())
        if last and last.status == a.status:
            db.delete(last)
            db.flush()
            before = (db.query(ApplicationEvent).filter(ApplicationEvent.application_id == a.id, ApplicationEvent.kind == "status")
                      .order_by(ApplicationEvent.created_at.desc(), ApplicationEvent.id.desc()).first())
            # the status before the undone change comes from the history, not from the request (12 Oct, found by the
            # audit's edge-case tests: an undo could set any status)
            a.status = before.status if before else "applied"
            a.status_changed_at = before.created_at if before else None
            if a.status != "rejected":
                clear_reason(a)
            db.commit()
    elif a.status != data.status or data.status == "rejected":
        _change_status(a, job, student, data, db)
        db.commit()
    return {"id": a.id, "status": a.status, "status_changed_at": a.status_changed_at, "reason": a.reason, "note": a.note}


class BulkIn(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=200)
    status: str = "rejected"
    reason: str | None = None
    note: str | None = Field(default=None, max_length=400)


@router.post("/applications/bulk")
def set_status_many(data: BulkIn, employer: User = Depends(require_employer), db: Session = Depends(get_db)):
    """14 Oct: tick several applicants -> Not selected, with one optional reason (each student sees their own missing
    skills for "missing skills"). All or nothing: every id must be one of this employer's applications.
    21 Oct (her question; references.md "Actions on several applicants at once"): Shortlisted too, as Greenhouse,
    Workable, Kula, Homerun and 100Hires move several candidates to a stage at once. Only applications still at Applied
    are shortlisted (a ticked Accepted one isn't moved back). Accepted stays one at a time: none of those tools hires
    in bulk, and an offer is a decision about one person."""
    if data.status not in ("rejected", "shortlisted"):
        raise HTTPException(status_code=400, detail="Only Shortlisted or Not selected can be given to several applicants at once.")
    rows = [_own_application(i, employer, db) for i in dict.fromkeys(data.ids)]
    if data.status == "shortlisted":
        rows = [r for r in rows if r[0].status == "applied"]
        one = StatusIn(status="shortlisted")
    else:
        one = StatusIn(status="rejected", reason=data.reason, note=data.note)
    for a, job, student in rows:
        _change_status(a, job, student, one, db)
    db.commit()
    return {"updated": len(rows)}


CONTACT_STATUSES = ("shortlisted", "accepted")    # contact details are shared from Shortlisted on (14 Oct)


def _profile_for(student: User, job: Job, db: Session, contact: bool) -> dict:
    """A student's match for one of the employer's jobs (each required skill with where it comes from) and their
    showcase profile. Grades only if the student allows employers to see them. Contact details (email, phone, city,
    available from) only once the employer has shortlisted them (14 Oct, her rule; references.md "Contact details"):
    contacting someone then always shows on SkillMap as a shortlist, which the other applicants can see."""
    from app.services.showcase import build_showcase, grade_letter
    show_grades = bool(student.show_grades_to_employers)
    gap = _fit(student, job, db)
    fit = None
    if gap:
        fit = {"have": len(gap["matched_skills"]), "total": len(gap["matched_skills"]) + len(gap["missing_skills"]),
               "matched": [{"skill": m["job_skill"], "source": m["evidence_source"],
                            # a module's name, or "Project: X" / "Certification: Y" / "Award: Z" (worded for the student)
                            "from": (m["matched_via_module"] or "").replace("added by you", "added by the student"),
                            "grade": grade_letter(m["grade"]) if show_grades and m["evidence_source"] == "module" else ""}
                           for m in gap["matched_skills"]],
               "missing": [m["job_skill"] for m in gap["missing_skills"]],
               # 21 Oct (her rule: show every strength, never a "no" that isn't required): the ad's nice-to-haves she
               # HAS, and skills the ad says are learnt on the job that she already has; nice-to-haves she lacks are
               # not sent to the employer at all
               "nice_have": [n["job_skill"] for n in gap["nice_to_have"] if n["has"]],
               "on_job_have": [x["job_skill"] for x in gap.get("learn_on_job", []) if x["has"]]}
    # 21 Oct (her idea): the projects and experience that use this job's skills come first
    job_skills = [] if not gap else (
        [m["job_skill"] for m in gap["matched_skills"]] + [m.get("matched_graduate_skill") or "" for m in gap["matched_skills"]]
        + [m["job_skill"] for m in gap["missing_skills"]] + [n["job_skill"] for n in gap["nice_to_have"]]
        + [x["job_skill"] for x in gap.get("learn_on_job", [])])
    return {"job": {"id": job.id, "title": job.job_title},
            "student": {**build_showcase(student, db, for_employer=True, job_skills=job_skills), "programme_line": _programme(student, db),
                        "contact": {"email": student.email, "phone": student.phone, "city": student.city,
                                    "available_from": student.available_from} if contact else None},
            "fit": fit}


def sent_copy(student: User, job: Job, db: Session) -> dict:
    """21 Oct: what the employer is shown, as plain JSON, kept on the application when the student applies."""
    import json
    view = _profile_for(student, job, db, contact=False)
    return json.loads(json.dumps({"student": view["student"], "fit": view["fit"], "job_skills": _job_skill_key(job, db)},
                                 default=str))


def _job_skill_key(job: Job, db: Session) -> list:
    """The job's skills and their levels, to tell whether the employer edited them after someone applied."""
    return sorted([s.skill_name, s.level or ""] for s in db.query(JobSkill).filter(JobSkill.job_id == job.id))


def with_versions(a: Application, live: dict, want: str, job: Job | None = None, db: Session | None = None) -> dict:
    """21 Oct: the copy sent when applying (default) or the latest profile ("latest"), and whether her profile changed
    since. Contact details always come from the live view (they depend on the status, not on what was sent)."""
    if not a.sent_profile:
        return {**live, "versions": None}
    import json
    # the employer edited the job's skills after she applied: the match she was sent is for skills the job no longer
    # asks for, so the latest profile against the new skills is shown (the edit-job rule: the match follows the job)
    if job is not None and db is not None and a.sent_profile.get("job_skills") is not None \
            and a.sent_profile["job_skills"] != _job_skill_key(job, db):
        return {**live, "versions": {"sent_at": a.sent_at, "changed": True, "showing": "latest", "job_changed": True}}
    strip = lambda st: {k: v for k, v in st.items() if k not in ("contact", "own_contact", "visible_to_employers")}
    latest = json.loads(json.dumps(strip(live["student"]), default=str))
    changed = latest != strip(a.sent_profile["student"]) or json.loads(json.dumps(live["fit"], default=str)) != a.sent_profile["fit"]
    showing = "latest" if want == "latest" and changed else "sent"
    view = live if showing == "latest" else {**live, "student": {**a.sent_profile["student"],
                                                                 "contact": live["student"]["contact"]},
                                             "fit": a.sent_profile["fit"]}
    return {**view, "versions": {"sent_at": a.sent_at, "changed": changed, "showing": showing, "job_changed": False}}


@router.get("/applications/{app_id}")
def applicant_profile(app_id: int, view: str = "sent", employer: User = Depends(require_employer),
                      db: Session = Depends(get_db)):
    """One applicant for one of the employer's posts (applying shares the profile and email with this employer)."""
    a, job, student = _own_application(app_id, employer, db)
    from app.services.application_progress import record_view
    record_view(a, db)        # the student's "Viewed" step (12 Oct)
    # 12 Oct: the next application for this job still at Applied (oldest first), so the employer can go on without
    # going back to the list
    nxt = (db.query(Application, User).join(User, User.id == Application.student_id)
           .filter(Application.job_id == job.id, Application.status == "applied", Application.id != a.id)
           .order_by(Application.created_at).first())
    return {"application": {"id": a.id, "status": a.status, "applied_at": a.created_at},
            "next_to_review": {"id": nxt[0].id, "name": f"{nxt[1].first_name} {nxt[1].last_name}"} if nxt else None,
            **with_versions(a, _profile_for(student, job, db, contact=a.status in CONTACT_STATUSES), view, job, db)}


# ── Dashboard (12 Oct; her pick E after mock-ups A-E, references.md "Employer dashboard layout") ──────────────────
REVIEW_SHOWN = 20          # applications to review listed (newest first; the rest are in My jobs)
FIT_SHOWN = 10             # graduates who fit
from app.services.job_requirements import FIT_MIN  # noqa: E402  (half or more of the required skills; shared with the what-if)


def _visible_students(db: Session) -> list[User]:
    return (db.query(User).filter(User.role == UserRole.student, User.is_visible_to_employers.is_(True),
                                  User.is_active.is_(True)).all())


def _graduates_who_fit(open_jobs: list[Job], db: Session, limit: int | None = FIT_SHOWN) -> list[dict]:
    """Visible students who haven't applied, each with the open job they fit best, best match first."""
    applied = {(a.job_id, a.student_id) for a in db.query(Application).filter(
        Application.job_id.in_([j.id for j in open_jobs]))}
    invited = {(i.job_id, i.student_id): i for i in db.query(JobInvitation).filter(
        JobInvitation.job_id.in_([j.id for j in open_jobs]))}
    best = {}
    for student in _visible_students(db):
        for job in open_jobs:
            if (job.id, student.id) in applied:
                continue
            gap = _fit(student, job, db)
            if not gap:
                break                         # no profile skills: no job will fit
            have = len(gap["matched_skills"])
            total = have + len(gap["missing_skills"])
            ratio = have / total if total else 0
            # 24 Oct (her point: a job with 3-4 required skills gives many ties): the nice-to-have skills a graduate
            # also has break the tie. Who fits is unchanged (FIT_MIN, required skills only); only the order is.
            nice = sum(1 for n in gap.get("nice_to_have", []) if n.get("has"))
            if ratio >= FIT_MIN and (student.id not in best or (ratio, nice) > (best[student.id]["ratio"],
                                                                               best[student.id]["nice"])):
                best[student.id] = {"student_id": student.id, "name": f"{student.first_name} {student.last_name}",
                                    "programme": _programme(student, db), "job_id": job.id, "job_title": job.job_title,
                                    "have": have, "total": total, "ratio": ratio, "nice": nice,
                                    # 25 Oct (her pick: the graduates list has the applicants table's columns)
                                    "missing": [m["job_skill"] for m in gap["missing_skills"]],
                                    "nice_total": len(gap.get("nice_to_have", [])),
                                    # 25 Oct: Invited / Declined (+ reason) / No reply (app/services/invitations.py)
                                    "invite": invite_state(invited.get((job.id, student.id))),
                                    "invited_at": getattr(invited.get((job.id, student.id)), "created_at", None)}
    return sorted(best.values(), key=lambda g: (-g["ratio"], -g["nice"], -g["have"], g["name"]))[:limit]


@router.get("/dashboard")
def dashboard(employer: User = Depends(require_employer), db: Session = Depends(get_db)):
    jobs = db.query(Job).filter(Job.posted_by_user_id == employer.id).all()
    open_jobs = sorted([j for j in jobs if _status(j) == "open"], key=lambda j: j.listing_date, reverse=True)
    statuses = _statuses([j.id for j in jobs], db)
    new = (db.query(Application, User, Job).join(User, User.id == Application.student_id)
           .join(Job, Job.id == Application.job_id)
           .filter(Job.posted_by_user_id == employer.id, Application.status == "applied")
           .order_by(Application.created_at.desc()).all())
    to_review = [{**_applicant(a, u, j, db), "job_id": j.id, "job_title": j.job_title} for a, u, j in new[:REVIEW_SHOWN]]
    all_statuses = [st for sts in statuses.values() for st in sts]
    required = {}
    for s in db.query(JobSkill).filter(JobSkill.job_id.in_([j.id for j in open_jobs]), JobSkill.skill_type == "hard",
                                       JobSkill.level.in_(("required", "unspecified"))):
        required[s.job_id] = required.get(s.job_id, 0) + 1
    from app.services.transparency import employer_record
    return {
        "summary": {"jobs": len(jobs), "open_jobs": len(open_jobs), "applicants": len(all_statuses),
                    "new": sum(1 for st in all_statuses if st == "applied")},
        "to_review": to_review,
        # 20 Oct (her review, layout N2): the decision date, and what the dashboard's "What you can do now" needs
        # (a job with very few required skills; no qualification / languages set in Post a Job)
        "open_jobs": [{"id": j.id, "title": j.job_title, "posted_at": j.listing_date, "decide_by": j.decide_by,
                       "counts": {st: statuses.get(j.id, []).count(st) for st in STATUSES},
                       "required": required.get(j.id, 0),
                       "has_requirements": bool(j.min_qualification or j.languages)} for j in open_jobs],
        # what students see about this employer (improvement #1), shown on the employer's own dashboard
        "record": employer_record(employer.id, db),
        "graduates": _graduates_who_fit(open_jobs, db) if open_jobs else [],
        "activity": _activity(jobs, db),
        "attention": _attention(employer, open_jobs, db),
    }


QUIET_JOB_DAYS = 7     # an open job with no applicants after a week: suggest inviting graduates who fit


def _attention(employer: User, open_jobs: list[Job], db: Session) -> dict:
    """12 Oct: what else needs the employer, beyond new applications.
    - applicants waiting over NUDGE_DAYS (14) since anything happened: the same day the student is told to keep
      applying elsewhere (references.md "Application progress"), so the employer sees it at the same time;
    - open jobs a week old with no applicants, with how many visible graduates fit them;
    - how fast this employer usually views applications (what students are shown)."""
    from datetime import timedelta
    from app.services.application_progress import NUDGE_DAYS, employer_review_days, events_for, progress
    rows = (db.query(Application, User, Job).join(User, User.id == Application.student_id).join(Job, Job.id == Application.job_id)
            .filter(Job.posted_by_user_id == employer.id, Application.status.in_(("applied", "shortlisted"))).all())
    ev = events_for([a.id for a, _, _ in rows], db)
    waiting = []
    for a, u, j in rows:
        if j not in open_jobs:
            continue
        p = progress(a, ev[a.id], True)
        if p["quiet_days"] >= NUDGE_DAYS:
            waiting.append({"application_id": a.id, "name": f"{u.first_name} {u.last_name}", "job_title": j.job_title,
                            "days": p["quiet_days"]})
    now = datetime.now(timezone.utc)
    has_apps = {a.job_id for a in db.query(Application.job_id).filter(Application.job_id.in_([j.id for j in open_jobs]))}
    quiet = [{"job_id": j.id, "title": j.job_title, "fit": len(_graduates_who_fit([j], db, limit=None))}
             for j in open_jobs if j.id not in has_apps and j.listing_date
             and now - _aware(j.listing_date) >= timedelta(days=QUIET_JOB_DAYS)]
    # 14 Oct: open jobs whose decision date has passed with applicants still waiting (students now see "no decision")
    waiting_by_job = {}
    for a, _, j in rows:
        waiting_by_job[j.id] = waiting_by_job.get(j.id, 0) + 1
    overdue = [{"job_id": j.id, "title": j.job_title, "decide_by": j.decide_by, "waiting": waiting_by_job[j.id]}
               for j in open_jobs if past_date(j, now) and waiting_by_job.get(j.id)]
    return {"waiting_long": sorted(waiting, key=lambda w: -w["days"]), "quiet_jobs": quiet, "past_date": overdue,
            "review_days": employer_review_days(employer.id, db)}


ACTIVITY_DAYS, ACTIVITY_SHOWN = 14, 30


def _activity(jobs: list[Job], db: Session) -> list[dict]:
    """What happened on the employer's jobs in the last 14 days, newest first: posts, applications, the employer's
    own status changes and invitations. A record that each change landed and what the student now sees."""
    from datetime import timedelta
    since = datetime.now(timezone.utc) - timedelta(days=ACTIVITY_DAYS)
    by_id = {j.id: j for j in jobs}
    names = {}
    def name(uid):
        if uid not in names:
            u = db.get(User, uid)
            names[uid] = f"{u.first_name} {u.last_name}" if u else "A student"
        return names[uid]
    out = []
    for j in jobs:
        if j.listing_date and _aware(j.listing_date) >= since:
            out.append({"kind": "posted", "at": j.listing_date, "job": j.job_title, "job_id": j.id})
    apps = db.query(Application).filter(Application.job_id.in_(by_id)).all() if by_id else []
    for a in apps:
        if _aware(a.created_at) >= since:
            out.append({"kind": "applied", "at": a.created_at, "job": by_id[a.job_id].job_title, "job_id": a.job_id,
                        "student": name(a.student_id), "application_id": a.id})
    app_by_id = {a.id: a for a in apps}
    if app_by_id:
        for e in db.query(ApplicationEvent).filter(ApplicationEvent.application_id.in_(app_by_id),
                                                   ApplicationEvent.kind == "status", ApplicationEvent.created_at >= since):
            a = app_by_id[e.application_id]
            out.append({"kind": "status", "status": e.status, "at": e.created_at, "job": by_id[a.job_id].job_title,
                        "job_id": a.job_id, "student": name(a.student_id), "application_id": a.id})
    if by_id:
        for i in db.query(JobInvitation).filter(JobInvitation.job_id.in_(by_id), JobInvitation.created_at >= since):
            out.append({"kind": "invited", "at": i.created_at, "job": by_id[i.job_id].job_title, "job_id": i.job_id,
                        "student": name(i.student_id), "student_id": i.student_id})
        # 25 Oct (option D): a student's "No thanks", with the reason if given
        for i in db.query(JobInvitation).filter(JobInvitation.job_id.in_(by_id), JobInvitation.dismissed_at >= since):
            out.append({"kind": "declined", "at": i.dismissed_at, "job": by_id[i.job_id].job_title, "job_id": i.job_id,
                        "student": name(i.student_id), "student_id": i.student_id,
                        "reason": invite_state(i)["reason"]})
    return sorted(out, key=lambda x: _aware(x["at"]), reverse=True)[:ACTIVITY_SHOWN]


def _aware(t):
    return t.replace(tzinfo=timezone.utc) if t and t.tzinfo is None else t


@router.get("/counts")
def counts(employer: User = Depends(require_employer), db: Session = Depends(get_db)):
    """The sidebar badge: applications nobody has looked at yet ("applied")."""
    return {"new_applicants": db.query(Application).join(Job, Job.id == Application.job_id).filter(
        Job.posted_by_user_id == employer.id, Application.status == "applied").count()}


@router.get("/graduates/{student_id}")
def graduate_profile(student_id: int, job_id: int, employer: User = Depends(require_employer),
                     db: Session = Depends(get_db)):
    """A visible graduate's profile and match for one of the employer's open jobs (no email: they haven't applied)."""
    job = _own_job(job_id, employer, db)
    student = db.query(User).filter(User.id == student_id, User.role == UserRole.student,
                                    User.is_visible_to_employers.is_(True), User.is_active.is_(True)).first()
    if not student:
        raise HTTPException(status_code=404, detail="This graduate's profile isn't visible to employers.")
    inv = db.query(JobInvitation).filter(JobInvitation.job_id == job.id, JobInvitation.student_id == student.id).first()
    applied = db.query(Application).filter(Application.job_id == job.id, Application.student_id == student.id).first()
    return {"application": None, "invited_at": inv.created_at if inv else None, "invite": invite_state(inv),
            "applied_application_id": applied.id if applied else None,
            **_profile_for(student, job, db, contact=False)}


class InviteIn(BaseModel):
    job_id: int
    student_id: int


def _invite(job: Job, student_id: int, db: Session) -> JobInvitation:
    """One invitation (the rules below), not yet committed. Raises HTTPException with the reason it can't be sent."""
    student = db.query(User).filter(User.id == student_id, User.role == UserRole.student,
                                    User.is_visible_to_employers.is_(True), User.is_active.is_(True)).first()
    if not student:
        raise HTTPException(status_code=404, detail="This graduate's profile isn't visible to employers.")
    if db.query(Application).filter(Application.job_id == job.id, Application.student_id == student.id).first():
        raise HTTPException(status_code=409, detail="They already applied for this job.")
    if db.query(JobInvitation).filter(JobInvitation.job_id == job.id, JobInvitation.student_id == student.id).first():
        raise HTTPException(status_code=409, detail="You already invited them to apply for this job.")
    inv = JobInvitation(job_id=job.id, student_id=student.id)
    db.add(inv)
    return inv


@router.post("/invitations")
def invite(data: InviteIn, employer: User = Depends(require_employer), db: Session = Depends(get_db)):
    """Invite a visible graduate to apply for one of the employer's open jobs (12 Oct; in-app only, one per job per
    student). The student sees it at the top of My applications and decides; their email stays private.
    Once only per job: after "No thanks" (shown to the employer as "Declined", 25 Oct) or 14 days without an answer
    ("No reply"), the employer can't invite them again for that job; the student can still apply."""
    job = _own_job(data.job_id, employer, db)
    if _status(job) != "open":
        raise HTTPException(status_code=400, detail="This job is closed. Reopen it to invite graduates.")
    inv = _invite(job, data.student_id, db)
    try:
        db.commit()
    except IntegrityError:        # two clicks at once
        db.rollback()
        raise HTTPException(status_code=409, detail="You already invited them to apply for this job.")
    db.refresh(inv)
    return {"id": inv.id, "job_id": job.id, "student_id": inv.student_id, "invited_at": inv.created_at}


@router.get("/jobs/{job_id}/graduates")
def job_graduates(job_id: int, employer: User = Depends(require_employer), db: Session = Depends(get_db)):
    """25 Oct: visible graduates who fit THIS job and haven't applied, best first, with their invitation state, for
    "Invite selected" on View applicants (Indeed and Handshake tie invitations to a job; references.md)."""
    job = _own_job(job_id, employer, db)
    if _status(job) != "open":
        return []
    return _graduates_who_fit([job], db, limit=None)


class BulkInviteIn(BaseModel):
    job_id: int
    student_ids: list[int] = Field(min_length=1, max_length=50)


@router.post("/invitations/bulk")
def invite_selected(data: BulkInviteIn, employer: User = Depends(require_employer), db: Session = Depends(get_db)):
    """25 Oct: "Invite N selected" on a job's View applicants page. Only graduates the employer ticked (no "invite
    all": platforms allow bulk only for people picked by hand, references.md). Each gets the same single invitation
    as one sent alone; any that can't be sent (applied meanwhile, already invited, profile hidden) are listed."""
    job = _own_job(data.job_id, employer, db)
    if _status(job) != "open":
        raise HTTPException(status_code=400, detail="This job is closed. Reopen it to invite graduates.")
    invited, skipped = [], []
    for sid in dict.fromkeys(data.student_ids):           # each once, in the order ticked
        try:
            with db.begin_nested():                         # one failure doesn't undo the others
                _invite(job, sid, db)
            invited.append(sid)
        except HTTPException as e:
            skipped.append({"student_id": sid, "reason": e.detail})
        except IntegrityError:
            skipped.append({"student_id": sid, "reason": "You already invited them to apply for this job."})
    db.commit()
    return {"invited": invited, "skipped": skipped}
