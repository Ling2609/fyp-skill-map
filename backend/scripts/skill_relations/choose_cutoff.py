"""
Choose a model's p_satisfies cut-off on the spent test sets (v1, v2, v3) BEFORE it sees the fresh one (run 6, 7 Oct).

Soft labels and seed averaging change how confident the model is (fewer 0.99s), so run 4's cut-off of 0.8 may not
suit a run-6 model. Picking the cut-off on sets already used for earlier decisions, and only then testing on a
fresh blind set, keeps the final test honest (the same rule as the pass rule, fixed before the data exists).

For each cut-off from 0.50 to 0.95 it prints the population-weighted "has it" precision / recall / F1 on each set
(majority labels, the same measure as the pass rule) and picks the cut-off with the best mean F1 over the sets.
Soft-label training files leave out every skill of v1-v3 (merge_training_labels.py --soft), so these sets stay
unseen by the model.

Usage (from backend/, venv active):
  python scripts/skill_relations/choose_cutoff.py --model data/relation_model_<run6a>
Then:  evaluate_reference.py --set v4 --model <run6> --cutoff <chosen> --baseline <run 4 folder>
"""
import argparse
import os
import sys

import numpy as np
import pandas as pd

sys.path.append(".")
sys.path.append(os.path.dirname(__file__))
from evaluate_reference import SETS, model_predict, weighted_has  # noqa: E402

SPENT = ["v1", "v2", "v3"]
CUTOFFS = [round(c, 2) for c in np.arange(0.50, 0.951, 0.05)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, help="model folder (one model or seed_*/ folders)")
    args = ap.parse_args()
    sets = {}
    for name in SPENT:
        df = pd.read_csv(SETS[name])
        df = df[df.label3_majority.notna() & (df.label3_majority != "")].reset_index(drop=True)
        _, p = model_predict(df.a.astype(str).tolist(), df.b.astype(str).tolist(), args.model)
        df["p_satisfies"] = p[:, 0]
        sets[name] = df
        print(f"{name}: {len(df)} pairs with a majority label")

    print(f"\n{'cut-off':>7}  " + "  ".join(f"{n + ' P / R / F1':>20}" for n in SPENT) + f"  {'mean F1':>8}")
    best = (-1, None)
    for c in CUTOFFS:
        cells, f1s = [], []
        for name in SPENT:
            df = sets[name]
            r = weighted_has(df, "label3_majority", df.p_satisfies >= c)
            cells.append(f"{r['precision']:.2f} / {r['recall']:.2f} / {r['f1']:.2f}")
            f1s.append(r["f1"])
        mean = float(np.mean(f1s))
        print(f"{c:>7}  " + "  ".join(f"{x:>20}" for x in cells) + f"  {mean:>8.3f}")
        if mean > best[0]:
            best = (mean, c)
    print(f"\nChosen cut-off: {best[1]} (mean weighted F1 {best[0]:.3f} over {', '.join(SPENT)}). "
          f"Use it for the v4 test: --cutoff {best[1]}")


if __name__ == "__main__":
    main()
