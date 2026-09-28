from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models.job import Job, JobSkill
from app.routers.auth import get_current_user
from app.models.user import User
from app.nlp.embedder import get_embedder
from app.services.skill_profile import (
    DIRECT_THRESHOLD, EMPTY_PROFILE_MESSAGE, MATCH_THRESHOLD, PARTLY_THRESHOLD,
    build_skill_profile, normalise_rows,
)

router = APIRouter(prefix="/skillgap", tags=["skill-gap"])

embedder = get_embedder()

BONUS_RELEVANCE_MIN = 0.3    # extra skills below this are unrelated to the job, so hidden


class SkillGapRequest(BaseModel):
    job_id: str


@router.post("/")
def analyse_skill_gap(
    payload: SkillGapRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # One shared Graduate Skill Profile (modules + grades, projects, certifications).
    # Module evidence wins over project/cert evidence because it carries a grade.
    profile = build_skill_profile(current_user.id, db)
    if not profile:
        raise HTTPException(status_code=400, detail=EMPTY_PROFILE_MESSAGE)
    graduate_skills = {ev.name: ev.weight for ev in profile.values()}       # skill_name -> weight
    skill_module_map = {ev.name: ev.source_name for ev in profile.values()} # skill_name -> where it came from
    skill_source_type = {ev.name: ev.source for ev in profile.values()}     # "module" / "project" / "cert"

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
    embeddings = embedder.embed_cached(all_skills)

    grad_embeddings = embeddings[:len(grad_skill_names)]
    job_embeddings  = embeddings[len(grad_skill_names):]

    # Normalise both matrices once — then similarity = matmul (no per-pair norm)
    grad_embeddings = normalise_rows(grad_embeddings)
    job_embeddings  = normalise_rows(job_embeddings)

    # One matmul: sim_matrix[j, g] = cosine similarity between job skill j and grad skill g
    sim_matrix = job_embeddings @ grad_embeddings.T  # (J, G)

    best_scores  = sim_matrix.max(axis=1)            # best grad match score per job skill
    best_indices = sim_matrix.argmax(axis=1)         # which grad skill matched best

    matched = []
    missing = []

    for j_idx, job_skill in enumerate(job_skills):
        best_score = float(best_scores[j_idx])
        best_match = grad_skill_names[int(best_indices[j_idx])]

        if best_score >= MATCH_THRESHOLD:
            matched.append({
                "job_skill": job_skill,
                "matched_graduate_skill": best_match,
                "matched_via_module": skill_module_map.get(best_match, ""),
                "similarity": round(best_score, 3),
                "grade_weight": graduate_skills.get(best_match, 0),
                "evidence_source": skill_source_type.get(best_match, "module"),  # module / project / cert
                # direct  = your skill is essentially the same as the requirement (≥ 0.8)
                # related = you studied a close topic, not this exact skill (0.6–0.79)
                "evidence": "direct" if best_score >= DIRECT_THRESHOLD else "related",
            })
        else:
            # Explain why: related skill exists but not close enough = partly covered,
            # no similar skill at all = not in modules. (Grade does not affect matching.)
            if best_score >= PARTLY_THRESHOLD:
                gap_reason = f"Partly covered in {skill_module_map.get(best_match, 'a module')}"
            else:
                gap_reason = "Not in your modules or projects"
            missing.append({
                "job_skill": job_skill,
                "closest_graduate_skill": best_match,
                "similarity": round(best_score, 3),
                "gap_reason": gap_reason,
            })

    # Grad skills not related to this job's requirements.
    # Exclude skills used for a match AND skills behind a "Partly covered" gap —
    # otherwise the same skill shows as both "related to a gap" and "extra".
    matched_grad_skills = {m["matched_graduate_skill"] for m in matched}
    matched_grad_skills |= {m["closest_graduate_skill"] for m in missing if m["similarity"] >= PARTLY_THRESHOLD}
    # Keep only extras that are still relevant to THIS job (worth mentioning in a CV
    # or interview), most relevant first. Unrelated ones (e.g. Python syntax for a
    # networking role) are dropped instead of padding the list.
    grad_relevance = sim_matrix.max(axis=0)  # best score of each grad skill vs any job skill
    graduate_only = sorted(
        (
            {"skill": s, "grade_weight": graduate_skills[s], "relevance": round(float(grad_relevance[g]), 3)}
            for g, s in enumerate(grad_skill_names)
            if s not in matched_grad_skills and grad_relevance[g] >= BONUS_RELEVANCE_MIN
        ),
        key=lambda x: x["relevance"],
        reverse=True,
    )

    gap_score = len(matched) / len(job_skills) * 100 if job_skills else 0

    return {
        "job": {
            "job_id": job.job_id,
            "job_title": job.job_title,
            "company": job.company,
            "location": job.location,
            "salary": job.salary,
            "description": job.description,
            "source": job.source,
            "source_url": job.source_url,
            "publisher": job.publisher,
            "listing_date": job.listing_date.isoformat() if job.listing_date else None,
            "country": job.country,
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
        "graduate_only_skills": graduate_only[:8],
    }