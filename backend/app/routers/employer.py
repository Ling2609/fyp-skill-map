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
the employer closes it; it never expires by age.

Batch 2 (11 Oct; mock-ups boards 3A and 4): the applicants of each post as a list, best match first, with a status
per applicant (Applied / Shortlisted / Accepted / Rejected), and one applicant's profile for this job: their match
with the evidence for each required skill, projects, strongest modules (grades only if the student allows it),
certificates and awards. An employer sees only students who applied to one of their own posts.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.application import Application
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


def _row(job: Job, skills: list[JobSkill], statuses: list[str] = ()) -> dict:
    hard = [s for s in skills if s.skill_type == "hard"]
    return {"id": job.id, "job_ref": job.job_id, "title": job.job_title, "location": job.location,
            "salary": job.salary, "category": job.subcategory, "status": _status(job),
            "posted_at": job.listing_date, "closed_at": job.closed_at,
            "required": sum(1 for s in hard if s.level in ("required", "unspecified")),
            "preferred": sum(1 for s in hard if s.level == "preferred"),
            "applicants": len(statuses), "new_applicants": sum(1 for st in statuses if st == "applied")}


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
    closed: bool


@router.patch("/jobs/{job_id}")
def close_or_reopen(job_id: int, data: CloseIn, employer: User = Depends(require_employer),
                    db: Session = Depends(get_db)):
    job = _own_job(job_id, employer, db)
    job.closed_at = datetime.now(timezone.utc) if data.closed else None
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
    return {"id": a.id, "name": f"{student.first_name} {student.last_name}", "programme": _programme(student, db),
            "status": a.status, "applied_at": a.created_at, "status_changed_at": a.status_changed_at,
            "have": have, "total": total, "missing": [m["job_skill"] for m in gap["missing_skills"]] if gap else []}


@router.get("/jobs/{job_id}/applicants")
def applicants(job_id: int, employer: User = Depends(require_employer), db: Session = Depends(get_db)):
    """One post with its applicants, best match first (most required skills they have, then earliest)."""
    job = _own_job(job_id, employer, db)
    skills = db.query(JobSkill).filter(JobSkill.job_id == job.id).order_by(JobSkill.id).all()
    rows = (db.query(Application, User).join(User, User.id == Application.student_id)
            .filter(Application.job_id == job.id).all())
    people = [_applicant(a, u, job, db) for a, u in rows]
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


@router.patch("/applications/{app_id}")
def set_status(app_id: int, data: StatusIn, employer: User = Depends(require_employer), db: Session = Depends(get_db)):
    """The employer moves an application on; the student sees it on My applications ("rejected" as "Not selected")."""
    if data.status not in STATUSES:
        raise HTTPException(status_code=400, detail="Unknown status.")
    a, job, student = _own_application(app_id, employer, db)
    if a.status != data.status:
        a.status = data.status
        a.status_changed_at = datetime.now(timezone.utc)
        db.commit()
    return {"id": a.id, "status": a.status, "status_changed_at": a.status_changed_at}


def _profile_for(student: User, job: Job, db: Session, contact: bool) -> dict:
    """A student's match for one of the employer's jobs (each required skill with where it comes from) and their
    showcase profile. Grades only if the student allows employers to see them; the email only for applicants."""
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
               "nice_missing": [n["job_skill"] for n in gap["nice_to_have"] if not n["has"]]}
    return {"job": {"id": job.id, "title": job.job_title},
            "student": {**build_showcase(student, db, for_employer=True), "email": student.email if contact else None,
                        "programme_line": _programme(student, db)},
            "fit": fit}


@router.get("/applications/{app_id}")
def applicant_profile(app_id: int, employer: User = Depends(require_employer), db: Session = Depends(get_db)):
    """One applicant for one of the employer's posts (applying shares the profile and email with this employer)."""
    a, job, student = _own_application(app_id, employer, db)
    return {"application": {"id": a.id, "status": a.status, "applied_at": a.created_at},
            **_profile_for(student, job, db, contact=True)}


# ── Dashboard (12 Oct; her pick E after mock-ups A-E, references.md "Employer dashboard layout") ──────────────────
REVIEW_SHOWN = 20          # applications to review listed (newest first; the rest are in My jobs)
FIT_SHOWN = 10             # graduates who fit
FIT_MIN = 0.5              # a graduate "fits" a job when they have at least half of its required skills


def _visible_students(db: Session) -> list[User]:
    return (db.query(User).filter(User.role == UserRole.student, User.is_visible_to_employers.is_(True),
                                  User.is_active.is_(True)).all())


def _graduates_who_fit(open_jobs: list[Job], db: Session) -> list[dict]:
    """Visible students who haven't applied, each with the open job they fit best, best match first."""
    applied = {(a.job_id, a.student_id) for a in db.query(Application).filter(
        Application.job_id.in_([j.id for j in open_jobs]))}
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
            if ratio >= FIT_MIN and (student.id not in best or ratio > best[student.id]["ratio"]):
                best[student.id] = {"student_id": student.id, "name": f"{student.first_name} {student.last_name}",
                                    "programme": _programme(student, db), "job_id": job.id, "job_title": job.job_title,
                                    "have": have, "total": total, "ratio": ratio}
    return sorted(best.values(), key=lambda g: (-g["ratio"], -g["have"], g["name"]))[:FIT_SHOWN]


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
    return {
        "summary": {"jobs": len(jobs), "open_jobs": len(open_jobs), "applicants": len(all_statuses),
                    "new": sum(1 for st in all_statuses if st == "applied")},
        "to_review": to_review,
        "open_jobs": [{"id": j.id, "title": j.job_title, "posted_at": j.listing_date,
                       "counts": {st: statuses.get(j.id, []).count(st) for st in STATUSES}} for j in open_jobs],
        "graduates": _graduates_who_fit(open_jobs, db) if open_jobs else [],
    }


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
    return {"application": None, **_profile_for(student, job, db, contact=False)}
