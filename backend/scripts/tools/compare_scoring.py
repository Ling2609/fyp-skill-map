"""
Step 2 research (read-only): how does the student's coverage change under different rules for
"which matched skills count"? Nothing in the app changes. Result (30 Sep): the app uses A since step 2.

  now      : every job skill with best similarity >= 0.6 counts fully (the app before step 2)
  A        : only Direct counts. Direct = same skill (A8 canonical key) or SBERT >= 0.8  (the app since step 2)
  A-strict : only the same skill (A8 canonical key) counts
  B        : Direct counts 1, Related (0.6-0.79) counts 0.5
Sensitivity: Related credit 0 / 0.25 / 0.33 / 0.5 / 1, with openings at >= 30 / 40 / 50% coverage.
Also writes ../docs/evidence/step2_related_sample.csv: 60 random Related pairs and 30 SBERT >= 0.8 pairs
(student skill -> job skill), to label "does the student really have the job's skill?".

Usage (from backend/, venv active):
  python scripts/tools/compare_scoring.py <username or email> [--top 15]
"""
import csv
import random
import sys

import numpy as np

sys.path.append(".")

from app.database import SessionLocal
from app.models.user import User
from app.nlp.embedder import get_embedder
from app.routers import recommend
from app.services.skill_profile import (
    MATCH_THRESHOLD, RELATED_THRESHOLD, build_skill_profile, normalise_rows, profile_spellings,
)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        return
    top = int(sys.argv[sys.argv.index("--top") + 1]) if "--top" in sys.argv else 15
    db = SessionLocal()
    try:
        who = args[0].strip().lower()
        user = db.query(User).filter((User.username == who) | (User.email == who)).first()
        if not user:
            print("User not found")
            return
        profile = build_skill_profile(user.id, db)
        spellings, keys, _ = profile_spellings(profile)
        vecs = normalise_rows(get_embedder().embed_cached(spellings))
        key_set = set(keys)
        recommend.build_job_cache()

        rows, kinds = [], {"same key": 0, "sbert >= 0.8": 0, "0.6-0.79": 0}
        counts = []              # (direct, related, N) per job
        pairs = {"related": [], "sbert >= 0.8": []}
        for c in recommend._job_cache.values():
            if c.get("source") != "live" or not c["skills"]:
                continue
            sims = c["skill_vecs"] @ vecs.T
            best, arg = sims.max(axis=1), sims.argmax(axis=1)
            same = np.array([k in key_set for k in c["skill_keys"]])
            direct = same | (best >= MATCH_THRESHOLD)
            related = ~direct & (best >= RELATED_THRESHOLD)
            n = len(c["skills"])
            counts.append((int(direct.sum()), int(related.sum()), n))
            for j in range(n):
                kind = "related" if related[j] else "sbert >= 0.8" if direct[j] and not same[j] else None
                if kind:
                    pairs[kind].append((spellings[arg[j]], c["skills"][j], round(float(best[j]), 3), c["job_title"][:60]))
            kinds["same key"] += int(same.sum())
            kinds["sbert >= 0.8"] += int((direct & ~same).sum())
            kinds["0.6-0.79"] += int(related.sum())
            rows.append((c["job_title"][:44], n, int((direct | related).sum()), int(direct.sum()),
                         int(same.sum()), direct.sum() + 0.5 * related.sum()))

        def pct(x, n):
            return f"{round(100 * x / n):>4}%"

        rows.sort(key=lambda r: -r[2] / r[1])
        print(f"{user.username}: {len(profile)} skills, {len(rows)} live jobs\n")
        print(f"{'job (sorted by current coverage)':<45} {'N':>3} {'now':>6} {'A':>6} {'A-strict':>9} {'B':>6}")
        for title, n, now, a, strict, b in rows[:top]:
            print(f"{title:<45} {n:>3} {pct(now, n)} {pct(a, n)} {pct(strict, n):>9} {pct(b, n)}")

        print("\nAcross all live jobs:")
        for label, i in (("now", 2), ("A", 3), ("A-strict", 4), ("B", 5)):
            cov = [r[i] / r[1] for r in rows]
            print(f"  {label:<9} average coverage {round(100 * np.mean(cov)):>3}%   jobs at >= 50% "
                  f"(Dashboard 'openings you align with'): {sum(x >= 0.5 for x in cov)}")
        print("\nSensitivity: live jobs at or above each coverage, by credit for a Related skill")
        print(f"  {'related credit':<15} {'avg':>5} {'>= 30%':>7} {'>= 40%':>7} {'>= 50%':>7}")
        for credit in (0, 0.25, 0.33, 0.5, 1):
            cov = [(d + credit * r) / n for d, r, n in counts]
            print(f"  {credit:<15} {round(100 * np.mean(cov)):>4}% " +
                  " ".join(f"{sum(x >= t for x in cov):>7}" for t in (0.3, 0.4, 0.5)))

        rng = random.Random(42)
        sample = [("related", *p) for p in rng.sample(pairs["related"], min(60, len(pairs["related"])))]
        sample += [("sbert >= 0.8", *p) for p in rng.sample(pairs["sbert >= 0.8"], min(30, len(pairs["sbert >= 0.8"])))]
        rng.shuffle(sample)     # so the labeller can't tell the group from the order
        out = "../docs/evidence/step2_related_sample.csv"
        with open(out, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(["student skill", "job skill", "has the job skill? (y / partly / n)", "similarity", "group", "job"])
            for group, a, b, sim, job in sample:
                w.writerow([a, b, "", sim, group, job])
        print(f"\n{len(sample)} pairs written to {out} for labelling")

        total = sum(kinds.values())
        print(f"\nWhy job skills counted as matched now ({total} in total):")
        for k, v in kinds.items():
            print(f"  {k:<13} {v:>5} ({round(100 * v / total)}%)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
