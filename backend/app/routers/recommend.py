from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import SessionLocal, get_db
from app.models.module import Module, ModuleSkill
from app.models.job import Job, JobSkill
from app.models.profile import UserProject, UserCertification
from app.nlp.embedder import Embedder
from app.routers.auth import get_current_user
from app.models.user import User
from app.models.user_module import UserModule
import numpy as np
import re

SENIORITY_PATTERNS = {
    "junior":  r"\b(junior|jr\.?|entry.?level|graduate|intern|trainee|associate)\b",
    "senior":  r"\b(senior|sr\.?|specialist)\b",
    "lead":    r"\b(lead|principal|staff|architect)\b",
    "manager": r"\b(manager|director|head\s+of|vp|chief)\b",
}

SENIORITY_RANK = {"junior": 0, "unspecified": 1, "mid": 1, "senior": 2, "lead": 3, "manager": 4}
PENALTY_PER_STEP = 0.12

def classify_seniority(title: str) -> str:
    t = title.lower()
    for level, pattern in SENIORITY_PATTERNS.items():
        if re.search(pattern, t):
            return level
    return "unspecified"

router = APIRouter(prefix="/recommend", tags=["recommend"])

embedder = Embedder()

_job_cache = {}
_cache_built = False

SIMILARITY_THRESHOLD = 0.6


def build_job_cache():
    global _job_cache, _cache_built
    if _cache_built:
        return
    print("Building job embedding cache (this runs once at startup)...")
    db = SessionLocal()
    try:
        jobs = db.query(Job).all()
        for job in jobs:
            job_skills = db.query(JobSkill).filter(JobSkill.job_id == job.id).all()
            if not job_skills:
                continue
            skill_names = [s.skill_name for s in job_skills]
            skill_text = " ".join(skill_names)
            vec = embedder.embed(skill_text)
            # Pre-embed and pre-normalise job skill vectors at startup
            skill_vecs = embedder.embed_batch(skill_names)
            skill_vecs = skill_vecs / (np.linalg.norm(skill_vecs, axis=1, keepdims=True) + 1e-8)
            _job_cache[job.id] = {
                "vec": vec,
                "job_id": job.job_id,
                "job_title": job.job_title,
                "company": job.company,
                "location": job.location,
                "subcategory": job.subcategory,
                "salary": job.salary,
                "skills": skill_names,
                "skill_vecs": skill_vecs,
            }
        _cache_built = True
        print(f"Job cache built: {len(_job_cache)} jobs with pre-computed skill vectors")
    finally:
        db.close()


def compute_skill_coverage(grad_embeddings_normed, job_skills, job_skill_vecs):
    """Compute what % of job skills are covered by the graduate's skills.
    grad_embeddings_normed and job_skill_vecs must already be L2-normalised.
    """
    if not job_skills or not len(grad_embeddings_normed):
        return 0.0
    sim_matrix = job_skill_vecs @ grad_embeddings_normed.T  # (J, G) — one matmul
    best_scores = sim_matrix.max(axis=1)
    matched = (best_scores >= SIMILARITY_THRESHOLD).sum()
    return round(float(matched / len(job_skills)) * 100, 1)


class ModuleInput(BaseModel):
    module_code: str
    grade: float


class RecommendRequest(BaseModel):
    modules: list[ModuleInput] = []
    extra_skills: list[str] = []
    top_n: int = 10
    role_filter: str = ""


def grade_weight(grade: float) -> float:
    if grade >= 4.0: return 1.0
    elif grade >= 3.7: return 0.9
    elif grade >= 3.3: return 0.8
    elif grade >= 3.0: return 0.7
    elif grade >= 2.7: return 0.6
    else: return 0.5


def get_profile_skills_for_user(user_id: int, db: Session) -> list[str]:
    skills = []
    projects = db.query(UserProject).filter(UserProject.user_id == user_id).all()
    for p in projects:
        if p.extracted_skills:
            skills.extend(p.extracted_skills)
    certs = db.query(UserCertification).filter(UserCertification.user_id == user_id).all()
    for c in certs:
        if c.mapped_skills:
            skills.extend(c.mapped_skills)
    return list({s.lower() for s in skills if s})


