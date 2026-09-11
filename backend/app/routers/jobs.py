from fastapi import APIRouter, Depends
from sqlalchemy import distinct
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.job import Job, JobSkill

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/stats")
def get_job_stats(db: Session = Depends(get_db)):
    """Get statistics about stored jobs."""
    total_jobs = db.query(Job).count()
    total_skills = db.query(JobSkill).count()
    return {
        "total_jobs": total_jobs,
        "total_skills": total_skills,
        "avg_skills_per_job": round(total_skills / total_jobs, 1) if total_jobs > 0 else 0,
    }


@router.get("/subcategories")
def get_subcategories(db: Session = Depends(get_db)):
    """Get unique subcategories from stored jobs."""
    subcats = db.query(distinct(Job.subcategory)).filter(
        Job.subcategory != None
    ).all()
    return sorted([s[0] for s in subcats if s[0]])


@router.get("/")
def get_jobs(skip: int = 0, limit: int = 20, db: Session = Depends(get_db)):
    """Get paginated list of jobs with their extracted skills."""
    jobs = db.query(Job).offset(skip).limit(limit).all()
    result = []
    for job in jobs:
        skills = db.query(JobSkill).filter(
            JobSkill.job_id == job.id
        ).all()
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