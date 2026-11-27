import json
import re
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.job import Job, JobSkill
from app.models.user import User
from app.routers.auth import get_current_user
from app.services.description_check import ungrounded
from app.services.employer_availability import owner_available_clause, decision_open_clause

router = APIRouter(prefix="/jobs", tags=["jobs"])

SECTION_KEYWORDS = [
    'job responsibilities', 'responsibilities', 'job requirement',
    'requirements', 'qualifications', 'qualification', 'benefits',
    'overview', 'job overview', 'key responsibilities', 'duties',
    'about the role', 'what you will do', 'what we offer',
    'preferred qualifications', 'minimum qualifications',
    'tasks', 'job description', 'job summary', 'working conditions',
    'work conditions', 'remuneration', 'perks', 'incentives',
    'tasks & responsibilities', 'qualifications & experience',
    'qualifications and experience', 'tasks and responsibilities',
]

_extractor = None

def check_jobs_schema():
    """Start-up check: jobs.gone_at (6 Oct) and jobs.closed_at (11 Oct) must exist."""
    from sqlalchemy import inspect
    from app.database import engine
    columns = {c["name"] for c in inspect(engine).get_columns("jobs")}
    for column, script in (("gone_at", "migrate_add_job_gone_at.py"), ("closed_at", "migrate_employer_jobs.py"),
                           ("decide_by", "migrate_transparency.py"),
                           ("decide_by_original", "migrate_record_keeping.py"),
                           ("min_qualification", "migrate_job_requirements.py")):
        if column not in columns:
            raise RuntimeError(f"Database not updated: run  python migrations/{script}  "
                               "from the backend folder, then start the backend again.")


# Jobs a student can apply to now (11 Oct): live JSearch jobs and SkillMap employers' posts, not gone, not closed by
# their employer, not hidden by Admin. The 2024 dataset is market data only ("include past" on Job Matches).
CURRENT_SOURCES = ("live", "employer")


def current_jobs_filter(q):
    return q.filter(Job.source.in_(CURRENT_SOURCES), Job.gone_at.is_(None), Job.closed_at.is_(None),
                    Job.hidden_by_admin_at.is_(None), Job.applications_stopped_at.is_(None),
                    owner_available_clause(), decision_open_clause())


def get_extractor():
    global _extractor
    if _extractor is None:
        from app.nlp.skill_extractor import SkillExtractor
        _extractor = SkillExtractor()
    return _extractor


def is_section_header(text: str) -> bool:
    """Only returns True if the ENTIRE text matches a known section keyword exactly."""
    t = text.strip().lower().rstrip(':').rstrip('&').strip()
    if len(t) > 50:
        return False
    for kw in SECTION_KEYWORDS:
        if t == kw or t == kw + 's' or t == kw + ':':
            return True
    return False


def format_description_rules(text: str) -> list[str]:
    """Format using deterministic rules — fast fallback. Splits on line breaks (an employer's own post, 18 Oct) and on
    the double spaces scraped ads use between parts; never changes a word."""
    if not text:
        return []
    raw_parts = [p.strip().lstrip("•-*·").strip() for p in re.split(r"\n|  ", text)]
    raw_parts = [p for p in raw_parts if len(p) > 3]
    if len(raw_parts) <= 1:
        return [text.strip()]
    result = []
    for part in raw_parts:
        if is_section_header(part):
            header = part.strip().rstrip(':').rstrip('&').strip()
            result.append(f'## {header.title()}')
        else:
            result.append(part)
    return result


@router.get("/stats")
def get_job_stats(db: Session = Depends(get_db)):
    total_jobs = db.query(Job).count()
    total_skills = db.query(JobSkill).count()
    return {
        "total_jobs": total_jobs,
        "total_skills": total_skills,
        "avg_skills_per_job": round(total_skills / total_jobs, 1) if total_jobs > 0 else 0,
    }


@router.get("/subcategories")
def get_subcategories(include_past: bool = False, db: Session = Depends(get_db)):
    """Category chips for Job Matches. By default only categories that have current openings,
    so no chip leads to an empty list."""
    q = db.query(Job.subcategory).filter(Job.subcategory.is_not(None)).distinct()   # SQLAlchemy 2.1: distinct() on the query; is_not(None) = SQL "IS NOT NULL"
    if not include_past:
        q = current_jobs_filter(q)
    subcats = q.all()
    return sorted([s[0] for s in subcats if s[0]])


