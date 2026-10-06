"""
Merge the three judges' labels into the reference set (Stage 2B) and measure how much they agree.

Reads data/skill_relations/reference_labels/label_<judge>.csv for claude, gpt_oss and qwen, and fills the judge
columns of reference_pairs_v1.csv. Each 5-way label is also mapped to the model's 3 classes
(SATISFIES = SAME + NARROWER, RELATED = RELATED + BROADER, NOT = DIFFERENT; BROADER moved from NOT to RELATED on
2 Oct, references.md "Where BROADER belongs", the same mapping as training set v2), and two columns are added:
  label3_unanimous  the class when all three judges agree on it (the high-confidence test set), else empty
  label3_majority   the class at least two judges give (a bigger, noisier test set), else empty
Agreement is reported as Fleiss' kappa (3 judges) and Cohen's kappa per pair of judges: agreement beyond chance.

It also draws the author's spot-check: SPOT_CHECK unanimous pairs at random (fixed seed), written to
reference_spotcheck.csv with an empty column to fill in: agree / disagree / unsure. Existing answers are kept.

Usage (from backend/, venv active):
  python scripts/skill_relations/merge_reference_labels.py              # first test set (reference_pairs_v1)
  python scripts/skill_relations/merge_reference_labels.py --set v2     # fresh test set (reference_pairs_v2)
  python scripts/skill_relations/merge_reference_labels.py --set v3     # run-5 test set (reference_pairs_v3)
"""
import argparse
import os

import numpy as np
import pandas as pd
from sklearn.metrics import cohen_kappa_score

PAIRS_CSV = "data/skill_relations/reference_pairs_v1.csv"
LABEL_DIR = "data/skill_relations/reference_labels"
SPOT_CSV = "data/skill_relations/reference_spotcheck.csv"
JUDGES = ["claude", "gpt_oss", "qwen"]
TO_CLASS = {"SAME": "SATISFIES", "NARROWER": "SATISFIES", "RELATED": "RELATED",
            "BROADER": "RELATED", "DIFFERENT": "NOT"}
SPOT_CHECK = 50
SETS = {"v1": (PAIRS_CSV, LABEL_DIR, SPOT_CSV, 50),
        "v2": ("data/skill_relations/reference_pairs_v2.csv", "data/skill_relations/reference_labels_v2",
               "data/skill_relations/reference_spotcheck_v2.csv", 30),
        "v3": ("data/skill_relations/reference_pairs_v3.csv", "data/skill_relations/reference_labels_v3",
               "data/skill_relations/reference_spotcheck_v3.csv", 30)}
SEED = 42


def fleiss_kappa(labels: pd.DataFrame) -> float:
    """Fleiss' kappa for a table with one row per item and one column per judge (every judge labels every item)."""
    cats = sorted(set(labels.values.ravel()))
    n = labels.shape[1]
    counts = np.array([[(row == c).sum() for c in cats] for row in labels.values])   # items x categories
    p_item = (counts * (counts - 1)).sum(axis=1) / (n * (n - 1))                        # agreement per item
    p_cat = counts.sum(axis=0) / counts.sum()                                           # share of each category
    expected = (p_cat ** 2).sum()
    return (p_item.mean() - expected) / (1 - expected)


def majority(row) -> str:
    top = row.value_counts()
    return top.index[0] if top.iloc[0] >= 2 else ""


def main():
    global PAIRS_CSV, LABEL_DIR, SPOT_CSV, SPOT_CHECK
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", choices=sorted(SETS), default="v1")
    PAIRS_CSV, LABEL_DIR, SPOT_CSV, SPOT_CHECK = SETS[ap.parse_args().set]
    pairs = pd.read_csv(PAIRS_CSV)
    # the spot-check lives in its own small file; the old empty column here would only confuse
    pairs = pairs.drop(columns=["author_check", "label3_unanimous", "label3_majority"], errors="ignore")
    for j in JUDGES:
        lab = pd.read_csv(os.path.join(LABEL_DIR, f"label_{j}.csv"))[["id", f"label_{j}"]]
        if len(lab) != len(pairs) or set(lab.id) != set(pairs.id):
            raise SystemExit(f"label_{j}.csv does not cover every pair ({len(lab)} of {len(pairs)})")
        pairs = pairs.drop(columns=[f"label_{j}"], errors="ignore").merge(lab, on="id", how="left")

    five = pairs[[f"label_{j}" for j in JUDGES]]
    three = five.apply(lambda s: s.map(TO_CLASS))
    pairs["label3_unanimous"] = np.where(three.nunique(axis=1) == 1, three.iloc[:, 0], "")
    pairs["label3_majority"] = three.apply(majority, axis=1)
    pairs.to_csv(PAIRS_CSV, index=False, encoding="utf-8")

    print(f"Judges: {', '.join(JUDGES)} on {len(pairs)} pairs\n")
    print(f"Fleiss' kappa: 5 labels {fleiss_kappa(five):.2f}, 3 classes {fleiss_kappa(three):.2f}")
    for i in range(len(JUDGES)):
        for k in range(i + 1, len(JUDGES)):
            a, b = JUDGES[i], JUDGES[k]
            print(f"  Cohen's kappa {a} vs {b}: 5 labels {cohen_kappa_score(five.iloc[:, i], five.iloc[:, k]):.2f}, "
                  f"3 classes {cohen_kappa_score(three.iloc[:, i], three.iloc[:, k]):.2f}")

    unanimous = pairs[pairs.label3_unanimous != ""]
    print(f"\nUnanimous (high-confidence set): {len(unanimous)} pairs; 2-of-3 majority: "
          f"{(pairs.label3_majority != '').sum()} pairs")
    table = pd.crosstab(pairs.band, pairs.label3_unanimous.replace("", "(no agreement)"))
    print(table.reindex(["0.85+", "0.75-0.85", "0.65-0.75", "0.55-0.65", "<0.55"]).to_string())

    # Author spot-check: random unanimous pairs; keep answers already given
    old = pd.read_csv(SPOT_CSV) if os.path.exists(SPOT_CSV) else None
    if old is not None and old.author_check.notna().any():
        print(f"\n{SPOT_CSV} already has answers: left as it is")
    else:
        spot = unanimous.sample(n=min(SPOT_CHECK, len(unanimous)), random_state=SEED)
        spot = spot[["id", "a", "b", "label3_unanimous"]].rename(columns={"label3_unanimous": "judges_say"})
        spot["author_check"] = ""
        spot.sort_values("id").to_csv(SPOT_CSV, index=False, encoding="utf-8")
        print(f"\nSpot-check: {len(spot)} pairs written to {SPOT_CSV} (fill author_check: agree / disagree / unsure)")
    print(f"Saved the merged labels to {PAIRS_CSV}")


if __name__ == "__main__":
    main()
