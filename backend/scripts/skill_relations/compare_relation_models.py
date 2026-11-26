"""
Every relationship model on ONE blind test set (26 Nov 2026, report objective 5: model comparison)
=================================================================================================
The earlier result files in docs/evidence/relation_model/ were made on different test sets (v1, set2, set3, set4), so
they cannot sit in one table. This script scores, on the same pairs (blind set v4: 3-judge labels, made after every
model here was trained):

  - SBERT cosine >= 0.7, the rule the app used before the relationship model
  - the UNTUNED cross-encoder/nli-deberta-v3-base (the final model's starting point, zero-shot: entailment = has it,
    neutral = related, contradiction = not), to show what fine-tuning added
  - every trained model folder backend/data/relation_model_* (oldest first), the 3-seed ensembles averaged as the app does

Scoring is the same code as evaluate_reference.py (macro-F1 over the 3 classes, "has it" precision / recall, per cosine
band, population-weighted "has it"), so the final model's numbers match reference_eval_..._set4.json.

Writes (default docs/evidence/relation_model/comparison_set4/):
  summary.md            the tables for the report (majority labels = main result, unanimous = check)
  comparison.csv        one row per model and label set
  per_band.csv          accuracy per cosine band
  false_has_final.csv   the final model's false "has it" pairs at the app's cut-off (error analysis)
  chart.svg             macro-F1 and "has it" precision per model (no chart library needed)
  comparison.json       everything above

Usage (backend/, venv on; CPU is fine, a few minutes; the first run downloads the untuned model, about 0.7 GB):
  python scripts/skill_relations/compare_relation_models.py
  python scripts/skill_relations/compare_relation_models.py --skip-untuned        # no download
"""
import argparse
import glob
import json
import os
import sys

import numpy as np
import pandas as pd
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

sys.path.append(".")
sys.path.append("scripts/skill_relations")
from evaluate_reference import (BANDS, LABELS, SETS, cosine_class, model_predict, scores,  # noqa: E402
                                weighted_accuracy, weighted_has)

UNTUNED = "cross-encoder/nli-deberta-v3-base"
# a short name for each folder, in training order (folder names from the training notebook's runs)
SHORT = {
    "relation_model_esco_onet": "Run 1 - ESCO/O*NET only (BERT)",
    "relation_model_skillmap_v2": "Run 2 - SkillMap pairs only (BERT)",
    "relation_model_esco_onet_v1_skillmap_v2": "Run 3 - ESCO/O*NET + SkillMap (BERT)",
    "relation_model_esco_onet_v1_skillmap_v2_rw3x20": "Run 3b - + reweighting (BERT)",
    "relation_model_esco_onet_v1_skillmap_v2_nli_rw3x20": "Run 4 - NLI start (RoBERTa)",
    "relation_model_esco_onet_v1_skillmap_v2_skillmap_v3_nli_rw3x20": "Run 5 - + SkillMap v3 (RoBERTa)",
    "relation_model_esco_onet_v1_skillmap_v2_soft_skillmap_v3_soft_nli_rw3x20_noextend": "Run 6a - soft labels, 3 seeds (RoBERTa)",
    "relation_model_esco_onet_v1_skillmap_v2_soft_skillmap_v3_soft_nli-deberta-v3-base_rw3x20_noextend": "Run 6 - soft labels, 3 seeds (DeBERTa-v3) = FINAL",
}


@torch.no_grad()
def untuned_predict(a, b):
    """Zero-shot NLI: premise = the student's skill, hypothesis = the job's skill. Classes follow the model's own labels."""
    tok = AutoTokenizer.from_pretrained(UNTUNED)
    model = AutoModelForSequenceClassification.from_pretrained(UNTUNED).eval()
    names = {i: n.lower() for i, n in model.config.id2label.items()}
    order = [next(i for i, n in names.items() if n.startswith(w)) for w in ("entail", "neutral", "contra")]
    probs = []
    for i in range(0, len(a), 64):
        batch = tok(a[i:i + 64], b[i:i + 64], padding=True, truncation=True, max_length=64, return_tensors="pt")
        probs.append(torch.softmax(model(**batch).logits, dim=-1))
    p = torch.cat(probs).numpy()[:, order]               # -> SATISFIES, RELATED, NOT
    return [LABELS[k] for k in p.argmax(axis=1)], p


