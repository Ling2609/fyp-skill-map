from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models.job import Job, JobSkill
from app.routers.auth import get_current_user
from app.models.user import User
from app.nlp.embedder import get_embedder
from app.services.job_requirements import job_skill_items, score_job, unit_name, unit_quote
from app.services.skill_profile import (
    EMPTY_PROFILE_MESSAGE, MATCH_THRESHOLD,
    build_skill_profile, normalise_rows, profile_spellings, similarity_matrix,
)

router = APIRouter(prefix="/skillgap", tags=["skill-gap"])

embedder = get_embedder()


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
    skill_grade = {ev.name: ev.grade for ev in profile.values()}            # the module grade itself (B4)

    # Get job
    job = db.query(Job).filter(Job.job_id == payload.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job_skills_db = db.query(JobSkill).filter(JobSkill.job_id == job.id).order_by(JobSkill.id).all()
    if not job_skills_db:
        raise HTTPException(status_code=404, detail="No skills found for this job")

    # One entry per canonical skill, same as Job Matches (A8), so both pages show the same "X of N",
    # with level / type / either-or group (Stage 3A; empty for skills extracted before Stage 1)
    items = job_skill_items(job_skills_db)
    job_skills = [it.name for it in items]

    # Embed every spelling of the student's skills and the job skills in one batch call, then split
    grad_skill_names = list(graduate_skills.keys())          # one per skill, same order as the profile
    spellings, spelling_keys, owner = profile_spellings(profile)
    embeddings = embedder.embed_cached(spellings + job_skills)
    spelling_embeddings = normalise_rows(embeddings[:len(spellings)])
    job_embeddings = normalise_rows(embeddings[len(spellings):])

    # sim_matrix[j, g] = best cosine similarity between job skill j and any spelling of grad skill g;
    # the same canonical skill ("MS SQL Server" / "SQL Server") counts as 1.0 (direct)
    sim_matrix = similarity_matrix(job_embeddings, spelling_embeddings,
                                   [it.key for it in items], spelling_keys, owner)  # (J, G)

    best_scores  = sim_matrix.max(axis=1)            # best grad match score per job skill
    best_indices = sim_matrix.argmax(axis=1)         # which grad skill matched best

    has = best_scores >= MATCH_THRESHOLD     # the student has job skill j: same skill (A8) or SBERT >= 0.7
    sc = score_job(items, has)

    def evidence(j_idx):
        """The student's skill that covers job skill j_idx, and where it comes from."""
        best_match = grad_skill_names[int(best_indices[j_idx])]
        return {
            "matched_graduate_skill": best_match,
            "matched_via_module": skill_module_map.get(best_match, ""),
            "similarity": round(float(best_scores[j_idx]), 3),
            "grade_weight": graduate_skills.get(best_match, 0),
            "grade": skill_grade.get(best_match),              # e.g. 3.7; shown as "A-" (weights merge C+ and C)
            "evidence_source": skill_source_type.get(best_match, "module"),  # module / project / cert
            "evidence": "direct",
        }

    matched, missing = [], []
    # One row per requirement (an either-or group is one row, e.g. "C# or Python")
    for unit, ok in zip(sc["core_units"], sc["core_met"]):
        name = unit_name(items, unit)
        if ok:
            j_idx = next(i for i in unit if has[i])
            matched.append({"job_skill": name, "ad_quote": unit_quote(items, unit), **evidence(j_idx)})
        else:
            # A gap. No "partly covered" / "builds on" reason: below 0.7 SBERT closeness is not reliable
            # evidence (step 2: 9 of 60 related pairs were the same skill), and a plausible but weak
            # explanation misleads (Papenmeier et al. 2019). Closest skill kept for research only.
            j_idx = max(unit, key=lambda i: best_scores[i])
            missing.append({
                "job_skill": name,
                "ad_quote": unit_quote(items, unit),     # why it is a requirement, in the ad's own words
                "closest_graduate_skill": grad_skill_names[int(best_indices[j_idx])],
                "similarity": round(float(best_scores[j_idx]), 3),
                "status": "missing",
                "gap_reason": "Not in your record yet",
            })

    # Nice to have (preferred): shown apart, never in the %; empty until a job is re-extracted (Stage 1)
    nice_to_have = [{"job_skill": unit_name(items, u), "has": ok, "ad_quote": unit_quote(items, u)}
                    for u, ok in zip(sc["bonus_units"], sc["bonus_met"])]

    gap_score = sc["coverage"]

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
            "job_skills_total": sc["total"],
            "matched_skills": len(matched),
            "missing_skills": len(missing),
            "gap_score": round(gap_score, 1),
            "coverage_percent": round(gap_score, 1),
            "coverage_basis": sc["basis"],      # "required", or "preferred" when the job requires nothing specific
        },
        "matched_skills": matched,
        "missing_skills": missing,
        "nice_to_have": nice_to_have,           # [{job_skill, has, ad_quote}]
        "learn_on_job": sc["learn"],            # skills the role will teach: never a gap
        "soft_skills": sc["soft"],              # listed apart, not in the %
    }
