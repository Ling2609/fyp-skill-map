"""
Fill data/relation_cache.json before a demo, so no page waits for the relationship model.

Scores every pair the app could ask about: each module skill (all modules, not one student's) x each job skill of
the jobs Job Matches shows (not hidden by a refresh), where SBERT cosine >= the candidate floor and the two are not
the same A8 skill: exactly the pairs app/services/skill_relation.py would score on first use. Project and
certification skills are scored on first use instead (each student has their own).
Run again after a job refresh or a new model; pairs already in the cache are skipped.

Usage (from backend/, venv active, RELATION_MODEL_DIR set in backend/.env):
  python scripts/skill_relations/warm_relation_cache.py
"""
import sys
import time

import numpy as np

sys.path.append(".")


def main():
    from app.database import SessionLocal
    from app.models.job import Job, JobSkill
    from app.models.module import ModuleSkill
    from app.nlp.embedder import get_embedder
    from app.services import skill_relation
    from app.services.skill_names import canonical_key
    from app.services.skill_profile import normalise_rows

    if not skill_relation.enabled():
        raise SystemExit("The relationship model is off: set RELATION_MODEL_DIR in backend/.env first")

    db = SessionLocal()
    try:
        modules = sorted({n.strip() for (n,) in db.query(ModuleSkill.skill_name) if n and n.strip()})
        jobs = sorted({n.strip() for (n,) in db.query(JobSkill.skill_name).join(Job, Job.id == JobSkill.job_id)
                       .filter(Job.gone_at.is_(None)) if n and n.strip()})
    finally:
        db.close()

    emb = get_embedder()
    sims = normalise_rows(emb.embed_cached(modules)) @ normalise_rows(emb.embed_cached(jobs)).T
    mk = np.array([canonical_key(n) for n in modules], dtype=object)
    jk = np.array([canonical_key(n) for n in jobs], dtype=object)
    ms, js = np.nonzero((sims >= skill_relation.CANDIDATE_FLOOR) & (mk[:, None] != jk[None, :]))
    pairs = [(modules[m], jobs[j]) for m, j in zip(ms, js)]
    print(f"Module skills {len(modules)}, job skills {len(jobs)}: {len(pairs)} pairs at cosine >= "
          f"{skill_relation.CANDIDATE_FLOOR}")

    t0 = time.time()
    p = skill_relation.p_satisfies(pairs)
    secs = time.time() - t0
    print(f"Done in {secs:.0f} s. 'Has it' (p >= {skill_relation.cutoff()}): {int((p >= skill_relation.cutoff()).sum())} "
          f"of {len(pairs)}; the cosine >= 0.7 rule would say {int((sims[ms, js] >= 0.7).sum())}")


if __name__ == "__main__":
    main()