def chart(rows, path):
    """Two horizontal bars per model: macro-F1 (blue) and 'has it' precision (teal), majority labels."""
    rows = [r for r in rows if r["labels"] == "majority"]
    w, left, bar, gap = 760, 330, 11, 12
    h = 60 + len(rows) * (2 * bar + gap)
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" font-family="Segoe UI, Arial" font-size="12">',
           f'<rect width="{w}" height="{h}" fill="#fff"/>',
           f'<text x="16" y="22" font-size="14" font-weight="700">Relationship models on blind set v4 (majority labels, n = {rows[0]["n"]})</text>',
           f'<rect x="{left}" y="32" width="10" height="10" fill="#2557c4"/><text x="{left + 14}" y="41">macro-F1</text>',
           f'<rect x="{left + 90}" y="32" width="10" height="10" fill="#13998c"/><text x="{left + 104}" y="41">"has it" precision</text>']
    scale = w - left - 60
    for k, r in enumerate(rows):
        y = 56 + k * (2 * bar + gap)
        bold = ' font-weight="700"' if "FINAL" in r["model"] else ""
        out.append(f'<text x="{left - 8}" y="{y + bar + 4}" text-anchor="end"{bold}>{r["model"]}</text>')
        for j, (key, colour) in enumerate((("macro_f1", "#2557c4"), ("has_precision", "#13998c"))):
            v = r[key]
            out.append(f'<rect x="{left}" y="{y + j * bar}" width="{max(1, v * scale):.1f}" height="{bar - 1}" fill="{colour}"/>')
            out.append(f'<text x="{left + v * scale + 4:.1f}" y="{y + j * bar + bar - 2}" font-size="10">{v:.2f}</text>')
    out.append("</svg>")
    open(path, "w", encoding="utf-8").write("\n".join(out))


