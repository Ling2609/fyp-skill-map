"""
The evaluation runs kept in MongoDB (app/services/evaluation_runs.py), 15 Oct.

From backend/, venv active:
  python scripts/tools/evaluation_runs.py list                      # every run: when, commit, name, main numbers
  python scripts/tools/evaluation_runs.py export                    # -> ../docs/evidence/evaluation_runs.json (commit it)
  python scripts/tools/evaluation_runs.py add-reference <summary.json>
        # an earlier relation-model check, from its saved summary, e.g.
        # ../docs/evidence/relation_model/reference_eval_<model>_set4.json
"""
import argparse
import json
import os
import sys

sys.path.append(".")
from app.services.evaluation_runs import REPO, all_runs, reference_run  # noqa: E402

OUT = os.path.join(REPO, "docs", "evidence", "evaluation_runs.json")


def headline(m: dict) -> str:
    """The run's main numbers in one line (P/R/F1 when it has them)."""
    parts = [f"{k} {m[k]['value']:.3f}" for k in ("precision", "recall", "f1") if isinstance(m.get(k), dict)]
    if not parts and isinstance(m.get("majority"), dict):        # a relation-model run: the model's weighted "has it"
        has = m["majority"].get("weighted_has") or {}
        model = next((v for k, v in has.items() if k.startswith("model")), {})
        parts = [f"{k} {model[k]}" for k in ("precision", "recall", "f1") if k in model]
    return ", ".join(parts) or ", ".join(f"{k} {v}" for k, v in list(m.items())[:3] if not isinstance(v, (dict, list)))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("step", choices=["list", "export", "add-reference"])
    ap.add_argument("file", nargs="?")
    a = ap.parse_args()
    if a.step == "add-reference":
        if not a.file:
            sys.exit("Give the summary JSON, e.g. ../docs/evidence/relation_model/reference_eval_<model>_set4.json")
        sys.exit(0 if reference_run(a.file) else 1)
    from pymongo.errors import PyMongoError
    try:
        runs = all_runs()
    except PyMongoError as e:
        sys.exit(f"MongoDB can't be reached ({type(e).__name__}): start the MongoDB service first.")
    if a.step == "list":
        if not runs:
            print("No runs yet. Scoring an evaluation (e.g. evaluate_job_skill_extraction.py score) records one.")
        for r in runs:
            dirty = "*" if r["git"].get("dirty") else ""
            print(f"{r['at']:%Y-%m-%d %H:%M}  {r['git'].get('commit')}{dirty:<1}  {r['name']:<34} {headline(r['metrics'])}"
                  + (f"  [{r['verdict']}]" if r.get("verdict") else ""))
        if any(r["git"].get("dirty") for r in runs):
            print("* = files had changed since that commit")
        return
    for r in runs:
        r["at"] = r["at"].isoformat()
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(runs, f, indent=1, ensure_ascii=False)
    print(f"{len(runs)} runs written to {os.path.relpath(OUT, REPO)}")


if __name__ == "__main__":
    main()
