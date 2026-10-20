import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models.job import Job, JobSkill
from app.routers.auth import get_current_user
from app.models.user import User
from app.nlp.embedder import get_embedder
from app.services import ad_requirements
from app.services.job_requirements import job_skill_items, score_job, unit_name, unit_quote
from app.services.skill_profile import (
    EMPTY_PROFILE_MESSAGE, build_skill_profile, match_matrix, normalise_rows, profile_spellings,
)

router = APIRouter(prefix="/skillgap", tags=["skill-gap"])

embedder = get_embedder()


def _record(job: Job, db: Session) -> dict | None:
    if job.source != "employer" or not job.posted_by_user_id:
        return None
    from app.services.transparency import employer_record
    return employer_record(job.posted_by_user_id, db)


class SkillGapRequest(BaseModel):
    job_id: str


@router.post("/")
def analyse_skill_gap(
    payload: SkillGapRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return skill_gap_for(current_user, payload.job_id, db)


def skill_gap_for(student: User, job_ref: str, db: Session) -> dict:
    """One student's skill gap for one job (11 Oct: also used for an employer's applicants, employer.py)."""
    # One shared Graduate Skill Profile (modules + grades, projects, certifications).
    # Module evidence wins over project/cert evidence because it carries a grade.
    profile = build_skill_profile(student.id, db)
    if not profile:
        raise HTTPException(status_code=400, detail=EMPTY_PROFILE_MESSAGE)
    graduate_skills = {ev.name: ev.weight for ev in profile.values()}       # skill_name -> weight
    skill_module_map = {ev.name: ev.source_name for ev in profile.values()} # skill_name -> where it came from
    skill_source_type = {ev.name: ev.source for ev in profile.values()}     # "module" / "project" / "cert"
    skill_grade = {ev.name: ev.grade for ev in profile.values()}            # the module grade itself (B4)

    # Get job
    job = db.query(Job).filter(Job.job_id == job_ref).first()
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

    # sim_matrix[j, g] = best cosine similarity between job skill j and any spelling of grad skill g (same
    # canonical skill = 1.0); has_matrix[j, g] = grad skill g covers job skill j (same skill, or the relationship
    # model when it is on, else SBERT >= 0.7): app/services/skill_profile.py match_matrix
    sim_matrix, has_matrix = match_matrix(job_embeddings, spelling_embeddings, job_skills,
                                          [it.key for it in items], spellings, spelling_keys, owner)  # (J, G)

    has = has_matrix.any(axis=1)
    # which grad skill to show: the closest one that covers the skill, else (a gap) the closest one
    best_indices = np.where(has_matrix, sim_matrix, -2.0).argmax(axis=1)
    best_indices = np.where(has, best_indices, sim_matrix.argmax(axis=1))
    best_scores  = sim_matrix[np.arange(len(job_skills)), best_indices]
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
            # A gap. No "partly covered" / "builds on" reason: closeness alone is not reliable
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
            # 11 Oct: a SkillMap post its employer closed (or Admin hid) can still be opened, e.g. from My applications
            "closed": bool(job.closed_at or job.hidden_by_admin_at),
            # 20 Oct: a live ad the latest search no longer returns (fetch_live_jobs.py sync hides it, never deletes):
            # it can still be opened from My Applications, but its apply link may be dead
            "gone": bool(job.gone_at),
            # 14 Oct: before applying, the student sees the employer's decision date; a stopped job can't be applied to
            "decide_by": job.decide_by.isoformat() if job.decide_by else None,
            "taking_applications": not (job.closed_at or job.hidden_by_admin_at or job.applications_stopped_at),
            # 18 Oct (improvement #1): the employer's on-time record BEFORE applying (it was only in My applications);
            # SkillMap posts only: for a job on another site SkillMap never sees the replies
            "employer_record": _record(job, db),
            # 19 Oct (E6): what the ad asks besides skills, read by fixed rules, shown as pills under the title.
            # Qualification, field, languages and a salary written in the text (when the salary field is empty);
            # citizenship left out (found 0 of 2 in E6). Display only: not part of the % or the ranking.
            # Only for jobs a student can apply to (her call, 19 Oct): live jobs read by the rules measured in E6;
            # SkillMap posts from the employer's own fields in Post a Job (option F: stated, not guessed); none for
            # the 2024 JobStreet past postings (market data).
            "requirements": (ad_requirements.shown(job.description or "", job.salary) if job.source == "live"
                             else ad_requirements.from_post(job.min_qualification, job.study_field, job.languages)
                             if job.source == "employer" else None),
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
        # gained in the role (19 Oct, her T1 + G1): never a gap, never in the %; "has" says whether the student
        # already has it (same match as every other skill), so the page can tick it or offer "Learn"
        "learn_on_job": [{"job_skill": it.name, "has": bool(has[i]), "ad_quote": unit_quote(items, [i])}
                         for i, it in enumerate(items) if it.tier == "learn"],
        "soft_skills": sc["soft"],              # listed apart, not in the %
    }