@router.post("/")
def recommend_jobs(
    payload: RecommendRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Load modules from DB if not passed in request
    if payload.modules:
        modules_to_use = payload.modules
    else:
        saved = db.query(UserModule).filter(
            UserModule.user_id == current_user.id
        ).all()
        if not saved:
            raise HTTPException(
                status_code=400,
                detail="No module grades saved. Please save your grades on the Profile page first."
            )
        modules_to_use = [
            ModuleInput(module_code=m.module_code, grade=m.grade)
            for m in saved
        ]
    payload.modules = modules_to_use

    build_job_cache()

    # ── Module skills ──────────────────────────────────────────────────────────
    skill_weights = {}
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

    # ── Profile skills (projects + certs) ─────────────────────────────────────
    extra = [s.lower() for s in payload.extra_skills] if payload.extra_skills \
            else get_profile_skills_for_user(current_user.id, db)

    EXTRA_WEIGHT = 0.7
    for skill in extra:
        if skill not in skill_weights:
            skill_weights[skill] = EXTRA_WEIGHT

    # ── Build SBERT profile vector ─────────────────────────────────────────────
    profile_skills = []
    for skill, weight in sorted(skill_weights.items(), key=lambda x: -x[1]):
        repeats = 3 if weight >= 0.9 else 2 if weight >= 0.7 else 1
        profile_skills.extend([skill] * repeats)

    profile_text = " ".join(profile_skills)
    profile_vec = embedder.embed(profile_text)

    if payload.role_filter.strip():
        role_vec = embedder.embed(payload.role_filter.strip())
        profile_vec = 0.6 * profile_vec + 0.4 * role_vec
        profile_vec = profile_vec / (np.linalg.norm(profile_vec) + 1e-8)

    # ── Grad skill embeddings — embed once, normalise once ─────────────────────
    grad_skill_names = list(skill_weights.keys())
    if grad_skill_names:
        grad_embeddings = embedder.embed_batch(grad_skill_names)
        grad_embeddings = grad_embeddings / (np.linalg.norm(grad_embeddings, axis=1, keepdims=True) + 1e-8)
    else:
        grad_embeddings = np.array([])

    # ── SBERT ranking over all jobs ────────────────────────────────────────────
    role_filter_stripped = payload.role_filter.strip()
    known_subcategories = {cached["subcategory"] for cached in _job_cache.values() if cached.get("subcategory")}
    is_subcategory_filter = role_filter_stripped in known_subcategories

    sbert_scores = []
    for job_id, cached in _job_cache.items():
        if is_subcategory_filter and cached.get("subcategory") != role_filter_stripped:
            continue
        job_vec = cached["vec"]
        score = float(np.dot(profile_vec, job_vec) / (
            np.linalg.norm(profile_vec) * np.linalg.norm(job_vec) + 1e-8
        ))

        # Seniority penalty
        job_rank = SENIORITY_RANK.get(classify_seniority(cached["job_title"]), 1)
        gap = max(0, job_rank - 0)
        if gap >= 3:
            score = 0.0
        else:
            score = max(0.0, score - gap * PENALTY_PER_STEP)

        # Title boost
        if role_filter_stripped and not is_subcategory_filter:
            title_lower = cached["job_title"].lower()
            filter_lower = role_filter_stripped.lower()
            if filter_lower in title_lower:
                score = min(score + 0.2, 1.0)
            elif any(word in title_lower for word in filter_lower.split() if len(word) > 3):
                score = min(score + 0.08, 1.0)

        sbert_scores.append((job_id, score))

    sbert_scores.sort(key=lambda x: -x[1])
    top_candidates = sbert_scores if payload.top_n <= 0 else sbert_scores[:payload.top_n]

    # ── Coverage on top candidates only — uses pre-computed + pre-normalised vecs ──
    results = []
    for job_id, sbert_score in top_candidates:
        cached = _job_cache[job_id]
        job_skills = cached["skills"]
        coverage = compute_skill_coverage(
            grad_embeddings, job_skills, cached["skill_vecs"]
        ) if job_skills and len(grad_embeddings) else 0.0

        hybrid = 0.5 * sbert_score + 0.5 * (coverage / 100)
        hybrid_percent = round(hybrid * 100, 1)
        results.append({
            "job_id": cached["job_id"],
            "job_title": cached["job_title"],
            "company": cached["company"],
            "location": cached["location"],
            "subcategory": cached["subcategory"],
            "salary": cached["salary"],
            "match_score": hybrid,
            "match_percent": hybrid_percent,
            "top_job_skills": job_skills[:5],
        })

    results.sort(key=lambda x: -x["match_percent"])

    return {
        "graduate_profile": {
            "modules_count": len(payload.modules),
            "unique_skills": len(skill_weights),
            "top_skills": list(skill_weights.keys())[:10],
            "profile_skills_included": len(extra),
        },
        "role_filter": payload.role_filter,
        "recommendations": results,
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