def main():
    ap = argparse.ArgumentParser(description="All relationship models on one blind test set")
    ap.add_argument("--set", choices=sorted(SETS), default="v4")
    ap.add_argument("--data", default="data", help="folder holding relation_model_* folders")
    ap.add_argument("--cutoff", type=float, default=float(os.environ.get("RELATION_CUTOFF") or 0.6),
                    help="the app's cut-off for the FINAL model's 'has it' (RELATION_CUTOFF; 0.6 since run 6)")
    ap.add_argument("--out", default="../docs/evidence/relation_model/comparison_set4")
    ap.add_argument("--skip-untuned", action="store_true", help="leave out the untuned model (no download)")
    args = ap.parse_args()

    df = pd.read_csv(SETS[args.set])
    a, b = df.a.astype(str).tolist(), df.b.astype(str).tolist()
    preds = {"SBERT cosine >= 0.7 (before the model)": (df.cosine.map(cosine_class), None)}
    if not args.skip_untuned:
        print(f"Untuned {UNTUNED} (zero-shot) ...", flush=True)
        preds[f"Untuned {UNTUNED.split('/')[1]} (zero-shot)"] = untuned_predict(a, b)
    folders = sorted(glob.glob(os.path.join(args.data, "relation_model_*")), key=os.path.getmtime)
    folders.sort(key=lambda f: list(SHORT).index(os.path.basename(f)) if os.path.basename(f) in SHORT else 99)
    final_name = None
    for f in folders:
        name = SHORT.get(os.path.basename(f), os.path.basename(f))
        print(f"{name} ...", flush=True)
        preds[name] = model_predict(a, b, f)
        if "FINAL" in name:
            final_name = name

    os.makedirs(args.out, exist_ok=True)
    rows, bands, result = [], [], {"set": SETS[args.set], "cutoff_final": args.cutoff, "models": {}}
    for name, (pred, p) in preds.items():
        df["pred"] = list(pred)
        result["models"][name] = {}
        for labels, col in (("majority", "label3_majority"), ("unanimous", "label3_unanimous")):
            s = df[df[col].notna() & (df[col] != "")]
            r = scores(s[col], s.pred)
            has = (s.pred == "SATISFIES") if p is None or "FINAL" not in name else pd.Series(p[s.index, 0] >= args.cutoff, index=s.index)
            r["weighted_has"] = weighted_has(s, col, has)
            r["weighted_accuracy"] = weighted_accuracy(s, col, "pred")
            result["models"][name][labels] = r
            rows.append({"model": name, "labels": labels, **{k: v for k, v in r.items() if not isinstance(v, dict)},
                         "w_has_precision": r["weighted_has"]["precision"], "w_has_recall": r["weighted_has"]["recall"],
                         "w_has_f1": r["weighted_has"]["f1"]})
            if labels == "majority":
                for band in BANDS:
                    g = s[s.band == band]
                    if len(g):
                        bands.append({"model": name, "band": band, "n": len(g), "accuracy": round(float((g[col] == g.pred).mean()), 3)})
        if name == final_name:
            s = df[df.label3_majority.notna() & (df.label3_majority != "")].copy()
            s["p_satisfies"] = p[s.index, 0].round(3)
            wrong = s[(s.p_satisfies >= args.cutoff) & (s.label3_majority != "SATISFIES")]
            wrong[["id", "a", "b", "cosine", "band", "p_satisfies", "label3_majority", "label_claude", "label_gpt_oss",
                   "label_qwen"]].sort_values("p_satisfies", ascending=False).to_csv(
                os.path.join(args.out, "false_has_final.csv"), index=False, encoding="utf-8")
            result["false_has_final"] = len(wrong)

    pd.DataFrame(rows).to_csv(os.path.join(args.out, "comparison.csv"), index=False, encoding="utf-8")
    pd.DataFrame(bands).to_csv(os.path.join(args.out, "per_band.csv"), index=False, encoding="utf-8")
    chart(rows, os.path.join(args.out, "chart.svg"))
    json.dump(result, open(os.path.join(args.out, "comparison.json"), "w", encoding="utf-8"), indent=1)

    lines = [f"# Relationship models on blind set {args.set}", "",
             f"Test pairs: `{SETS[args.set]}`. Main result: majority labels (2 of 3 judges agree); unanimous as a check.",
             f"\"Has it\" = class SATISFIES, except the final model, judged at the app's cut-off p >= {args.cutoff}.",
             "Weighted = population-weighted over the cosine bands >= 0.55 (the bands were sampled at different rates).", ""]
    for labels in ("majority", "unanimous"):
        part = [r for r in rows if r["labels"] == labels]
        lines += [f"## {labels.capitalize()} labels (n = {part[0]['n']})", "",
                  "| Model | Macro-F1 | Accuracy | Has-it precision | Has-it recall | False has-it | Weighted has-it F1 |",
                  "|---|---|---|---|---|---|---|"]
        for r in part:
            b0, b1 = ("**", "**") if "FINAL" in r["model"] else ("", "")
            lines.append(f"| {b0}{r['model']}{b1} | {r['macro_f1']:.3f} | {r['accuracy']:.3f} | {r['has_precision']:.3f} | "
                         f"{r['has_recall']:.3f} | {r['false_has']} | {r['w_has_f1']:.3f} |")
        lines.append("")
    lines += ["## Accuracy per cosine band (majority labels)", "", "| Model | " + " | ".join(BANDS) + " |",
              "|---|" + "---|" * len(BANDS)]
    bdf = pd.DataFrame(bands)
    for name in preds:
        cells = [bdf[(bdf.model == name) & (bdf.band == band)].accuracy for band in BANDS]
        lines.append(f"| {name} | " + " | ".join(f"{c.iloc[0]:.2f}" if len(c) else "-" for c in cells) + " |")
    if final_name:
        lines += ["", f"## Final model's false \"has it\" (p >= {args.cutoff}, majority label not SATISFIES): "
                      f"{result['false_has_final']} pairs", "", "See `false_has_final.csv` (pair, cosine band, probability, each judge's label)."]
    open(os.path.join(args.out, "summary.md"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print("\n".join(lines))
    print(f"\nSaved to {args.out}/ (summary.md, comparison.csv, per_band.csv, false_has_final.csv, chart.svg, comparison.json)")


if __name__ == "__main__":
    main()
