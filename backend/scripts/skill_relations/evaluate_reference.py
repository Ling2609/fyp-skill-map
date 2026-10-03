"""
Stage 2B result: SBERT cosine (what the app does today) vs the trained relationship model, on the reference set of
real SkillMap pairs that the three judges labelled. Runs on the CPU in seconds; no Groq, no Colab.

Two test sets from reference_pairs_v1.csv (made by merge_reference_labels.py):
  unanimous  pairs where all three judges gave the same class (high-confidence; the main result)
  majority   pairs where at least two judges agree (bigger, noisier; a check that the result holds)
Cosine uses the app's rule: >= 0.7 SATISFIES ("has the skill"), 0.6-0.7 RELATED, below NOT; the cosine values are
the ones stored by sample_reference_pairs.py (the app's own SBERT model).

Reported per set:
  macro-F1 over the 3 classes (each class counts equally)
  "has the skill" precision / recall (SATISFIES vs the rest): precision is the costly side (a false "has it"
      hides a real gap), recall is what cosine misses
  per cosine band, and a weighted overall over the bands >= 0.55, each band weighted by how many real candidate
      pairs it has (band_population), because the bands were sampled at different rates (Fogliato et al. 2024).
      The < 0.55 band is a sanity check only (the app never asks the model about pairs that far apart).
Caveat: within a band the unanimous pairs are the easier ones, so the weighted figure is an estimate.

Usage (from backend/, venv active):
  python scripts/skill_relations/evaluate_reference.py                                             # v1 model
  python scripts/skill_relations/evaluate_reference.py --model data/relation_model_skillmap_v2     # another model
  python scripts/skill_relations/evaluate_reference.py --model data/relation_model_X --set v2      # fresh test set
A model other than the default writes its own files, named after its folder (e.g. reference_eval_skillmap_v2.json),
so results of different models never overwrite each other. Cosine is the same in every file.
"""
import argparse
import json
import os

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import f1_score, precision_score, recall_score
from transformers import AutoModelForSequenceClassification, AutoTokenizer

PAIRS_CSV = "data/skill_relations/reference_pairs_v1.csv"
MODEL_DIR = "data/relation_model_esco_onet"
PRED_CSV = "data/skill_relations/reference_predictions.csv"
OUT_JSON = "../docs/evidence/relation_model/reference_eval.json"
LABELS = ["SATISFIES", "RELATED", "NOT"]          # same order as the training notebook
BANDS = ["0.85+", "0.75-0.85", "0.65-0.75", "0.55-0.65", "<0.55"]


def cosine_class(sim: float) -> str:
    return "SATISFIES" if sim >= 0.7 else "RELATED" if sim >= 0.6 else "NOT"


@torch.no_grad()
def model_predict(a: list[str], b: list[str], model_dir: str = MODEL_DIR) -> tuple[list[str], np.ndarray]:
    """Class and the three probabilities for each pair "a -> b" (the model reads the two names in order)."""
    tok = AutoTokenizer.from_pretrained(model_dir)
    model = AutoModelForSequenceClassification.from_pretrained(model_dir).eval()
    probs = []
    for i in range(0, len(a), 64):
        batch = tok(a[i:i + 64], b[i:i + 64], padding=True, truncation=True, max_length=64, return_tensors="pt")
        probs.append(torch.softmax(model(**batch).logits, dim=-1))
    p = torch.cat(probs).numpy()
    return [LABELS[k] for k in p.argmax(axis=1)], p


def scores(truth: pd.Series, pred: pd.Series) -> dict:
    has_t, has_p = truth == "SATISFIES", pred == "SATISFIES"
    return {"n": int(len(truth)),
            "macro_f1": round(f1_score(truth, pred, labels=LABELS, average="macro", zero_division=0), 3),
            "accuracy": round(float((truth == pred).mean()), 3),
            "has_precision": round(precision_score(has_t, has_p, zero_division=0), 3),
            "has_recall": round(recall_score(has_t, has_p, zero_division=0), 3),
            "false_has": int((has_p & ~has_t).sum())}


