from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models.module import Module, ModuleSkill
from app.models.job import Job, JobSkill
from app.nlp.embedder import Embedder
import numpy as np

router = APIRouter(prefix="/skillgap", tags=["skill-gap"])

embedder = Embedder()

SIMILARITY_THRESHOLD = 0.6  # skills are "matched" if cosine similarity > 0.6


class ModuleInput(BaseModel):
    module_code: str
    grade: float


class SkillGapRequest(BaseModel):
    modules: list[ModuleInput]
    job_id: str  # job_id from the jobs table


def grade_weight(grade: float) -> float:
    if grade >= 4.0: return 1.0
    elif grade >= 3.7: return 0.9
    elif grade >= 3.3: return 0.8
    elif grade >= 3.0: return 0.7
    elif grade >= 2.7: return 0.6
    else: return 0.5


@router.post("/")
def analyse_skill_gap(payload: SkillGapRequest, db: Session = Depends(get_db)):
    """
    Analyse skill gap between a graduate profile and a specific job.

    Returns:
    - matched_skills: skills the graduate has that match job requirements
    - missing_skills: job skills the graduate lacks
    - graduate_only_skills: skills the graduate has not required by this job
    - gap_score: % of job skills covered by graduate
    """

    # Get graduate skills
    graduate_skills = {}
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
            name = skill.skill_name
            if name not in graduate_skills:
                graduate_skills[name] = weight
            else:
                graduate_skills[name] = max(graduate_skills[name], weight)

    if not graduate_skills:
        raise HTTPException(status_code=404, detail="No skills found for modules")

    # Get job skills
    job = db.query(Job).filter(Job.job_id == payload.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job_skills_db = db.query(JobSkill).filter(
        JobSkill.job_id == job.id
    ).all()

    if not job_skills_db:
        raise HTTPException(status_code=404, detail="No skills found for this job")

    job_skills = [s.skill_name for s in job_skills_db]

    # Embed all skills
    grad_skill_names = list(graduate_skills.keys())
    all_skills = grad_skill_names + job_skills

    embeddings = embedder.embed_batch(all_skills)
    grad_embeddings = embeddings[:len(grad_skill_names)]
    job_embeddings = embeddings[len(grad_skill_names):]

    # Match job skills to graduate skills using SBERT similarity
    matched = []
    missing = []

    for j_idx, job_skill in enumerate(job_skills):
        job_vec = job_embeddings[j_idx]
        best_score = 0
        best_match = None

        for g_idx, grad_skill in enumerate(grad_skill_names):
            grad_vec = grad_embeddings[g_idx]
            score = float(np.dot(job_vec, grad_vec) / (
                np.linalg.norm(job_vec) * np.linalg.norm(grad_vec) + 1e-8
            ))
            if score > best_score:
                best_score = score
                best_match = grad_skill

        if best_score >= SIMILARITY_THRESHOLD:
            matched.append({
                "job_skill": job_skill,
                "matched_graduate_skill": best_match,
                "similarity": round(best_score, 3),
                "grade_weight": graduate_skills.get(best_match, 0),
            })
        else:
            missing.append({
                "job_skill": job_skill,
                "closest_graduate_skill": best_match,
                "similarity": round(best_score, 3),
            })

    # Graduate skills not matched to any job skill
    matched_grad_skills = {m["matched_graduate_skill"] for m in matched}
    graduate_only = [
        {"skill": s, "grade_weight": graduate_skills[s]}
        for s in grad_skill_names
        if s not in matched_grad_skills
    ]

    # Gap score
    gap_score = len(matched) / len(job_skills) * 100 if job_skills else 0

    return {
        "job": {
            "job_id": job.job_id,
            "job_title": job.job_title,
            "company": job.company,
            "location": job.location,
            "salary": job.salary,
            "description": job.description,  # add this
        },
        "summary": {
            "job_skills_total": len(job_skills),
            "matched_skills": len(matched),
            "missing_skills": len(missing),
            "gap_score": round(gap_score, 1),
            "coverage_percent": round(gap_score, 1),
        },
        "matched_skills": matched,
        "missing_skills": missing,
        "graduate_only_skills": graduate_only[:10],
    }