from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models.module import Module, ModuleSkill
from app.models.job import Job, JobSkill
from app.models.user_module import UserModule
from app.routers.auth import get_current_user
from app.models.user import User
from app.nlp.embedder import Embedder
import numpy as np

router = APIRouter(prefix="/skillgap", tags=["skill-gap"])

embedder = Embedder()

SIMILARITY_THRESHOLD = 0.6


class ModuleInput(BaseModel):
    module_code: str
    grade: float


class SkillGapRequest(BaseModel):
    modules: list[ModuleInput] = []   # optional — if empty, read from DB
    job_id: str


def grade_weight(grade: float) -> float:
    if grade >= 4.0: return 1.0
    elif grade >= 3.7: return 0.9
    elif grade >= 3.3: return 0.8
    elif grade >= 3.0: return 0.7
    elif grade >= 2.7: return 0.6
    else: return 0.5


@router.post("/")
def analyse_skill_gap(
    payload: SkillGapRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # If no modules sent, load from DB
    if not payload.modules:
        saved = db.query(UserModule).filter(
            UserModule.user_id == current_user.id
        ).all()
        if not saved:
            raise HTTPException(
                status_code=400,
                detail="No module grades saved. Please save your grades on the Profile page first."
            )
        payload.modules = [
            ModuleInput(module_code=m.module_code, grade=m.grade)
            for m in saved
        ]

    # Collect graduate skills + which module each came from
    graduate_skills = {}    # skill_name -> weight
    skill_module_map = {}   # skill_name -> module name
    for mod_input in payload.modules:
        module = db.query(Module).filter(Module.code == mod_input.module_code).first()
        if not module:
            continue
        skills = db.query(ModuleSkill).filter(ModuleSkill.module_id == module.id).all()
        weight = grade_weight(mod_input.grade)
        for skill in skills:
            name = skill.skill_name
            if name not in graduate_skills or weight > graduate_skills[name]:
                graduate_skills[name] = weight
                skill_module_map[name] = module.name

    if not graduate_skills:
        raise HTTPException(status_code=404, detail="No skills found for modules")

    # Get job
    job = db.query(Job).filter(Job.job_id == payload.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job_skills_db = db.query(JobSkill).filter(JobSkill.job_id == job.id).all()
    if not job_skills_db:
        raise HTTPException(status_code=404, detail="No skills found for this job")

    job_skills = [s.skill_name for s in job_skills_db]

    # Embed all skills in one batch call, then split
    grad_skill_names = list(graduate_skills.keys())
    all_skills = grad_skill_names + job_skills
    embeddings = embedder.embed_batch(all_skills)

    grad_embeddings = embeddings[:len(grad_skill_names)]
    job_embeddings  = embeddings[len(grad_skill_names):]

    # Normalise both matrices once — then similarity = matmul (no per-pair norm)
    grad_embeddings = grad_embeddings / (np.linalg.norm(grad_embeddings, axis=1, keepdims=True) + 1e-8)
    job_embeddings  = job_embeddings  / (np.linalg.norm(job_embeddings,  axis=1, keepdims=True) + 1e-8)

    # One matmul: sim_matrix[j, g] = cosine similarity between job skill j and grad skill g
    sim_matrix = job_embeddings @ grad_embeddings.T  # (J, G)

    best_scores  = sim_matrix.max(axis=1)            # best grad match score per job skill
    best_indices = sim_matrix.argmax(axis=1)         # which grad skill matched best

    matched = []
    missing = []

    for j_idx, job_skill in enumerate(job_skills):
        best_score = float(best_scores[j_idx])
        best_match = grad_skill_names[int(best_indices[j_idx])]

        if best_score >= SIMILARITY_THRESHOLD:
            matched.append({
                "job_skill": job_skill,
                "matched_graduate_skill": best_match,
                "matched_via_module": skill_module_map.get(best_match, ""),
                "similarity": round(best_score, 3),
                "grade_weight": graduate_skills.get(best_match, 0),
            })
        else:
            missing.append({
                "job_skill": job_skill,
                "closest_graduate_skill": best_match,
                "similarity": round(best_score, 3),
            })

    # Grad skills not required by this job
    matched_grad_skills = {m["matched_graduate_skill"] for m in matched}
    graduate_only = [
        {"skill": s, "grade_weight": graduate_skills[s]}
        for s in grad_skill_names
        if s not in matched_grad_skills
    ]

    gap_score = len(matched) / len(job_skills) * 100 if job_skills else 0

    return {
        "job": {
            "job_id": job.job_id,
            "job_title": job.job_title,
            "company": job.company,
            "location": job.location,
            "salary": job.salary,
            "description": job.description,
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