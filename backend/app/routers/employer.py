"""
Employer flow, batch 1 (11 Oct; mock-ups 9 Oct "SkillMap Employer Flow Mock-ups", boards 1 and 2).

An employer is one of the university's industry partners. They register with a company name, Admin approves them
(admin.py), and only then can they use these endpoints:
  - My jobs: their own posts, open or closed, with close / reopen
  - Post a job in two steps: SkillMap reads the skills in the ad (the same extractor and quote check as live jobs,
    so a posted job is matched exactly like any other), the employer checks them (Required / Nice to have / Taught on
    the job; remove, add), then publishes. The employer's check is the human review of the extraction (Amershi et
    al. 2019, references.md "Reviewing AI-suggested skills"), as Admin does for module skills.

A published post is source "employer": Job Matches shows it like a live job (marked "Posted on SkillMap") until
the employer closes it; it never expires by age. Applications and applicants come in batch 2.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.job import Job, JobSkill
from app.models.user import User, UserRole
from app.routers.auth import get_current_user
from app.services.job_skill_store import check_job_skills, skill_key

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


def _row(job: Job, skills: list[JobSkill]) -> dict:
    hard = [s for s in skills if s.skill_type == "hard"]
    return {"id": job.id, "job_ref": job.job_id, "title": job.job_title, "location": job.location,
            "salary": job.salary, "category": job.subcategory, "status": _status(job),
            "posted_at": job.listing_date, "closed_at": job.closed_at,
            "required": sum(1 for s in hard if s.level in ("required", "unspecified")),
            "preferred": sum(1 for s in hard if s.level == "preferred")}


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
    return [_row(j, skills.get(j.id, [])) for j in jobs]


class CloseIn(BaseModel):
    closed: bool


@router.patch("/jobs/{job_id}")
def close_or_reopen(job_id: int, data: CloseIn, employer: User = Depends(require_employer),
                    db: Session = Depends(get_db)):
    job = _own_job(job_id, employer, db)
    job.closed_at = datetime.now(timezone.utc) if data.closed else None
    db.commit()
    return _row(job, db.query(JobSkill).filter(JobSkill.job_id == job.id).all())


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
        mentions = get_extractor().extract_job_skills_with_evidence(data.title.strip(), data.description)
    except Exception as e:      # Groq down or its daily limit: the employer can type the skills themselves
        print(f"[employer] skill reading failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=503, detail="SkillMap couldn't read the skills just now. Try again in a "
                                                    "few minutes, or add the skills yourself.")
    checked = check_job_skills(mentions, data.description)
    hard = [{"name": k["skill"].strip(), "level": _level(k.get("level")), "quote": k.get("evidence_quote") or "",
             "group": k.get("alternative_group") or ""} for k in checked.kept if k.get("type") == "hard"]
    soft = [{"name": k["skill"].strip(), "level": k.get("level") or "unspecified",
             "quote": k.get("evidence_quote") or ""} for k in checked.kept if k.get("type") == "soft"]
    return {"skills": hard, "soft": soft}


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


class JobIn(AdIn):
    location: str = Field(max_length=120)
    salary: str = Field(default="", max_length=60)
    category: str = Field(max_length=80)
    skills: list[SkillIn]
    soft: list[SoftIn] = []


@router.post("/jobs")
def publish(data: JobIn, employer: User = Depends(require_employer), db: Session = Depends(get_db)):
    _check_ad(data.title, data.description)
    if len(data.location.strip()) < 2:
        raise HTTPException(status_code=400, detail="Add where the job is based.")
    if not data.category.strip():
        raise HTTPException(status_code=400, detail="Pick a job category.")
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

    from app.nlp.skill_extractor import JOB_EVIDENCE_VERSION
    from app.services.evidence import check_quote
    now = datetime.now(timezone.utc)
    job = Job(job_id=f"skillmap-{uuid.uuid4().hex[:12]}", job_title=data.title.strip(), company=employer.company_name,
              location=data.location.strip(), category="Information & Communication Technology",
              subcategory=data.category.strip(), salary=data.salary.strip() or None, description=data.description,
              source="employer", listing_date=now, country="MY", posted_by_user_id=employer.id)
    db.add(job)
    db.flush()
    rows = []
    for name, s in skills:
        # A quote is kept only if it is really in the ad that is being published (the ad may have been edited)
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
    db.add_all(rows)
    db.commit()
    return _row(job, rows)
