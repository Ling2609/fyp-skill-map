from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import SessionLocal, get_db
from app.models.module import Module, ModuleSkill
from app.models.job import Job, JobSkill
from app.nlp.embedder import get_embedder
from app.routers.auth import get_current_user
from app.models.user import User
from app.services.job_titles import SENIORITY_RANK, classify_seniority
from app.services.job_search import names_company_or_place, search_match
from app.services.skill_names import canonical_key
from app.services.job_requirements import BONUS_WEIGHT, job_skill_items, score_job, unit_name
from app.services.skill_profile import (
    EMPTY_PROFILE_MESSAGE, build_skill_profile, count_modules, matched_mask, normalise_rows, profile_spellings,
)
import threading
from collections import Counter

import numpy as np

# Senior roles are ranked lower, never hidden (A7): the level is shown on each card instead
PENALTY_PER_STEP = 0.12   # taken off the ranking score per level above entry level
TO_LEARN_FROM_TOP = 20    # "skills to learn next" = skills missing most often in the student's top 20 matches


UNSTATED_LEVEL_STEPS = 0.5   # a title that states no level is about as likely entry as mid level (3 Oct, was 1 step;
                              # Indeed Hiring Lab 2026: 46% entry / 40% mid / 14% senior, and senior roles say so)


def seniority_penalty(level: str) -> float:
    """Graduates are entry level, so each level above that costs PENALTY_PER_STEP; an unstated level half a step."""
    steps = UNSTATED_LEVEL_STEPS if level == "unspecified" else SENIORITY_RANK.get(level, 1)
    return steps * PENALTY_PER_STEP


router = APIRouter(prefix="/recommend", tags=["recommend"])

embedder = get_embedder()   # shared with skillgap.py; vectors cached on disk

_job_cache = {}
_cache_lock = threading.Lock()   # requests run in parallel threads; one cache update at a time


def build_job_cache():
    """Keep the in-memory job cache in sync with the database.
    First call (at startup) embeds every job. Later calls (each /recommend request)
    only embed jobs added since, e.g. by fetch_live_jobs.py, and drop deleted ones,
    so new live jobs appear without restarting uvicorn."""
    with _cache_lock:
        _sync_job_cache()


def _sync_job_cache():
    db = SessionLocal()
    try:
        # Jobs that have skills (a job's skills are committed together, so this is safe mid-fetch)
        db_ids = {row[0] for row in db.query(JobSkill.job_id).distinct()}
        for gone in set(_job_cache) - db_ids:
            del _job_cache[gone]
        new_ids = db_ids - set(_job_cache)
        if not new_ids:
            return
        print(f"Adding {len(new_ids)} jobs to the job embedding cache...")

        rows_by_job = {}
        for s in db.query(JobSkill).filter(JobSkill.job_id.in_(new_ids)).order_by(JobSkill.id).all():
            rows_by_job.setdefault(s.job_id, []).append(s)
        # One entry per canonical skill: "Python" + "Python programming" is one requirement (A8),
        # with its level / type / either-or group (Stage 3A; empty for skills extracted before Stage 1)
        items_by_job = {j: job_skill_items(rows) for j, rows in rows_by_job.items()}
        skills_by_job = {j: [it.name for it in items] for j, items in items_by_job.items()}

        new_jobs = [j for j in db.query(Job).filter(Job.id.in_(new_ids)).all() if skills_by_job.get(j.id)]

        # Embed everything the new jobs need in ONE call: each skill name + each job's joined skill text.
        # Skill names repeat a lot across jobs ("SQL", "Python"), and vectors are saved to disk,
        # so after the first run only genuinely new text goes through the model.
        texts = []
        for job in new_jobs:
            texts.extend(skills_by_job[job.id])
            texts.append(" ".join(skills_by_job[job.id]))
        vec_of = dict(zip(texts, embedder.embed_cached(texts))) if texts else {}

        for job in new_jobs:
            skill_names = skills_by_job[job.id]
            vec = vec_of[" ".join(skill_names)]
            # Pre-normalise job skill vectors once per job
            skill_vecs = np.stack([vec_of[n] for n in skill_names])
            skill_vecs = normalise_rows(skill_vecs)
            _job_cache[job.id] = {
                "vec": vec,
                "job_id": job.job_id,
                "job_title": job.job_title,
                "company": job.company,
                "location": job.location,
                "subcategory": job.subcategory,
                "salary": job.salary,
                "source": job.source,
                "country": job.country,
                "level": classify_seniority(job.job_title),
                "skills": skill_names,
                "items": items_by_job[job.id],
                "skill_keys": [it.key for it in items_by_job[job.id]],
                "skill_vecs": skill_vecs,
            }
        print(f"Job cache ready: {len(_job_cache)} jobs with pre-computed skill vectors")
    finally:
        db.close()


