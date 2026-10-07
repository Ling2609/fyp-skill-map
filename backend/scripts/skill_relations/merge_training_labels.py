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
and any training pair that contains a skill of the blind test sets (the test set must stay unseen; the
candidates were built without them, this checks it again on the final output).

Soft labels (--soft, run 6, 7 Oct; references.md "How to improve the relation model"): instead of keeping only the
pairs both judges agreed on in both orders (v3: 173 of 400), every pair with at least 3 of its 4 votes (2 judges x 2
orders; a "b -> a" vote is mirrored to "a -> b") is kept, and the training target is the share of votes for each
class, e.g. 3 SATISFIES + 1 RELATED = 0.75 / 0.25 / 0. Training on the vote distribution beat majority labels in
Wu et al. (2023) and Uma et al. (2021). Pairs that contain a skill of any blind test set (v1-v3) are left out, so the
cut-off can still be chosen on those sets. label5 = the most common vote (ties: the more cautious label).

Usage (from backend/, venv active):
  python scripts/skill_relations/merge_training_labels.py      # -> data/skill_relations/pairs_skillmap_v2.csv
  python scripts/skill_relations/merge_training_labels.py --set v3   # run 5: v3_labels -> pairs_skillmap_v3.csv
  python scripts/skill_relations/merge_training_labels.py --set v2 --soft   # run 6 -> pairs_skillmap_v2_soft.csv
  python scripts/skill_relations/merge_training_labels.py --set v3 --soft   # run 6 -> pairs_skillmap_v3_soft.csv