def weighted_accuracy(df: pd.DataFrame, truth: str, pred: str) -> float:
    """Accuracy over the bands >= 0.55, each band weighted by its real number of candidate pairs."""
    total = weight = 0.0
    for band, g in df[df.band != "<0.55"].groupby("band"):
        w = g.band_population.iloc[0]
        total += w * (g[truth] == g[pred]).mean()
        weight += w
    return round(total / weight, 3) if weight else float("nan")


SETS = {"v1": "data/skill_relations/reference_pairs_v1.csv", "v2": "data/skill_relations/reference_pairs_v2.csv"}


def output_paths(model_dir: str, test_set: str = "v1") -> tuple[str, str]:
    """The default (v1) model keeps the original file names; any other model gets its folder name as a suffix.
    The fresh test set (v2) adds "_set2", so its results never overwrite the first set's."""
    pred, out = PRED_CSV, OUT_JSON
    if os.path.normpath(model_dir) != os.path.normpath(MODEL_DIR):
        tag = os.path.basename(os.path.normpath(model_dir)).replace("relation_model_", "")
        pred, out = pred.replace(".csv", f"_{tag}.csv"), out.replace(".json", f"_{tag}.json")
    if test_set != "v1":
        pred, out = pred.replace(".csv", "_set2.csv"), out.replace(".json", "_set2.json")
    return pred, out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=MODEL_DIR, help="folder of the trained model (unzipped from Colab)")
    ap.add_argument("--set", choices=sorted(SETS), default="v1", help="v1 = first test set, v2 = fresh blind set")
    args = ap.parse_args()
    model_dir = args.model
    global PAIRS_CSV
    PAIRS_CSV = SETS[args.set]
    if not os.path.isdir(model_dir):
        raise SystemExit(f"No model folder {model_dir}: unzip the Colab download into backend/data/ first")
    pred_csv, out_json = output_paths(model_dir, args.set)
    print(f"Model: {model_dir}")
    df = pd.read_csv(PAIRS_CSV)
    if "label3_unanimous" not in df:
        raise SystemExit("Run merge_reference_labels.py first")
    df["cosine_pred"] = df.cosine.map(cosine_class)
    df["model_pred"], p = model_predict(df.a.astype(str).tolist(), df.b.astype(str).tolist(), model_dir)
    for k, lab in enumerate(LABELS):
        df[f"p_{lab.lower()}"] = p[:, k].round(3)
    df.to_csv(pred_csv, index=False, encoding="utf-8")

    result = {}
    for name, col in (("unanimous", "label3_unanimous"), ("majority", "label3_majority")):
        s = df[df[col].notna() & (df[col] != "")]
        result[name] = {"cosine": scores(s[col], s.cosine_pred), "model": scores(s[col], s.model_pred),
                        "weighted_accuracy": {"cosine": weighted_accuracy(s, col, "cosine_pred"),
                                              "model": weighted_accuracy(s, col, "model_pred")},
                        "per_band": {}}
        print(f"\n=== {name}: {len(s)} pairs ===")
        print(f"{'':<10} {'macro-F1':>9} {'accuracy':>9} {'has: precision':>15} {'recall':>7} {'false has':>10}")
        for who in ("cosine", "model"):
            r = result[name][who]
            print(f"{who:<10} {r['macro_f1']:>9} {r['accuracy']:>9} {r['has_precision']:>15} {r['has_recall']:>7} "
                  f"{r['false_has']:>10}")
        wa = result[name]["weighted_accuracy"]
        print(f"weighted accuracy (bands >= 0.55): cosine {wa['cosine']}, model {wa['model']}")
        print(f"\n{'band':<10} {'pairs':>6} {'cosine acc':>11} {'model acc':>10}")
        for band in BANDS:
            g = s[s.band == band]
            if len(g):
                ca, ma = (g[col] == g.cosine_pred).mean(), (g[col] == g.model_pred).mean()
                result[name]["per_band"][band] = {"n": int(len(g)), "cosine": round(ca, 3), "model": round(ma, 3)}
                print(f"{band:<10} {len(g):>6} {ca:>11.2f} {ma:>10.2f}")

    os.makedirs(os.path.dirname(out_json), exist_ok=True)
    json.dump({"model": model_dir, "pairs": PAIRS_CSV, **result}, open(out_json, "w"), indent=1)
    print(f"\nSaved predictions to {pred_csv} and the summary to {out_json}")


if __name__ == "__main__":
    main()
