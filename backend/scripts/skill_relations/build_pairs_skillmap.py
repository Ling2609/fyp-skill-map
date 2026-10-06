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

Training set v3, run 5 (--targeted, 6 Oct): the error analysis of run 4 on both blind sets found two kinds of
mistake (references.md, "Run 4 error analysis"), so v3 adds about 400 pairs aimed at exactly those:
  extend    one name is the other plus 1-3 words ("Subnetting" / "IP Subnetting", "Project Management" /
            "Project Management Methodology"): the model MISSED these (said "not the same" when the judges said
            the shorter one covers the longer, or the reverse)
  sibling   same topic, different activity word ("Requirements Elicitation" / "Requirements Documentation",
            "Microservices Design" / "Microservices Implementation"): the model wrongly said "has it"
No SBERT bands here: the pairs are picked by their words, cosine is only saved for the report.
Left out: every skill of BOTH blind sets (reference_pairs_v1 and _v2: the cut-off is chosen on them, so they must
stay unseen) and every pair already in the v2 candidates.
  python scripts/skill_relations/build_pairs_skillmap.py --targeted   # -> .../pairs_skillmap_v3_candidates.csv
"""
import argparse
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


# Run 5 (--targeted)
REFERENCE_CSVS = ["data/skill_relations/reference_pairs_v1.csv", "data/skill_relations/reference_pairs_v2.csv"]
V2_CANDIDATES = OUT
OUT_V3 = "data/skill_relations/pairs_skillmap_v3_candidates.csv"
TARGET_V3 = {"extend": 200, "sibling": 200}          # 400 pairs -> 800 rows to label
MAX_PER_SKILL_V3 = 3
MAX_EXTRA_WORDS = 3
# Words that name WHAT is done with a topic, not the topic itself (the sibling error: same topic, other activity)
ACTIVITY = {"administration", "analysis", "analytics", "architecture", "automation", "configuration", "debugging",
            "deployment", "design", "development", "documentation", "elicitation", "engineering", "estimation",
            "gathering", "governance", "implementation", "installation", "integration", "maintenance", "management",
            "migration", "modeling", "modelling", "monitoring", "operations", "optimisation", "optimization",
            "planning", "programming", "reporting", "review", "scripting", "security", "specification", "strategy",
            "support", "testing", "training", "troubleshooting", "tuning", "validation", "visualisation",
            "visualization"}
# Too vague to be a skill on their own: a short name made only of these ("Systems", "Software") teaches nothing
GENERIC = {"software", "systems", "system", "network", "networks", "it", "ict", "technology", "technologies",
           "technical", "computer", "computing", "tools", "tool", "applications", "application", "coordination",
           "solutions", "infrastructure", "data", "digital", "business", "practices", "skills", "basics"}


def tokens(name: str) -> tuple[str, ...]:
    """All words of a name, in order and lower case ("CI/CD Pipeline" -> ci, cd, pipeline)."""
    return tuple(re.findall(r"[a-z0-9+#]+", name.lower()))


def extend_pairs(names: list[str]) -> list[tuple[int, int]]:
    """(short, long) index pairs where the long name is the short one plus 1-MAX_EXTRA_WORDS words, the short
    name's words appearing together and in order ("Subnetting" in "IP Subnetting"). At least one added word must
    say something (not only "skills", "and", ...), and the short name must hold a topic word: not only an activity
