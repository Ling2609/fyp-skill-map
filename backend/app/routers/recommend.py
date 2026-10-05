from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import SessionLocal, get_db
from app.models.module import Module, ModuleSkill
from app.models.job import Job, JobSkill
from app.nlp.embedder import get_embedder
from app.routers.auth import get_current_user
from app.models.user import User
from app.services.job_titles import SENIORITY_RANK, job_level
from app.services.job_search import TITLE, names_company_or_place, search_match, title_boost
from app.services.skill_names import canonical_key
from app.services.job_requirements import BONUS_WEIGHT, job_skill_items, score_job, unit_name
from app.services.skill_profile import (
    EMPTY_PROFILE_MESSAGE, build_skill_profile, count_modules, matched_mask, normalise_rows, profile_spellings,
)
import math
import threading
from datetime import datetime, timezone
from collections import Counter

import numpy as np

# Senior roles are ranked lower, never hidden (A7): the level is shown on each card instead
PENALTY_PER_STEP = 0.12   # taken off the ranking score per level above entry level
TO_LEARN_FROM_TOP = 20    # "skills to learn next" = skills missing most often in the student's top 20 matches


UNSTATED_LEVEL_STEPS = 0.5   # a title that states no level is about as likely entry as mid level (3 Oct, was 1 step;
                              # Indeed Hiring Lab 2026: 46% entry / 40% mid / 14% senior, and senior roles say so)


def card_skills(items, sc: dict, search_skill: str = "", n: int = 5) -> list[str]:
    """Skill chips on a Job Matches card (5 Oct). A list entry should help predict what the job is about
    (NN/g, "The Anatomy of a List Entry"; "Information Scent"), so: the searched skill, then the skills the
    % counts (required, or the fallback basis), then nice-to-have, then other hard skills; never soft skills.
    Which ones the student has is explained on Job Detail, not on the card (as LinkedIn's "How you match")."""
    order = [items[i].name for u in sc["core_units"] for i in u] + \
            [items[i].name for u in sc["bonus_units"] for i in u] + \
            [it.name for it in items if it.tier not in ("soft",)]
    out = [search_skill] if search_skill else []
    for name in order:
        if name not in out:
            out.append(name)
    return out[:n]


MAX_AGE_DAYS = 45       # live jobs posted longer ago are not recommended (F8): most postings stay up ~30 days
                         # (Indeed) and may stay up after the role is filled; 45 gives a margin. references.md
WILSON_Z = 1.96          # 95%: ranking uses the lower bound of the coverage, not the raw % (Evan Miller)


def coverage_confidence(matched: int, total: int) -> float:
    """Lower bound of the Wilson score interval for matched / total (Evan Miller, "How Not To Sort By Average
    Rating"). 1 of 1 = 0.21, 5 of 5 = 0.57, 9 of 10 = 0.60: a job that asks for one skill no longer ranks above
    one where you have 9 of 10 (5 Oct: Meta, 1 of 1 required, was first). Ranking only; the card shows "1/1"."""
    if total <= 0:
        return 0.0
    p, z = matched / total, WILSON_Z
    return (p + z * z / (2 * total) - z * math.sqrt((p * (1 - p) + z * z / (4 * total)) / total)) / (1 + z * z / total)


