"""
Training set v2: turn the two judges' labels on pairs_skillmap_v2_candidates.csv into a training CSV for the Colab
notebook (same columns as pairs_esco_onet_v1.csv: a, b, label5, source, split, label3).

A pair is kept only if
  1. both judges (gpt-oss, Qwen) gave the same 5-way label, in BOTH orders, and
  2. the two orders mirror each other, as the label guide requires: SAME <-> SAME, NARROWER <-> BROADER,
     RELATED <-> RELATED, DIFFERENT <-> DIFFERENT (a pair labelled NARROWER both ways is inconsistent).
The 5 labels map to the 3 training classes with BROADER in RELATED (decided 2 Oct, references.md "Where BROADER
belongs"): SATISFIES = SAME + NARROWER, RELATED = RELATED + BROADER, NOT = DIFFERENT.
Both orders of a kept pair go into training (they teach direction), always in the same split: split by skill
like v1 (Levy et al. 2015), following one fixed side. The final test is the reference set, never used here.

Works on partial labels too (only rows both judges have answered), so it can be tried before labelling ends.

Two checks stop the script with an error instead of writing a bad file: a label file with duplicate or unknown ids,
and any training pair that contains a skill of the 400 reference pairs (the test set must stay unseen; the
candidates were built without them, this checks it again on the final output).

Usage (from backend/, venv active):
  python scripts/skill_relations/merge_training_labels.py      # -> data/skill_relations/pairs_skillmap_v2.csv
"""
import hashlib
import os
import sys

import pandas as pd

sys.path.append(".")

CANDIDATES = "data/skill_relations/pairs_skillmap_v2_candidates.csv"
REFERENCE_CSV = "data/skill_relations/reference_pairs_v1.csv"
LABEL_DIR = "data/skill_relations/v2_labels"
OUT = "data/skill_relations/pairs_skillmap_v2.csv"
JUDGES = ["gpt_oss", "qwen"]
MIRROR = {"SAME": "SAME", "NARROWER": "BROADER", "BROADER": "NARROWER", "RELATED": "RELATED",
          "DIFFERENT": "DIFFERENT"}
TO_CLASS = {"SAME": "SATISFIES", "NARROWER": "SATISFIES", "RELATED": "RELATED", "BROADER": "RELATED",
            "DIFFERENT": "NOT"}


def split_of(key: str) -> str:
    h = int(hashlib.md5(key.lower().encode()).hexdigest(), 16) % 100
    return "train" if h < 80 else "val" if h < 90 else "test"


def main():
    cand = pd.read_csv(CANDIDATES)
    for j in JUDGES:
        lab = pd.read_csv(os.path.join(LABEL_DIR, f"label_{j}.csv"))[["id", f"label_{j}"]]
        if lab.id.duplicated().any():
            raise SystemExit(f"label_{j}.csv has duplicate ids: {sorted(lab.id[lab.id.duplicated()].unique())[:10]}")
        unknown = set(lab.id) - set(cand.id)
        if unknown:
            raise SystemExit(f"label_{j}.csv has ids that are not in the candidates: {sorted(unknown)[:10]}")
        cand = cand.merge(lab, on="id", how="left")
    both = cand.dropna(subset=[f"label_{j}" for j in JUDGES])
    print(f"Rows labelled by both judges: {len(both)} of {len(cand)}")

    agree = both[both.label_gpt_oss == both.label_qwen].rename(columns={"label_gpt_oss": "label5"})
    print(f"  judges agree on the 5-way label: {len(agree)} ({len(agree) / max(len(both), 1):.0%})")

    ab = agree[agree.order == "ab"].set_index("pair")
    ba = agree[agree.order == "ba"].set_index("pair")
    common = ab.index.intersection(ba.index)
    consistent = [p for p in common if MIRROR[ab.at[p, "label5"]] == ba.at[p, "label5"]]
    print(f"  pairs with both orders agreed: {len(common)}; of those mirror-consistent: {len(consistent)}")

    rows = []
    for p in consistent:
        a, b, kind = ab.at[p, "a"], ab.at[p, "b"], ab.at[p, "kind"]
        split = split_of(min(a, b))                       # one fixed side, so both orders share a split
        for order in (ab, ba):
            rows.append({"a": order.at[p, "a"], "b": order.at[p, "b"], "label5": order.at[p, "label5"],
                         "source": f"skillmap_{kind}", "split": split})
    df = pd.DataFrame(rows, columns=["a", "b", "label5", "source", "split"])
    df["label3"] = df.label5.map(TO_CLASS)

    from app.services.skill_names import canonical_key
    ref = pd.read_csv(REFERENCE_CSV)
    test_keys = {canonical_key(n) for n in pd.concat([ref.a, ref.b]).astype(str)}
    leaked = sorted({n for n in pd.concat([df.a, df.b]).astype(str) if canonical_key(n) in test_keys})
    if leaked:
        raise SystemExit(f"{len(leaked)} training skills are in the reference (test) set, e.g. {leaked[:10]}: "
                         "nothing written. Rebuild the candidates with build_pairs_skillmap.py")
    df.to_csv(OUT, index=False, encoding="utf-8")
    print(f"\nChecks passed: no duplicate ids, no reference-set skill in training ({len(test_keys)} keys checked)")
    print(f"Wrote {len(df)} rows ({len(df) // 2} pairs, both orders) to {OUT}")
    if len(df):
        print(pd.crosstab(df.label5, df.split, margins=True).to_string())
        print("\n3 classes:", df.label3.value_counts().to_dict())
        print("by kind:", df.source.value_counts().to_dict())


if __name__ == "__main__":
    main()