or vague word ("Reporting", "Systems"). Pure: names in, pairs out."""
    toks = [tokens(n) for n in names]
    grams = {}                                            # every run of consecutive words -> names containing it
    for j, t in enumerate(toks):
        for size in range(1, len(t)):
            for start in range(len(t) - size + 1):
                grams.setdefault(t[start:start + size], set()).add(j)
    out = set()
    for i, t in enumerate(toks):
        if len("".join(t)) < 2 or all(w in STOP or w in ACTIVITY or w in GENERIC for w in t):
            continue
        for j in grams.get(t, ()):
            extra = len(toks[j]) - len(t)
            if j == i or not 1 <= extra <= MAX_EXTRA_WORDS:
                continue
            added = list(toks[j])
            for w in t:
                added.remove(w)
            if any(w not in STOP for w in added):
                out.add((i, j))
    return sorted(out)


def sibling_pairs(names: list[str]) -> tuple[list[tuple[int, int]], list[tuple[int, int]]]:
    """Same-length names (2+ words) that differ in exactly one word, where the shared words hold a real topic
    word. Returns (strict, loose): strict = both differing words are activity words ("Microservices design" /
    "Microservices implementation"), loose = only one is. Pairs where neither is an activity word ("Network
    Switches" / "Network Routers") are the v2 "overlap" kind and are left out. Pure."""
    toks = [tokens(n) for n in names]
    groups = {}
    for i, t in enumerate(toks):
        if len(t) < 2:
            continue
        for p in range(len(t)):
            groups.setdefault((len(t), p, t[:p] + t[p + 1:]), []).append(i)
    strict, loose = set(), set()
    for (_, p, shared), members in groups.items():
        if not any(w not in STOP and w not in ACTIVITY for w in shared):
            continue
        for x in range(len(members)):
            for y in range(x + 1, len(members)):
                i, j = sorted((members[x], members[y]))
                wi, wj = toks[i][p], toks[j][p]
                if wi == wj:
                    continue
                n_act = (wi in ACTIVITY) + (wj in ACTIVITY)
                if n_act == 2:
                    strict.add((i, j))
                elif n_act == 1:
                    loose.add((i, j))
    return sorted(strict), sorted(loose)


def pick_targeted(names, keys, skip_pairs, seed=SEED, target=None):
    """Choose the extend and sibling pairs: at most MAX_PER_SKILL_V3 pairs per skill, never two names of one A8
    skill, never a pair in skip_pairs (A8 key pairs, either order). Sibling takes strict pairs first. Pure."""
    target = target or TARGET_V3
    rng, used, seen, out = random.Random(seed), Counter(), set(), []

    def take(cells, want, kind):
        cells = list(cells)
        rng.shuffle(cells)
        got = 0
        for i, j in cells:
            if got >= want:
                break
            ki, kj = keys[i], keys[j]
            pair = frozenset((ki, kj))
            if ki == kj or pair in seen or pair in skip_pairs or used[ki] >= MAX_PER_SKILL_V3 \
                    or used[kj] >= MAX_PER_SKILL_V3:
                continue
            seen.add(pair)
            used[ki] += 1
            used[kj] += 1
            out.append((i, j, kind))
            got += 1
        return got

    got = {"extend": take(extend_pairs(names), target["extend"], "extend")}
    strict, loose = sibling_pairs(names)
    got["sibling"] = take(strict, target["sibling"], "sibling")
    got["sibling"] += take(loose, target["sibling"] - got["sibling"], "sibling")
    return out, got


def both_orders(out, rng):
    """Each pair as A -> B and B -> A, shuffled so a judge never sees the two orders of one pair next to each other."""
    rows = []
    for r in out:
        rows.append({**r, "order": "ab"})
        rows.append({**r, "a": r["b"], "b": r["a"], "order": "ba"})
    rng.shuffle(rows)
    df = pd.DataFrame(rows)
    df.insert(0, "id", range(1, len(df) + 1))
    return df


def load_job_skill_names(test_keys: set[str]) -> tuple[list[str], list[str]]:
    """One name per A8 skill (its most common spelling) among job skills named in >= MIN_ADS ads, test-set skills
    left out. Returns (keys, names), sorted by key so the seed gives the same pick on every run."""
    from app.database import SessionLocal
    from app.models.job import JobSkill
    from app.services.skill_names import canonical_key

    db = SessionLocal()
    try:
        counts = Counter(n.strip() for (n,) in db.query(JobSkill.skill_name) if n and n.strip())
    finally:
        db.close()
    by_key, uses = {}, Counter()
    for name, n in counts.most_common():
        k = canonical_key(name)
        uses[k] += n                                     # rows in job_skills ~ ads naming the skill
        if k and k not in test_keys and k not in by_key:
            by_key[k] = name
    by_key = {k: v for k, v in by_key.items() if uses[k] >= MIN_ADS}
    keys = sorted(by_key)
    return keys, [by_key[k] for k in keys]


def main_targeted():
    from app.nlp.embedder import get_embedder
    from app.services.skill_names import canonical_key
    from app.services.skill_profile import normalise_rows

    if os.path.exists(OUT_V3):
        raise SystemExit(f"{OUT_V3} already exists: delete it first if you really want new pairs (labels may refer to it)")
    ref = pd.concat([pd.read_csv(f) for f in REFERENCE_CSVS])
    test_keys = {canonical_key(n) for n in pd.concat([ref.a, ref.b]).astype(str)}
    v2 = pd.read_csv(V2_CANDIDATES)
    skip = {frozenset((canonical_key(a), canonical_key(b))) for a, b in zip(v2.a.astype(str), v2.b.astype(str))}

    keys, names = load_job_skill_names(test_keys)
    print(f"Job skills named in >= {MIN_ADS} ads: {len(names)} (skills of both blind sets left out: "
          f"{len(test_keys)} keys; v2 pairs left out: {len(skip)})")
    picked, got = pick_targeted(names, keys, skip)

    # cosine only for the report (and to compare with the v2 kinds later), not used to choose
    vecs = normalise_rows(get_embedder().embed_cached(names)).astype(np.float32)
    out = [{"pair": n + 1, "a": names[i], "b": names[j], "kind": kind,
            "cosine": round(float(vecs[i] @ vecs[j]), 3)} for n, (i, j, kind) in enumerate(picked)]
    df = both_orders(out, random.Random(SEED))
    df.to_csv(OUT_V3, index=False, encoding="utf-8")
    print(f"Pairs picked: {got} (wanted {TARGET_V3}) = {len(out)} pairs, {len(df)} rows to label (both orders)")
    for kind in TARGET_V3:
        part = df[(df.kind == kind) & (df.order == "ab")]
        print(f"  {kind:<8} median cosine {part.cosine.median():.2f}; e.g. "
              + " | ".join(f"{a} -> {b}" for a, b in zip(part.a.head(4), part.b.head(4))))
    print(f"Wrote {OUT_V3}")


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
    ap = argparse.ArgumentParser()
    ap.add_argument("--targeted", action="store_true", help="run 5: extend + sibling pairs -> pairs_skillmap_v3_candidates.csv")
    if ap.parse_args().targeted:
        main_targeted()
    else:
        main()
