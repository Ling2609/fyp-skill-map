"""
Fix plan feasibility check (read-only, no Groq): do the numbers the plan relies on hold on this database?

  1. 2024 ads: how many, and how many descriptions were cut at 2,000 characters in the database
     (the quote check must then read the full text from data/jobstreet_clean.csv; is that file here?)
  2. Distinct job skills (A8 canonical keys) in the 2024 ads vs the live ads, and how many appear ONLY
     in live ads (= the test set for the planned time split)
  3. Candidate pairs for training: module skill x job skill with SBERT cosine in the grey band
     0.55-0.85, in total and for live-only skills

Usage (from backend/, venv active):
  python scripts/tools/check_plan_feasibility.py
"""
import os
import sys

import numpy as np

sys.path.append(".")

from app.database import SessionLocal
from app.models.job import Job, JobSkill
from app.models.module import ModuleSkill
from app.nlp.embedder import get_embedder
from app.services.skill_names import canonical_key
from app.services.skill_profile import normalise_rows

CSV = "data/jobstreet_clean.csv"
BAND = (0.55, 0.85)
CUT = 2000


def main():
    db = SessionLocal()
    try:
        # 1. 2024 ads and truncation
        dataset = db.query(Job.id, Job.description).filter(Job.source != "live").all()
        cut = sum(1 for _, d in dataset if d and len(d) >= CUT)
        print(f"1. 2024 ads in the database: {len(dataset)}; descriptions cut at {CUT} characters: "
              f"{cut} ({round(100 * cut / max(len(dataset), 1))}%)")
        print(f"   {CSV} present: {os.path.exists(CSV)}")

        # 2. Distinct job skills by source
        rows = (db.query(JobSkill.skill_name, Job.source)
                .join(Job, Job.id == JobSkill.job_id).all())
        names = {"dataset": {}, "live": {}}
        for name, source in rows:
            key = canonical_key(name)
            if key:
                names["live" if source == "live" else "dataset"].setdefault(key, name.strip())
        live_only = {k: n for k, n in names["live"].items() if k not in names["dataset"]}
        print(f"\n2. Distinct job skills: 2024 ads {len(names['dataset'])}, live ads {len(names['live'])}, "
              f"only in live ads {len(live_only)} "
              f"({round(100 * len(live_only) / max(len(names['live']), 1))}% of live skills)")
        print("   Examples only in live ads:", ", ".join(list(live_only.values())[:12]))

        # 3. Grey-band candidate pairs
        modules = {}
        for (name,) in db.query(ModuleSkill.skill_name):
            key = canonical_key(name)
            if key:
                modules.setdefault(key, name.strip())
        mod_names = list(modules.values())
        job_names = list({**names["dataset"], **names["live"]}.values())
        embedder = get_embedder()
        m = normalise_rows(embedder.embed_cached(mod_names)).astype(np.float32)
        j = normalise_rows(embedder.embed_cached(job_names)).astype(np.float32)
        sims = m @ j.T
        in_band = (sims >= BAND[0]) & (sims < BAND[1])
        live_cols = np.array([canonical_key(n) in live_only for n in job_names])
        print(f"\n3. Module skills {len(mod_names)} x job skills {len(job_names)}:")
        print(f"   pairs in the grey band {BAND[0]}-{BAND[1]}: {int(in_band.sum())}")
        for lo, hi in ((0.55, 0.65), (0.65, 0.75), (0.75, 0.85)):
            print(f"     {lo}-{hi}: {int(((sims >= lo) & (sims < hi)).sum())}")
        print(f"   of which involve live-only skills (time-split test pairs): {int(in_band[:, live_cols].sum())}")
        print(f"   pairs >= 0.85 (easy positives): {int((sims >= 0.85).sum())}; "
              f"pairs 0.45-0.55 (easy negatives near the band): {int(((sims >= 0.45) & (sims < 0.55)).sum())}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
