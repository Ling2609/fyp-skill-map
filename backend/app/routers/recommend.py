from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models.module import Module, ModuleSkill
from app.models.job import Job, JobSkill
from app.nlp.embedder import Embedder
import numpy as np

router = APIRouter(prefix="/recommend", tags=["recommend"])

# Load embedder once at startup
embedder = Embedder()


class ModuleInput(BaseModel):
    module_code: str
    grade: float  # e.g. 4.0, 3.7, 3.3 etc


class RecommendRequest(BaseModel):
    modules: list[ModuleInput]
    top_n: int = 10


def grade_weight(grade: float) -> float:
    """Convert grade to weight. Higher grade = more weight."""
    if grade >= 4.0:
        return 1.0
    elif grade >= 3.7:
        return 0.9
    elif grade >= 3.3:
        return 0.8
    elif grade >= 3.0:
        return 0.7
    elif grade >= 2.7:
        return 0.6
    else:
        return 0.5


@router.post("/")
def recommend_jobs(payload: RecommendRequest, db: Session = Depends(get_db)):
    """
    Given a list of modules with grades, recommend matching jobs.

    Steps:
    1. Fetch skills for each module from DB
    2. Weight skills by grade
    3. Build graduate skill profile text
    4. Embed profile using SBERT
    5. Embed job skill sets using SBERT
    6. Compute cosine similarity
    7. Return top N matches
    """
    if not payload.modules:
        raise HTTPException(status_code=400, detail="No modules provided")

    # Step 1 & 2: Collect weighted skills
    skill_weights = {}

    for mod_input in payload.modules:
        module = db.query(Module).filter(
            Module.code == mod_input.module_code
        ).first()

        if not module:
            continue

        skills = db.query(ModuleSkill).filter(
            ModuleSkill.module_id == module.id
        ).all()

        weight = grade_weight(mod_input.grade)

        for skill in skills:
            name = skill.skill_name.lower()
            if name in skill_weights:
                skill_weights[name] = max(skill_weights[name], weight)
            else:
                skill_weights[name] = weight

    if not skill_weights:
        raise HTTPException(
            status_code=404,
            detail="No skills found for provided modules"
        )

    # Step 3: Build graduate profile text (weighted repetition)
    profile_skills = []
    for skill, weight in sorted(skill_weights.items(), key=lambda x: -x[1]):
        # Repeat high-weight skills to emphasise them
        repeats = 3 if weight >= 0.9 else 2 if weight >= 0.7 else 1
        profile_skills.extend([skill] * repeats)

    profile_text = " ".join(profile_skills)

    # Step 4: Embed graduate profile
    profile_vec = embedder.embed(profile_text)

    # Step 5: Get all jobs with their skills from DB
    jobs = db.query(Job).all()

    if not jobs:
        raise HTTPException(
            status_code=404,
            detail="No jobs in database yet. Run extract_job_skills.py first."
        )

    # Step 6: Embed each job's skill set and compute similarity
    results = []
    for job in jobs:
        job_skills = db.query(JobSkill).filter(
            JobSkill.job_id == job.id
        ).all()

        if not job_skills:
            continue

        job_skill_text = " ".join([s.skill_name for s in job_skills])
        job_vec = embedder.embed(job_skill_text)

        score = float(np.dot(profile_vec, job_vec) / (
            np.linalg.norm(profile_vec) * np.linalg.norm(job_vec) + 1e-8
        ))

        results.append({
            "job_id": job.job_id,
            "job_title": job.job_title,
            "company": job.company,
            "location": job.location,
            "subcategory": job.subcategory,
            "salary": job.salary,
            "match_score": round(score, 4),
            "match_percent": round(score * 100, 1),
        })

    # Step 7: Sort and return top N
    results.sort(key=lambda x: -x["match_score"])
    top_results = results[:payload.top_n]

    return {
        "graduate_profile": {
            "modules_count": len(payload.modules),
            "unique_skills": len(skill_weights),
            "top_skills": list(skill_weights.keys())[:10],
        },
        "recommendations": top_results,
        "total_jobs_compared": len(results),
    }


@router.get("/profile/{module_code}")
def get_module_skills(module_code: str, db: Session = Depends(get_db)):
    """Preview skills for a single module."""
    module = db.query(Module).filter(Module.code == module_code).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")

    skills = db.query(ModuleSkill).filter(
        ModuleSkill.module_id == module.id
    ).all()

    return {
        "module_code": module_code,
        "module_name": module.name,
        "skills": [s.skill_name for s in skills]
    }