class RecommendRequest(BaseModel):
    top_n: int = 10
    role_filter: str = ""
    include_past: bool = False   # False = live jobs only (you can apply). Past 2024 postings are data
                                 # for Career Paths / market stats, not recommendations


@router.post("/")
def recommend_jobs(
    payload: RecommendRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # One shared Graduate Skill Profile (modules + grades, projects, certifications)
    profile = build_skill_profile(current_user.id, db)
    if not profile:
        raise HTTPException(status_code=400, detail=EMPTY_PROFILE_MESSAGE)
    # Every spelling is embedded; canonical keys decide "same skill" (A8). Never embed the keys.
    spellings, spelling_keys, owner = profile_spellings(profile)
    skill_weights = {ev.name: ev.weight for ev in profile.values()}

    build_job_cache()

    # ── Build SBERT profile vector ─────────────────────────────────────────────
    profile_skills = []
    for skill, weight in sorted(skill_weights.items(), key=lambda x: -x[1]):
        repeats = 3 if weight >= 0.9 else 2 if weight >= 0.7 else 1
        profile_skills.extend([skill] * repeats)

    profile_text = " ".join(profile_skills)
    profile_vec = embedder.embed(profile_text)

    # A company or place search ("Penang") only selects jobs (search_match below); mixing the word "Penang" into the
    # profile vector would make the order inside that group noise. Job-title searches and category chips keep the mix.
    query = payload.role_filter.strip()
    names_place = bool(query) and any(
        names_company_or_place(query, c["company"], c["location"]) for c in list(_job_cache.values())
        if payload.include_past or c.get("source") == "live")
    if query and not names_place:
        role_vec = embedder.embed(query)
        profile_vec = 0.6 * profile_vec + 0.4 * role_vec
        profile_vec = profile_vec / (np.linalg.norm(profile_vec) + 1e-8)

    # ── Grad skill embeddings — embed once, normalise once ─────────────────────
    if spellings:
        grad_embeddings = normalise_rows(embedder.embed_cached(spellings))
    else:
        grad_embeddings = np.array([])

    # ── SBERT ranking over all jobs ────────────────────────────────────────────
    role_filter_stripped = payload.role_filter.strip()
    known_subcategories = {cached["subcategory"] for cached in list(_job_cache.values()) if cached.get("subcategory")}
    is_subcategory_filter = role_filter_stripped in known_subcategories
    query_key = canonical_key(role_filter_stripped) if role_filter_stripped else ""   # "LLM" finds Large Language Models (A8)

    sbert_scores = []
    for job_id, cached in list(_job_cache.items()):
        if not payload.include_past and cached.get("source") != "live":
            continue
        if is_subcategory_filter and cached.get("subcategory") != role_filter_stripped:
            continue
        job_vec = cached["vec"]
        score = float(np.dot(profile_vec, job_vec) / (
            np.linalg.norm(profile_vec) * np.linalg.norm(job_vec) + 1e-8
        ))

        # Title boost
        if role_filter_stripped and not is_subcategory_filter:
            title_lower = cached["job_title"].lower()
            filter_lower = role_filter_stripped.lower()
            if filter_lower in title_lower:
                score = min(score + 0.2, 1.0)
            elif any(word in title_lower for word in filter_lower.split() if len(word) > 3):
                score = min(score + 0.08, 1.0)

        sbert_scores.append((job_id, score))

    # Shortlist for coverage: the same level penalty, so a senior role doesn't take an entry-level role's place
    sbert_scores.sort(key=lambda x: -(x[1] - seniority_penalty(_job_cache[x[0]]["level"])))
    top_candidates = sbert_scores if payload.top_n <= 0 else sbert_scores[:payload.top_n]

    # ── Coverage on top candidates only — uses pre-computed + pre-normalised vecs ──
    results = []
    for job_id, sbert_score in top_candidates:
        cached = _job_cache.get(job_id)
        if cached is None:   # removed by a cache update from another request meanwhile
            continue
        job_skills = cached["skills"]
        items = cached["items"]
        has = matched_mask(grad_embeddings, cached["skill_vecs"], spelling_keys, owner, cached["skill_keys"])
        # Stage 3A: coverage = required skills held (either-or group = 1); preferred = small ranking bonus
        sc = score_job(items, has)
        matched, total, coverage = sc["matched"], sc["total"], sc["coverage"]

        # Ranking score ("best fit"): skill coverage + whole-profile similarity (+ title boost) + a small
        # bonus for nice-to-have skills, minus the level penalty. Used for ORDER only. What the student SEES
        # is skill coverage (X of N required), the same number Job Detail shows, plus the job's level as a tag.
        level = cached["level"]
        hybrid = max(0.0, 0.5 * sbert_score + 0.5 * (coverage / 100) + BONUS_WEIGHT * sc["bonus_ratio"]
                     - seniority_penalty(level))
        hybrid_percent = round(hybrid * 100, 1)
        # Typed search: how well title / company / location match the query (3 = phrase ... 0 = none,
        # app/services/job_search.py); 0 for everyone without a typed query (category chip or plain list)
        search_tier, search_skill = search_match(
            role_filter_stripped, cached["job_title"], cached["company"], cached["location"],
            job_skills, cached["skill_keys"], query_key) if role_filter_stripped and not is_subcategory_filter else (0, "")
        results.append({
            "job_id": cached["job_id"],
            "job_title": cached["job_title"],
            "company": cached["company"],
            "location": cached["location"],
            "subcategory": cached["subcategory"],
            "salary": cached["salary"],
            "source": cached["source"],
            "country": cached["country"],
            "match_score": hybrid,
            "match_percent": hybrid_percent,      # ranking score (kept for sorting / debugging)
            "search_match": search_tier,           # typed search only: jobs matching the query come first
            "search_skill": search_skill,          # the job skill the query matched (shown first on the card)
            "coverage_percent": coverage,          # shown to the student
            "level": level,                        # junior / unspecified / senior / lead / manager
            "skills_matched": matched,
            "skills_total": total,
            "coverage_basis": sc["basis"],                 # "required", or "preferred" when nothing is required
            "bonus_matched": sum(sc["bonus_met"]),
            "bonus_total": len(sc["bonus_units"]),
            # the searched skill first, so the card shows why the job matched (Hearst 2009: query-biased results)
            "top_job_skills": ([search_skill] + [s for s in job_skills if s != search_skill])[:5] if search_skill
                              else job_skills[:5],
            # Missing required skills (an either-or group is one, named "C# or Python")
            "_to_learn": [("|".join(sorted(items[i].key for i in u)), unit_name(items, u))
                          for u, ok in zip(sc["core_units"], sc["core_met"]) if not ok],
        })

    # Relevance first, then fit: with a typed query, matching jobs come first and best fit orders each group
    results.sort(key=lambda x: (-x["search_match"], -x["match_percent"]))

    # Skills to learn next: the skills the student lacks, counted over their top matches (Dashboard card)
    to_learn, names = Counter(), {}
    for r in results[:TO_LEARN_FROM_TOP]:
        for key, name in r["_to_learn"]:
            to_learn[key] += 1
            names.setdefault(key, name)
    for r in results:
        del r["_to_learn"]

    return {
        "graduate_profile": {
            "modules_count": count_modules(current_user.id, db),
            "unique_skills": len(skill_weights),
            "top_skills": list(skill_weights.keys())[:10],
            "profile_skills_included": sum(1 for ev in profile.values() if ev.source != "module"),
        },
        "role_filter": payload.role_filter,
        "recommendations": results,
        "skills_to_learn": [{"skill": names[k], "jobs": n, "of_top": min(TO_LEARN_FROM_TOP, len(results))}
                            for k, n in to_learn.most_common(5)],
        "total_jobs_compared": sum(
            1 for c in list(_job_cache.values()) if payload.include_past or c.get("source") == "live"
        ),
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