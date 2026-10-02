"""
Training set v2 for the skill relationship model: candidate pairs built from SkillMap's OWN skill names, to fix the
two reasons v1 failed on real pairs (references.md, "Training set v2 design"): ESCO wording (domain shift) and easy
negatives. This script only picks the pairs; labels come next from two LLM judges (judge_reference_pairs.py with
--pairs), and merge_training_labels.py keeps the pairs both judges agree on.

Kinds of pair (each later asked in both orders, A -> B and B -> A, so the label shows direction):
  close     SBERT cosine 0.55-0.95: where cosine is unsure and the model must decide
  overlap   pairs that share a content word but are not the same skill ("Backlog management" / "Log management"):
            hard negatives, the v1 model's main error (Karpukhin et al. 2020 pick negatives by word overlap)
  far       cosine < 0.4: easy negatives, a small share so the model still sees clear "no"s
  abbrev    the abbreviation merges in skill_merge_overrides.json ("RAG" / "Retrieval-Augmented Generation")
Left out: every skill of the 400 reference pairs (the test must stay unseen, Levy et al. 2015) and pairs that are
already the same A8 skill (A8 decides those first in the app), except the abbreviation pairs, which teach SAME.
A skill appears in at most MAX_PER_SKILL pairs.

Usage (from backend/, venv active):
  python scripts/skill_relations/build_pairs_skillmap.py   # -> data/skill_relations/pairs_skillmap_v2_candidates.csv
"""
import json
import os
import random
import re
import sys
from collections import Counter

import numpy as np
import pandas as pd

sys.path.append(".")

REFERENCE_CSV = "data/skill_relations/reference_pairs_v1.csv"
OVERRIDES = "data/skill_merge_overrides.json"
OUT = "data/skill_relations/pairs_skillmap_v2_candidates.csv"
SEED = 42
MAX_PER_SKILL = 4
MIN_ADS = 2              # skills named in at least 2 ads: common wording, and a 2,000-3,000 x same table fits in memory
TARGET = {"close": 650, "overlap": 350, "far": 100, "abbrev": 100}   # 1,200 pairs -> 2,400 rows to label
STOP = {"and", "of", "the", "for", "in", "on", "to", "a", "an", "with", "skills", "skill", "management",
        "development", "system", "systems", "design", "engineering", "knowledge", "experience", "&"}


def words(name: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9+#]+", name.lower()) if w not in STOP and len(w) > 1}


def pick(cells, want, used, keys, rng, kind, names, sims, out, seen):
    """Take up to `want` (i, j) cells in random order, at most MAX_PER_SKILL pairs per skill, each pair once."""
    cells = list(cells)
    rng.shuffle(cells)
    got = 0
    for i, j in cells:
        if got >= want:
            break
        if used[keys[i]] >= MAX_PER_SKILL or used[keys[j]] >= MAX_PER_SKILL or frozenset((i, j)) in seen:
            continue
        seen.add(frozenset((i, j)))
        used[keys[i]] += 1
        used[keys[j]] += 1
        out.append({"pair": len(out) + 1, "a": names[i], "b": names[j], "kind": kind,
                    "cosine": round(float(sims[i, j]), 3)})
        got += 1
    return got


def main():
    from app.database import SessionLocal
    from app.models.job import JobSkill
    from app.nlp.embedder import get_embedder
    from app.services.skill_names import canonical_key
    from app.services.skill_profile import normalise_rows

    ref = pd.read_csv(REFERENCE_CSV)
    test_keys = {canonical_key(n) for n in pd.concat([ref.a, ref.b]).astype(str)}

    db = SessionLocal()
    try:
        counts = Counter(n.strip() for (n,) in db.query(JobSkill.skill_name) if n and n.strip())
    finally:
        db.close()
    by_key, uses = {}, Counter()
    for name, n in counts.most_common():                 # one name per A8 skill: its most common spelling
        k = canonical_key(name)
        uses[k] += n                                     # rows in job_skills ~ ads naming the skill
        if k and k not in test_keys and k not in by_key:
            by_key[k] = name
    by_key = {k: v for k, v in by_key.items() if uses[k] >= MIN_ADS}
    keys = sorted(by_key)
    names = [by_key[k] for k in keys]
    print(f"Job skills named in >= {MIN_ADS} ads: {len(names)} (reference-set skills left out: {len(test_keys)} keys)")

    vecs = normalise_rows(get_embedder().embed_cached(names)).astype(np.float32)
    sims = vecs @ vecs.T
    upper = np.triu(np.ones_like(sims, dtype=bool), k=1)   # each unordered pair once, no self-pairs
    rng, used, out, seen = random.Random(SEED), Counter(), [], set()

    got = {"close": pick(map(tuple, np.argwhere(upper & (sims >= 0.55) & (sims < 0.95))), TARGET["close"],
                         used, keys, rng, "close", names, sims, out, seen)}

    word_sets = [words(n) for n in names]
    index = {}
    for i, ws in enumerate(word_sets):
        for w in ws:
            index.setdefault(w, []).append(i)
    overlap = set()
    for members in index.values():
        if len(members) > 300:                            # very common words ("data", "cloud") say little
            members = rng.sample(members, 300)
        for x in range(len(members)):
            for y in range(x + 1, min(len(members), x + 6)):
                i, j = sorted((members[x], members[y]))
                if sims[i, j] < 0.95:
                    overlap.add((i, j))
    got["overlap"] = pick(sorted(overlap), TARGET["overlap"], used, keys, rng, "overlap", names, sims, out, seen)

    far = [(rng.randrange(len(names)), rng.randrange(len(names))) for _ in range(20000)]
    far = sorted({(min(i, j), max(i, j)) for i, j in far if i != j and sims[i, j] < 0.4})
    got["far"] = pick(far, TARGET["far"], used, keys, rng, "far", names, sims, out, seen)

    # abbreviation pairs: both spellings as given (they share one A8 key now, which is why they teach SAME)
    abbrev = [(a, b) for a, b in json.load(open(OVERRIDES, encoding="utf-8")).get("same", [])
              if canonical_key(a) not in test_keys and canonical_key(b) not in test_keys]
    rng.shuffle(abbrev)
    for a, b in abbrev[:TARGET["abbrev"]]:
        e = get_embedder().embed_cached([a, b])
        cos = float(np.dot(e[0], e[1]) / (np.linalg.norm(e[0]) * np.linalg.norm(e[1]) + 1e-8))
        out.append({"pair": len(out) + 1, "a": a, "b": b, "kind": "abbrev", "cosine": round(cos, 3)})
    got["abbrev"] = min(len(abbrev), TARGET["abbrev"])

    # both orders, shuffled so a judge never sees the two orders of one pair next to each other
    rows = []
    for r in out:
        rows.append({**r, "order": "ab"})
        rows.append({**r, "a": r["b"], "b": r["a"], "order": "ba"})
    rng.shuffle(rows)
    df = pd.DataFrame(rows)
    df.insert(0, "id", range(1, len(df) + 1))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False, encoding="utf-8")
    print(f"Pairs picked: {got} = {len(out)} pairs, {len(df)} rows to label (both orders)")
    for kind in TARGET:
        ex = df[(df.kind == kind) & (df.order == "ab")].head(3)
        print(f"  {kind:<8} " + " | ".join(f"{a} -> {b}" for a, b in zip(ex.a, ex.b)))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
