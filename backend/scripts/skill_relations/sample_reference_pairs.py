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

Second, fresh blind test set (3 Oct): the model settings were chosen after studying errors on reference_pairs_v1,
so a confirmation needs NEW pairs. Its skills may repeat test-set skills (the model never trained on those), but
skills of every training CSV and every pair already in reference_pairs_v1 are left out:
  python scripts/skill_relations/sample_reference_pairs.py --set v2

Fourth blind set (run 6, 7 Oct): same bands, seed 13, skills of all training files (soft-label files too) and the
pairs of v1-v3 left out:
  python scripts/skill_relations/sample_reference_pairs.py --set v4

Third blind set (run 5, 6 Oct): the p_satisfies cut-off is now chosen on v1 + v2, so the run-5 model is confirmed
on new pairs again. Same bands as v2; skills of all three training CSVs and pairs of v1 and v2 are left out:
  python scripts/skill_relations/sample_reference_pairs.py --set v3
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


# Second test set: about 150 pairs, the same bands (the 0.85+ band has few candidates left)
BANDS_V2 = [("0.85+", 0.85, 1.01, 15), ("0.75-0.85", 0.75, 0.85, 35), ("0.65-0.75", 0.65, 0.75, 45),
            ("0.55-0.65", 0.55, 0.65, 40), ("<0.55", -1.0, 0.55, 15)]
V2_OUT = "data/skill_relations/reference_pairs_v2.csv"
SETS = {"v1": dict(train=[TRAIN_CSV], bands=BANDS, seed=SEED, out=OUT, skip_pairs_of=[]),
        "v2": dict(train=[TRAIN_CSV, "data/skill_relations/pairs_skillmap_v2.csv"], bands=BANDS_V2, seed=7,
                   out=V2_OUT, skip_pairs_of=[OUT]),
        "v3": dict(train=[TRAIN_CSV, "data/skill_relations/pairs_skillmap_v2.csv",
                          "data/skill_relations/pairs_skillmap_v3.csv"], bands=BANDS_V2, seed=11,
                   out="data/skill_relations/reference_pairs_v3.csv", skip_pairs_of=[OUT, V2_OUT]),
        # Run 6 (7 Oct): v1-v3 are all spent (the cut-off is chosen on them), so a fourth fresh set. Skills of every
        # training file, the soft-label files included, are left out, and so are the pairs of v1, v2 and v3
        "v4": dict(train=[TRAIN_CSV, "data/skill_relations/pairs_skillmap_v2.csv",
                          "data/skill_relations/pairs_skillmap_v3.csv", "data/skill_relations/pairs_skillmap_v2_soft.csv",
                          "data/skill_relations/pairs_skillmap_v3_soft.csv"], bands=BANDS_V2, seed=13,
                   out="data/skill_relations/reference_pairs_v4.csv",
                   skip_pairs_of=[OUT, V2_OUT, "data/skill_relations/reference_pairs_v3.csv"])}


def sample_pairs(mod_names, mod_keys, job_names, job_keys, sims, seed=SEED, bands=BANDS, skip=frozenset()):
    """Pick pairs per band from a cosine matrix (rows = module skills, cols = job skills).
    Returns (rows, band_population). Kept separate from the database part so it can be tested on its own.
    skip: (module key, job key) pairs that must not be picked (pairs of an earlier test set)."""
    rng = random.Random(seed)
    valid = np.array(mod_keys)[:, None] != np.array(job_keys)[None, :]      # same A8 skill: A8 decides, skip
    row_of, col_of = {k: i for i, k in enumerate(mod_keys)}, {k: j for j, k in enumerate(job_keys)}
    for mk, jk in skip:
        if mk in row_of and jk in col_of:
            valid[row_of[mk], col_of[jk]] = False
    used = Counter()
    rows, population = [], {}
    for band, lo, hi, want in bands:
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
    ap.add_argument("--set", choices=sorted(SETS), default="v1", help="v1 = the first test set, v2-v4 = fresh ones")
    ap.add_argument("--out", help="output CSV (default depends on --set)")
    args = ap.parse_args()
    cfg = SETS[args.set]
    out = args.out or cfg["out"]

    from app.database import SessionLocal
    from app.models.job import Job, JobSkill
    from app.models.module import ModuleSkill
    from app.nlp.embedder import get_embedder
    from app.services.skill_names import canonical_key
    from app.services.skill_profile import normalise_rows

    # Skills the model has seen in training, as A8 keys ("Python programming" and "Python" are one)
    train = pd.concat([pd.read_csv(f) for f in cfg["train"]])
    seen = {canonical_key(n) for n in pd.concat([train.a, train.b]).astype(str)}
    skip = set()
    for path in cfg["skip_pairs_of"]:            # pairs of earlier test sets are never picked again
        old = pd.read_csv(path)
        skip |= {(canonical_key(a), canonical_key(b)) for a, b in zip(old.a.astype(str), old.b.astype(str))}

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

    rows, population = sample_pairs(mod_names, mod_keys, job_names, job_keys, sims, seed=cfg["seed"],
                                    bands=cfg["bands"], skip=frozenset(skip))
    key_of_job = dict(zip(job_names, job_keys))
    for r in rows:
        r["band_population"] = population[r["band"]]
        r["job_source"] = "+".join(sorted(job_source[key_of_job[r["b"]]]))
        for c in JUDGE_COLUMNS:
            r[c] = ""
    df = pd.DataFrame(rows)
    df.insert(0, "id", range(1, len(df) + 1))
    if os.path.exists(out):
        raise SystemExit(f"{out} already exists: delete it first if you really want a new sample (labels may refer to it)")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    df.to_csv(out, index=False, encoding="utf-8")

    print(f"\nWrote {len(df)} pairs to {out}" + (f" ({len(skip)} pairs of earlier test sets left out)" if skip else ""))
    print(f"{'band':<10} {'picked':>7} {'wanted':>7} {'population':>11}")
    for band, _, _, want in cfg["bands"]:
        print(f"{band:<10} {int((df.band == band).sum()):>7} {want:>7} {population[band]:>11,}")
    print("\nExamples:")
    for band, *_ in cfg["bands"]:
        ex = df[df.band == band].head(3)
        print(f"  {band:<10} " + " | ".join(f"{a} -> {b}" for a, b in zip(ex.a, ex.b)))


if __name__ == "__main__":
    main()
