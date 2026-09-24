import json
import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import distinct
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.job import Job, JobSkill

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
    """Format using deterministic rules — fast fallback."""
    if not text:
        return []
    raw_parts = [p.strip() for p in text.split('  ') if p.strip() and len(p.strip()) > 3]
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
def get_subcategories(db: Session = Depends(get_db)):
    subcats = db.query(distinct(Job.subcategory)).filter(
        Job.subcategory != None
    ).all()
    return sorted([s[0] for s in subcats if s[0]])


@router.get("/{job_id}/description")
def get_job_description(job_id: str, db: Session = Depends(get_db)):
    decoded_id = job_id.replace("%2E", ".").replace("%20", " ")
    job = db.query(Job).filter(Job.job_id == decoded_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Return cached version only if it looks well-formatted
    if job.formatted_description:
        try:
            bullets = json.loads(job.formatted_description)
            has_headers = any(b.startswith('## ') for b in bullets)
            is_wall = len(bullets) <= 1 and any(len(b) > 300 for b in bullets)
            if bullets and has_headers and not is_wall:
                return {"bullets": bullets, "cached": True}
            # Bad cache — fall through to regenerate
        except json.JSONDecodeError:
            pass

    if not job.description:
        return {"bullets": [], "cached": False}

    bullets = []

    try:
        extractor = get_extractor()
        groq_bullets = extractor.format_job_description(job.job_title, job.description)
        if groq_bullets and len(groq_bullets) >= 3:
            bullets = groq_bullets
    except Exception as e:
        print(f"Groq failed: {e}")

    if len(bullets) < 3:
        bullets = format_description_rules(job.description)

    if bullets:
        job.formatted_description = json.dumps(bullets)
        db.commit()

    return {"bullets": bullets, "cached": False}

@router.get("/")
def get_jobs(skip: int = 0, limit: int = 20, db: Session = Depends(get_db)):
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