def age_days(listing_date) -> int | None:
    if not listing_date:
        return None
    if listing_date.tzinfo is None:
        listing_date = listing_date.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - listing_date).days


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
                "level": job_level(job.job_title, job.description or ""),   # title, else years asked for
                "listing_date": job.listing_date,
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
    role_filter: str = ""        # typed search (title, skill, company or location)
    category: str = ""           # category chip; combines with the typed search (both apply)
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

    # Older callers sent the category chip as role_filter; treat a role_filter that IS a category name as the chip
    query = payload.role_filter.strip()
    category = payload.category.strip()
    known_subcategories = {cached["subcategory"] for cached in list(_job_cache.values()) if cached.get("subcategory")}
    if query in known_subcategories and not category:
        query, category = "", query
    query_key = canonical_key(query) if query else ""   # "LLM" finds Large Language Models (A8)

    # Search relevance of every eligible job, BEFORE any shortlist, so a job matching the query is never cut by
    # top_n (external audit, 3 Oct). Tier 0 / "" for everyone without a typed query.
    eligible = [(job_id, cached) for job_id, cached in list(_job_cache.items())
                if (payload.include_past or cached.get("source") == "live")
                and not (cached.get("source") == "live" and (age_days(cached.get("listing_date")) or 0) > MAX_AGE_DAYS)
                and (not category or cached.get("subcategory") == category)]
    search = {job_id: search_match(query, cached["job_title"], cached["company"], cached["location"],
                                   cached["skills"], cached["skill_keys"], query_key) if query else (0, "")
              for job_id, cached in eligible}

    # A company or place search ("Penang") only selects jobs; mixing the word "Penang" into the profile vector would
    # make the order inside that group noise. It counts as a company/place only if it is NOT also a job word: no job
    # has it in its title or skills (else a company named "... Data ..." would turn "data" into a company search).
    is_job_word = any(tier == TITLE or skill for tier, skill in search.values())
    names_place = bool(query) and not is_job_word and any(
        names_company_or_place(query, c["company"], c["location"]) for _, c in eligible)
    mix_text = query if query and not names_place else category   # the chip keeps its old mix when nothing is typed
    if mix_text:
        role_vec = embedder.embed(mix_text)
        profile_vec = 0.6 * profile_vec + 0.4 * role_vec
        profile_vec = profile_vec / (np.linalg.norm(profile_vec) + 1e-8)

    # ── Grad skill embeddings — embed once, normalise once ─────────────────────
    if spellings:
        grad_embeddings = normalise_rows(embedder.embed_cached(spellings))
    else:
        grad_embeddings = np.array([])

    # ── SBERT ranking over all jobs ────────────────────────────────────────────
    sbert_scores = []
    for job_id, cached in eligible:
        job_vec = cached["vec"]
        score = float(np.dot(profile_vec, job_vec) / (
            np.linalg.norm(profile_vec) * np.linalg.norm(job_vec) + 1e-8
        ))

        # Title boost (whole words, same rule as the search tiers)
        if query:
            score = min(score + title_boost(query, cached["job_title"]), 1.0)

        sbert_scores.append((job_id, score))

    # Shortlist for coverage: the same level penalty, so a senior role doesn't take an entry-level role's place
    # Jobs matching the typed query first (relevance, then fit), as in the final order below
    sbert_scores.sort(key=lambda x: (-search[x[0]][0], -(x[1] - seniority_penalty(_job_cache[x[0]]["level"]))))
    top_candidates = sbert_scores if payload.top_n <= 0 else sbert_scores[:payload.top_n]

    # ── Coverage on top candidates only — uses pre-computed + pre-normalised vecs ──
    results = []
    for job_id, sbert_score in top_candidates:
        cached = _job_cache.get(job_id)
        if cached is None:   # removed by a cache update from another request meanwhile
            continue
        items = cached["items"]
        has = matched_mask(grad_embeddings, cached["skill_vecs"], spelling_keys, owner, cached["skill_keys"])
        # Stage 3A: coverage = required skills held (either-or group = 1); preferred = small ranking bonus
        sc = score_job(items, has)
        matched, total, coverage = sc["matched"], sc["total"], sc["coverage"]

        # Ranking score ("best fit"): skill coverage + whole-profile similarity (+ title boost) + a small
        # bonus for nice-to-have skills, minus the level penalty. Used for ORDER only. What the student SEES
        # is skill coverage (X of N required), the same number Job Detail shows, plus the job's level as a tag.
        level = cached["level"]
        confidence = coverage_confidence(matched, total)
        hybrid = max(0.0, 0.5 * sbert_score + 0.5 * confidence + BONUS_WEIGHT * sc["bonus_ratio"]
                     - seniority_penalty(level))
        hybrid_percent = round(hybrid * 100, 1)
        # Typed search: how well title / company / location match the query (3 = phrase ... 0 = none,
        # app/services/job_search.py); 0 for everyone without a typed query (category chip or plain list)
        search_tier, search_skill = search[job_id]
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
            "coverage_confidence": round(confidence, 3),   # ranking only ("Most skills matched" sorts by it)
            "posted_days_ago": age_days(cached.get("listing_date")),
            "level": level,                        # junior / unspecified / senior / lead / manager
            "skills_matched": matched,
            "skills_total": total,
            "coverage_basis": sc["basis"],                 # "required", or "preferred" when nothing is required
            "bonus_matched": sum(sc["bonus_met"]),
            "bonus_total": len(sc["bonus_units"]),
            # the searched skill first, so the card shows why the job matched (Hearst 2009: query-biased results);
            # then what the job asks for, not the stored order (which could start with a duty or a soft skill)
            "top_job_skills": card_skills(items, sc, search_skill),
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
            1 for c in list(_job_cache.values()) if (payload.include_past or c.get("source") == "live")
            and not (c.get("source") == "live" and (age_days(c.get("listing_date")) or 0) > MAX_AGE_DAYS)
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