The leakage check covers the skills of BOTH blind sets (reference_pairs_v1 and _v2) for every set.
"""
import argparse
import hashlib
import os
import sys

import pandas as pd

sys.path.append(".")

D = "data/skill_relations/"
SETS = {"v2": dict(candidates=D + "pairs_skillmap_v2_candidates.csv", labels=D + "v2_labels",
                   out=D + "pairs_skillmap_v2.csv"),
        "v3": dict(candidates=D + "pairs_skillmap_v3_candidates.csv", labels=D + "v3_labels",
                   out=D + "pairs_skillmap_v3.csv")}
REFERENCE_CSVS = [D + "reference_pairs_v1.csv", D + "reference_pairs_v2.csv"]
SOFT_REFERENCE_CSVS = REFERENCE_CSVS + [D + "reference_pairs_v3.csv"]
CLASSES = ["SATISFIES", "RELATED", "NOT"]
CAUTION = ["RELATED", "BROADER", "DIFFERENT", "NARROWER", "SAME"]    # tie-break for label5: the more cautious label
JUDGES = ["gpt_oss", "qwen"]
MIRROR = {"SAME": "SAME", "NARROWER": "BROADER", "BROADER": "NARROWER", "RELATED": "RELATED",
          "DIFFERENT": "DIFFERENT"}
TO_CLASS = {"SAME": "SATISFIES", "NARROWER": "SATISFIES", "RELATED": "RELATED", "BROADER": "RELATED",
            "DIFFERENT": "NOT"}


def split_of(key: str) -> str:
    h = int(hashlib.md5(key.lower().encode()).hexdigest(), 16) % 100
    return "train" if h < 80 else "val" if h < 90 else "test"


def soft_rows(cand: pd.DataFrame) -> list[dict]:
    """One row per pair and direction with the vote shares (needs at least 3 of the 4 votes)."""
    from collections import Counter
    ab = cand[cand.order == "ab"].set_index("pair")
    ba = cand[cand.order == "ba"].set_index("pair")
    rows = []
    for p in ab.index.intersection(ba.index):
        votes = [ab.at[p, f"label_{j}"] for j in JUDGES] + [MIRROR.get(ba.at[p, f"label_{j}"]) for j in JUDGES
                                                             if isinstance(ba.at[p, f"label_{j}"], str)]
        votes = [v for v in votes if isinstance(v, str) and v in TO_CLASS]
        if len(votes) < 3:
            continue
        a, b, kind = ab.at[p, "a"], ab.at[p, "b"], ab.at[p, "kind"]
        split = split_of(min(a, b))
        for x, y, vs in ((a, b, votes), (b, a, [MIRROR[v] for v in votes])):
            count = Counter(vs)
            top = max(count.values())
            label5 = next(l for l in CAUTION if count.get(l) == top)
            share = Counter(TO_CLASS[v] for v in vs)
            rows.append({"a": x, "b": y, "label5": label5, "source": f"skillmap_{kind}", "split": split,
                         **{f"p_{c.lower()}": round(share.get(c, 0) / len(vs), 3) for c in CLASSES},
                         "votes": len(vs)})
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", choices=sorted(SETS), default="v2", help="which training set's labels to merge")
    ap.add_argument("--soft", action="store_true", help="run 6: keep every pair with 3+ votes, target = vote shares")
    args = ap.parse_args()
    cfg = SETS[args.set]
    cand = pd.read_csv(cfg["candidates"])
    for j in JUDGES:
        lab = pd.read_csv(os.path.join(cfg["labels"], f"label_{j}.csv"))[["id", f"label_{j}"]]
        if lab.id.duplicated().any():
            raise SystemExit(f"label_{j}.csv has duplicate ids: {sorted(lab.id[lab.id.duplicated()].unique())[:10]}")
        unknown = set(lab.id) - set(cand.id)
        if unknown:
            raise SystemExit(f"label_{j}.csv has ids that are not in the candidates: {sorted(unknown)[:10]}")
        cand = cand.merge(lab, on="id", how="left")
    if args.soft:
        return write_soft(cand, cfg["out"].replace(".csv", "_soft.csv"))
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
    ref = pd.concat([pd.read_csv(f) for f in REFERENCE_CSVS])
    test_keys = {canonical_key(n) for n in pd.concat([ref.a, ref.b]).astype(str)}
    leaked = sorted({n for n in pd.concat([df.a, df.b]).astype(str) if canonical_key(n) in test_keys})
    if leaked:
        raise SystemExit(f"{len(leaked)} training skills are in the reference (test) set, e.g. {leaked[:10]}: "
                         "nothing written. Rebuild the candidates with build_pairs_skillmap.py")
    df.to_csv(cfg["out"], index=False, encoding="utf-8")
    print(f"\nChecks passed: no duplicate ids, no reference-set skill in training ({len(test_keys)} keys checked)")
    print(f"Wrote {len(df)} rows ({len(df) // 2} pairs, both orders) to {cfg['out']}")
    if len(df):
        print(pd.crosstab(df.label5, df.split, margins=True).to_string())
        print("\n3 classes:", df.label3.value_counts().to_dict())
        print("by kind:", df.source.value_counts().to_dict())


def write_soft(cand: pd.DataFrame, out: str):
    from app.services.skill_names import canonical_key
    df = pd.DataFrame(soft_rows(cand))
    if df.empty:
        raise SystemExit("No pair has 3 or more votes yet")
    df["label3"] = df.label5.map(TO_CLASS)
    ref = pd.concat([pd.read_csv(f) for f in SOFT_REFERENCE_CSVS if os.path.exists(f)])
    test_keys = {canonical_key(n) for n in pd.concat([ref.a, ref.b]).astype(str)}
    leaks = df.a.astype(str).map(canonical_key).isin(test_keys) | df.b.astype(str).map(canonical_key).isin(test_keys)
    df = df[~leaks]
    df.to_csv(out, index=False, encoding="utf-8")
    pairs = len(df) // 2
    unanimous = int(((df[["p_satisfies", "p_related", "p_not"]] == 1).any(axis=1)).sum() // 2)
    print(f"Soft labels: {pairs} pairs ({len(df)} rows, both orders) written to {out}")
    print(f"  {int(leaks.sum()) // 2} pairs left out because a skill is in a blind test set (v1-v3)")
    print(f"  all votes for one class: {unanimous} pairs; split votes: {pairs - unanimous} pairs")
    print(pd.crosstab(df.label3, df.split, margins=True).to_string())
    print("mean target:", df[["p_satisfies", "p_related", "p_not"]].mean().round(3).to_dict())


if __name__ == "__main__":
    main()
