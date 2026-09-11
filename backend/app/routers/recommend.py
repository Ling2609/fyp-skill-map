from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import SessionLocal, get_db
from app.models.module import Module, ModuleSkill
from app.models.job import Job, JobSkill
from app.nlp.embedder import Embedder
import numpy as np

router = APIRouter(prefix="/recommend", tags=["recommend"])

embedder = Embedder()

# Job embedding cache
_job_cache = {}
_cache_built = False


def build_job_cache():
    global _job_cache, _cache_built
    if _cache_built:
        return
    print("Building job embedding cache...")
    db = SessionLocal()
    try:
        jobs = db.query(Job).all()
        for job in jobs:
            job_skills = db.query(JobSkill).filter(JobSkill.job_id == job.id).all()
            if not job_skills:
                continue
            skill_text = " ".join([s.skill_name for s in job_skills])
            vec = embedder.embed(skill_text)
            _job_cache[job.id] = {
                "vec": vec,
                "job_id": job.job_id,
                "job_title": job.job_title,
                "company": job.company,
                "location": job.location,
                "subcategory": job.subcategory,
                "salary": job.salary,
                "skills": [s.skill_name for s in job_skills],
            }
        _cache_built = True
        print(f"Job cache built: {len(_job_cache)} jobs")
    finally:
        db.close()


class ModuleInput(BaseModel):
    module_code: str
    grade: float


class RecommendRequest(BaseModel):
    modules: list[ModuleInput]
    top_n: int = 10
    role_filter: str = ""  # optional job title keyword filter


def grade_weight(grade: float) -> float:
    if grade >= 4.0: return 1.0
    elif grade >= 3.7: return 0.9
    elif grade >= 3.3: return 0.8
    elif grade >= 3.0: return 0.7
    elif grade >= 2.7: return 0.6
    else: return 0.5


@router.post("/")
def recommend_jobs(payload: RecommendRequest, db: Session = Depends(get_db)):
    if not payload.modules:
        raise HTTPException(status_code=400, detail="No modules provided")

    # Build job cache if not done
    build_job_cache()

    # Collect weighted skills per module
    skill_weights = {}
    module_skill_map = {}  # category → skills for diverse display

    for mod_input in payload.modules:
        module = db.query(Module).filter(Module.code == mod_input.module_code).first()
        if not module:
            continue
        skills = db.query(ModuleSkill).filter(ModuleSkill.module_id == module.id).all()
        weight = grade_weight(mod_input.grade)
        for skill in skills:
            name = skill.skill_name.lower()
            skill_weights[name] = max(skill_weights.get(name, 0), weight)

    if not skill_weights:
        raise HTTPException(status_code=404, detail="No skills found for provided modules")

    # Build profile text with grade weighting
    profile_skills = []
    for skill, weight in sorted(skill_weights.items(), key=lambda x: -x[1]):
        repeats = 3 if weight >= 0.9 else 2 if weight >= 0.7 else 1
        profile_skills.extend([skill] * repeats)

    profile_text = " ".join(profile_skills)
    profile_vec = embedder.embed(profile_text)

    # If role filter provided, embed it and combine with profile
    if payload.role_filter.strip():
        role_vec = embedder.embed(payload.role_filter.strip())
        # Weighted combination: 60% profile, 40% role preference
        profile_vec = 0.6 * profile_vec + 0.4 * role_vec
        profile_vec = profile_vec / (np.linalg.norm(profile_vec) + 1e-8)

    # Score jobs from cache
    results = []
    for job_id, cached in _job_cache.items():
        job_vec = cached["vec"]
        score = float(np.dot(profile_vec, job_vec) / (
            np.linalg.norm(profile_vec) * np.linalg.norm(job_vec) + 1e-8
        ))

        # Optional: boost score if job title contains role filter keyword
        if payload.role_filter.strip():
            if payload.role_filter.lower() in cached["job_title"].lower():
                score = min(score * 1.2, 1.0)

        results.append({
            "job_id": cached["job_id"],
            "job_title": cached["job_title"],
            "company": cached["company"],
            "location": cached["location"],
            "subcategory": cached["subcategory"],
            "salary": cached["salary"],
            "match_score": round(score, 4),
            "match_percent": round(score * 100, 1),
            "top_job_skills": cached["skills"][:5],
        })

    results.sort(key=lambda x: -x["match_score"])
    top_results = results[:payload.top_n]

    # Diverse top skills — sample from different modules
    sorted_skills = sorted(skill_weights.items(), key=lambda x: -x[1])
    seen = set()
    diverse_skills = []
    for skill, _ in sorted_skills:
        words = skill.split()
        key = words[-1] if words else skill
        if key not in seen:
            seen.add(key)
            diverse_skills.append(skill)
        if len(diverse_skills) >= 10:
            break

    return {
        "graduate_profile": {
            "modules_count": len(payload.modules),
            "unique_skills": len(skill_weights),
            "top_skills": diverse_skills,
        },
        "role_filter": payload.role_filter,
        "recommendations": top_results,
        "total_jobs_compared": len(_job_cache),
    }


@router.get("/profile/{module_code}")
def get_module_skills(module_code: str, db: Session = Depends(get_db)):
    module = db.query(Module).filter(Module.code == module_code).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    skills = db.query(ModuleSkill).filter(ModuleSkill.module_id == module.id).all()
    return {
        "module_code": module_code,
        "module_name": module.name,
        "skills": [s.skill_name for s in skills]
    }