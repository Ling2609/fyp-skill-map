"""
Debug one job's skill match (read-only): for every job skill, the student's best skill, the spelling
that scored best, and the score, worked out the way Job Matches does it (cached job vectors) and
the way Job Detail does it (fresh embedding). Both pages should always give the same "X of N".

Usage (from backend/, venv active):
  python scripts/tools/compare_match_pages.py <username or email> "<part of the job title>"
"""
import sys

sys.path.append(".")

from app.database import SessionLocal
from app.models.job import Job, JobSkill
from app.models.user import User
from app.nlp.embedder import get_embedder
from app.routers import recommend
from app.services.skill_names import canonical_key, dedupe_skills
from app.services.skill_profile import (
    MATCH_THRESHOLD, build_skill_profile, normalise_rows, profile_spellings, similarity_matrix,
)


def best_spelling(job_vec, spelling_vecs, owner, g):
    """Which spelling of skill g scored best against one job skill."""
    rows = [r for r, o in enumerate(owner) if o == g]
    return max(rows, key=lambda r: float(job_vec @ spelling_vecs[r]))


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return
    who, title = sys.argv[1].strip().lower(), sys.argv[2].lower()
    db = SessionLocal()
    try:
        user = db.query(User).filter((User.username == who) | (User.email == who)).first()
        job = db.query(Job).filter(Job.job_title.ilike(f"%{title}%"), Job.source == "live").first()
        if not user or not job:
            print("User or job not found")
            return
        print(f"{user.username} vs {job.job_title} ({job.company}), job id {job.id}\n")

        profile = build_skill_profile(user.id, db)
        names = [ev.name for ev in profile.values()]
        spellings, keys, owner = profile_spellings(profile)
        print(f"Profile: {len(profile)} skills, {len(spellings)} spellings")
        embedder = get_embedder()
        spelling_vecs = normalise_rows(embedder.embed_cached(spellings))

        # Job Matches way (cached job vectors)
        recommend.build_job_cache()
        cached = next(c for c in recommend._job_cache.values() if c["job_id"] == job.job_id)
        sims_list = similarity_matrix(cached["skill_vecs"], spelling_vecs, cached["skill_keys"], keys, owner)

        # Job Detail way (fresh embedding)
        rows = db.query(JobSkill).filter(JobSkill.job_id == job.id).order_by(JobSkill.id).all()
        job_skills = dedupe_skills([s.skill_name for s in rows])
        job_vecs = normalise_rows(embedder.embed_cached(job_skills))
        sims_det = similarity_matrix(job_vecs, spelling_vecs, [canonical_key(s) for s in job_skills], keys, owner)

        print(f"\n{'job skill':<28} {'best skill (spelling that scored)':<60} {'Matches':>7} {'Detail':>7}")
        for j, skill in enumerate(job_skills):
            g = int(sims_det[j].argmax())
            s = spellings[best_spelling(job_vecs[j], spelling_vecs, owner, g)]
            shown = names[g] + (f"  ({s})" if s != names[g] else "")
            print(f"{skill[:27]:<28} {shown[:59]:<60} {sims_list[j].max():7.3f} {sims_det[j].max():7.3f}")
        print(f"\nMatched (>= {MATCH_THRESHOLD}): Job Matches {int((sims_list.max(axis=1) >= MATCH_THRESHOLD).sum())}"
              f"/{len(cached['skills'])}, Job Detail {int((sims_det.max(axis=1) >= MATCH_THRESHOLD).sum())}/{len(job_skills)}")
        merged = [ev.spellings for ev in profile.values() if len(ev.spellings) > 1]
        print(f"\nProfile skills with more than one spelling ({len(merged)}):")
        for sp in merged:
            print("  " + " | ".join(sp))
    finally:
        db.close()


if __name__ == "__main__":
    main()