@router.get("/locations")
def get_locations(db: Session = Depends(get_db)):
    """Location filter on Job Matches: every (country, location) of current openings. The page builds the
    country -> state list from these once, so the options stay the same whatever the search; options with no
    jobs are greyed out, not removed (NN/g dropdown guidelines, references.md "Location filter layout")."""
    rows = current_jobs_filter(db.query(Job.country, Job.location)).distinct().all()
    return [{"country": country, "location": location} for country, location in rows]


def cached_bullets(job: Job) -> list[str] | None:
    """The stored tidy version, if it is a good one (has headings, isn't one wall of text); None means redo it."""
    if not job.formatted_description:
        return None
    try:
        bullets = json.loads(job.formatted_description)
    except json.JSONDecodeError:
        return None
    # 25 Nov: the ad's own text laid out by rules (saved when Gemini's version isn't safe) is final too; before, it
    # had no headings, so every visit asked Gemini again (5-21 s each, counted in the student's AI allowance)
    if bullets and bullets == format_description_rules(job.description or ""):
        return bullets
    has_headers = any(b.startswith('## ') for b in bullets)
    is_wall = len(bullets) <= 1 and any(len(b) > 300 for b in bullets)
    return bullets if bullets and has_headers and not is_wall else None


def description_of(job: Job, db: Session) -> dict:
    """The job ad as Job Detail shows it. 25 Nov: one function for the page and for
    scripts/tools/format_all_descriptions.py (tidies every live ad before testers come), so the two can't drift."""
    # 18 Oct: an employer's own post is shown as the employer wrote it (line breaks and headings only), never
    # rewritten by an AI: Gemini turned a post that said only "test ttttt..." into a full invented advert
    if job.source == "employer":
        return {"bullets": format_description_rules(job.description or ""), "cached": True}

    bullets = cached_bullets(job)          # a bad stored version falls through and is made again
    if bullets:
        return {"bullets": bullets, "cached": True}

    if not job.description:
        return {"bullets": [], "cached": False}

    bullets = []
    answered = False          # did Gemini give an answer at all? (an outage, a 503 or no key gives nothing)
    try:
        extractor = get_extractor()
        llm_bullets = extractor.format_job_description(job.job_title, job.description)   # Gemini
        answered = bool(llm_bullets)
        # 18 Oct: every bullet must be found in the advert (app/services/description_check.py); one invented
        # line and the whole answer is dropped for the advert's own text
        bad = ungrounded(llm_bullets or [], job.description)
        if bad:
            print(f"Description for {job.job_id}: Gemini added text not in the ad ({len(bad)} bullets), using the ad's own text")
        elif llm_bullets and len(llm_bullets) >= 3:
            bullets = llm_bullets
    except Exception as e:
        print(f"Description formatting failed: {e}")

    if len(bullets) < 3:
        bullets = format_description_rules(job.description)

    # 26 Nov (her server run: Gemini "503 high demand"): the ad's own layout is saved as final only when Gemini
    # answered and its version was refused. When Gemini gave nothing (busy, down, no key) it is shown but not saved,
    # so the next visit or the next run of format_all_descriptions.py asks Gemini again
    if bullets and answered:
        job.formatted_description = json.dumps(bullets)
        db.commit()

    return {"bullets": bullets, "cached": False}


@router.get("/{job_id}/description")
def get_job_description(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),  # logged-in only: this can call Groq
):
    decoded_id = job_id.replace("%2E", ".").replace("%20", " ")
    job = db.query(Job).filter(Job.job_id == decoded_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return description_of(job, db)

@router.get("/")
def get_jobs(skip: int = 0, limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    # 27 Nov (deployment audit): this route is public and reads a job's skills row by row, so `limit` was capped
    # (a request for 100,000 jobs made the server run thousands of queries).
    jobs = db.query(Job).offset(skip).limit(limit).all()
    result = []
    for job in jobs:
        skills = db.query(JobSkill).filter(JobSkill.job_id == job.id).all()
        result.append({
            "id": job.id,
            "job_id": job.job_id,
            "job_title": job.job_title,
            "company": job.company,
            "location": job.location,
            "subcategory": job.subcategory,
            "salary": job.salary,
            "skills": [s.skill_name for s in skills],
            "skill_count": len(skills),
        })
    return result