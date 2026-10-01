"""
Reference set of real SkillMap pairs (Stage 2B): pick ~400 pairs "module skill -> job skill" from this database for
three judges to label with docs/skill_relation_label_guide.md. Cosine and the relationship model are then compared
on the same pairs. Read-only: no Groq, nothing in the database changes.

How pairs are picked (references.md, "Reference set of real SkillMap pairs"):
  - A = a module skill (what students have), B = a job skill (2024 ads + live ads); names only.
  - Pairs are drawn per SBERT cosine band, not at random: real matches are rare among all module x job pairs, so a
    random sample would be almost all obvious non-matches (Marchant & Rubinstein 2017).
  - Each band is sampled at a different rate, so the script also saves how many candidate pairs each band really
    has (band_population). Results are reported per band; an overall figure must weight each band by that
    number (Fogliato et al. 2024). The < 0.55 band is a sanity check only, outside the weighted figure.
  - Left out: skills whose name (A8 canonical key) is in the training CSV (the model has seen them, Levy et al.
    2015), and pairs where A and B are the same A8 skill (A8 decides those before the model is asked).
  - A skill appears in at most MAX_PER_SKILL pairs, so a common skill like "SQL" can't fill a band.
  - Rows are shuffled, so judges don't see the pairs grouped by band. Judges get only columns a and b.

Usage (from backend/, venv active):
  python scripts/skill_relations/sample_reference_pairs.py      # writes data/skill_relations/reference_pairs_v1.csv
"""
import argparse
import os
import random
import sys
from collections import Counter

import numpy as np
import pandas as pd

sys.path.append(".")

TRAIN_CSV = "data/skill_relations/pairs_esco_onet_v1.csv"
OUT = "data/skill_relations/reference_pairs_v1.csv"
SEED = 42
MAX_PER_SKILL = 3
# (band name, lowest cosine, highest cosine, pairs wanted); rarest bands first so the per-skill cap doesn't starve them
BANDS = [
    ("0.85+", 0.85, 1.01, 40),
    ("0.75-0.85", 0.75, 0.85, 100),
    ("0.65-0.75", 0.65, 0.75, 120),
    ("0.55-0.65", 0.55, 0.65, 100),
    ("<0.55", -1.0, 0.55, 40),
]
JUDGE_COLUMNS = ["label_claude", "label_gpt_oss", "label_qwen", "author_check"]


def sample_pairs(mod_names, mod_keys, job_names, job_keys, sims, seed=SEED):
    """Pick pairs per band from a cosine matrix (rows = module skills, cols = job skills).
    Returns (rows, band_population). Kept separate from the database part so it can be tested on its own."""
    rng = random.Random(seed)
    valid = np.array(mod_keys)[:, None] != np.array(job_keys)[None, :]      # same A8 skill: A8 decides, skip
    used = Counter()
    rows, population = [], {}
    for band, lo, hi, want in BANDS:
        in_band = valid & (sims >= lo) & (sims < hi)
        population[band] = int(in_band.sum())
        cells = np.argwhere(in_band)                                       # (row, col), in a fixed order
        order = np.random.default_rng(seed).permutation(len(cells))        # random order, same every run
        got = 0
        for i, j in cells[order]:
            if got >= want:
                break
            a, b = mod_names[i], job_names[j]
            if used[("a", mod_keys[i])] >= MAX_PER_SKILL or used[("b", job_keys[j])] >= MAX_PER_SKILL:
                continue
            used[("a", mod_keys[i])] += 1
            used[("b", job_keys[j])] += 1
            rows.append({"a": a, "b": b, "cosine": round(float(sims[i, j]), 3), "band": band})
            got += 1
    rng.shuffle(rows)
    return rows, population


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()

    from app.database import SessionLocal
    from app.models.job import Job, JobSkill
    from app.models.module import ModuleSkill
    from app.nlp.embedder import get_embedder
    from app.services.skill_names import canonical_key
    from app.services.skill_profile import normalise_rows

    # Skills the model has seen in training, as A8 keys ("Python programming" and "Python" are one)
    train = pd.read_csv(TRAIN_CSV)
    seen = {canonical_key(n) for n in pd.concat([train.a, train.b]).astype(str)}

    db = SessionLocal()
    try:
        modules, jobs, job_source = {}, {}, {}
        for (name,) in db.query(ModuleSkill.skill_name):
            key = canonical_key(name)
            if key and key not in seen:
                modules.setdefault(key, name.strip())
        for name, source in db.query(JobSkill.skill_name, Job.source).join(Job, Job.id == JobSkill.job_id):
            key = canonical_key(name)
            if key and key not in seen:
                jobs.setdefault(key, name.strip())
                job_source.setdefault(key, set()).add("live" if source == "live" else "2024")
    finally:
        db.close()

    # sorted: the same order on every run, so the seed gives the same sample
    mod_keys = sorted(modules)
    job_keys = sorted(jobs)
    mod_names = [modules[k] for k in mod_keys]
    job_names = [jobs[k] for k in job_keys]
    print(f"Module skills {len(mod_names)}, job skills {len(job_names)} "
          f"(after leaving out skills seen in training: {len(seen)} keys)")

    embedder = get_embedder()
    m = normalise_rows(embedder.embed_cached(mod_names)).astype(np.float32)
    j = normalise_rows(embedder.embed_cached(job_names)).astype(np.float32)
    sims = m @ j.T

    rows, population = sample_pairs(mod_names, mod_keys, job_names, job_keys, sims)
    key_of_job = dict(zip(job_names, job_keys))
    for r in rows:
        r["band_population"] = population[r["band"]]
        r["job_source"] = "+".join(sorted(job_source[key_of_job[r["b"]]]))
        for c in JUDGE_COLUMNS:
            r[c] = ""
    df = pd.DataFrame(rows)
    df.insert(0, "id", range(1, len(df) + 1))
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    df.to_csv(args.out, index=False, encoding="utf-8")

    print(f"\nWrote {len(df)} pairs to {args.out}")
    print(f"{'band':<10} {'picked':>7} {'wanted':>7} {'population':>11}")
    for band, _, _, want in BANDS:
        print(f"{band:<10} {int((df.band == band).sum()):>7} {want:>7} {population[band]:>11,}")
    print("\nExamples:")
    for band, *_ in BANDS:
        ex = df[df.band == band].head(3)
        print(f"  {band:<10} " + " | ".join(f"{a} -> {b}" for a, b in zip(ex.a, ex.b)))


if __name__ == "__main__":
    main()
