"""
MongoDB `evaluation_runs` (15 Oct, evaluation phase step 1; IR hybrid database): one document per evaluation run,
so every number in the report can be traced to the exact setup that produced it.

    {_id, name: "E1b job-ad extraction", objective: 1, at, git: {commit, dirty},
     setup: {relation_model, relation_seeds, relation_cutoff, embedder, extractor, python},
     method: "...", dataset: {...}, metrics: {...}, verdict: "..." | None,
     files: [{path, sha256}]}

Why MongoDB (as chats and extraction records): each run's metrics have a different shape (P/R/F1 with intervals,
nDCG@10, timings), written once and read whole. Why the file hashes: the answer key or labels a run used can be
proved unchanged later (same hash = same file).

Never in the way: if MongoDB is off, the evaluation still prints and writes its usual files; the run is only "not
saved" (said on screen). scripts/tools/evaluation_runs.py lists the runs and exports them to
docs/evidence/evaluation_runs.json for the report (examiners can't see a local MongoDB).
"""
import hashlib
import os
import platform
# Bandit B404: reviewed, only to run "git" with fixed arguments (below)
import subprocess  # nosec B404
import uuid
from datetime import datetime, timezone

from pymongo import DESCENDING

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
EXTRACTOR = "openai/gpt-oss-120b"          # app/nlp/skill_extractor.py (Groq)
EMBEDDER = "all-MiniLM-L6-v2"              # app/nlp/embedder.py MODEL_NAME (not imported: it loads PyTorch)


def _col():
    from app.mongo import get_db
    col = get_db()["evaluation_runs"]
    col.create_index([("name", 1), ("at", DESCENDING)])
    return col


def _git() -> dict:
    """The commit the code was at, and whether files had changed since (a dirty run can't be repeated exactly)."""
    def run(*args):
        # fixed "git" arguments chosen here, never user input; git is found on PATH, as in a terminal
        return subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True, timeout=10).stdout.strip()  # nosec B603 B607
    try:
        return {"commit": run("rev-parse", "--short", "HEAD") or None,
                "dirty": bool(run("status", "--porcelain", "--untracked-files=no"))}
    except (OSError, subprocess.SubprocessError):
        return {"commit": None, "dirty": None}


def setup() -> dict:
    """What the app runs with (read from settings and the model folder; no model is loaded)."""
    from app.config import settings
    model_dir = (settings.relation_model_dir or "").strip()
    seeds = None
    if model_dir:
        full = model_dir if os.path.isabs(model_dir) else os.path.join(REPO, "backend", model_dir)
        if os.path.isdir(full):
            seeds = sum(1 for d in os.listdir(full) if d.startswith("seed_")) or 1
    return {"relation_model": os.path.basename(os.path.normpath(model_dir)) if model_dir else "cosine >= 0.7 rule",
            "relation_seeds": seeds, "relation_cutoff": settings.relation_cutoff if model_dir else None,
            "embedder": EMBEDDER, "extractor": EXTRACTOR, "python": platform.python_version()}


def file_entry(path: str) -> dict:
    """A file the run read, by its path from the repository root and its SHA-256."""
    with open(path, "rb") as f:
        digest = hashlib.sha256(f.read()).hexdigest()
    return {"path": os.path.relpath(os.path.abspath(path), REPO).replace(os.sep, "/"), "sha256": digest}


def record(name: str, *, objective: int, method: str, dataset: dict, metrics: dict, files=(), verdict=None,
           with_setup: bool = True) -> str | None:
    """Save one run; returns its id, or None (and says so) if MongoDB can't be reached."""
    doc = {"_id": uuid.uuid4().hex, "name": name, "objective": objective, "at": datetime.now(timezone.utc),
           "git": _git(), "setup": setup() if with_setup else None, "method": method, "dataset": dataset,
           "metrics": metrics, "verdict": verdict, "files": [file_entry(p) for p in files if os.path.exists(p)]}
    try:
        _col().insert_one(doc)
    except Exception as e:                       # MongoDB off: the evaluation's own files are still written
        print(f"[evaluation_runs] run not saved to MongoDB ({type(e).__name__}); the result files are still written")
        return None
    dirty = " (files changed since this commit: not exactly repeatable)" if doc["git"]["dirty"] else ""
    print(f"[evaluation_runs] saved run {doc['_id'][:8]} at commit {doc['git']['commit']}{dirty}")
    return doc["_id"]


def reference_run(summary_json: str) -> str | None:
    """A relation-model check on a reference set (scripts/skill_relations/evaluate_reference.py's summary JSON), as a
    run. The model and cut-off evaluated are the ones in the file, which may differ from the app's .env, so the app
    setup is not attached."""
    import json
    with open(summary_json, encoding="utf-8") as f:
        d = json.load(f)
    name = os.path.basename(os.path.normpath(d["model"]))
    return record(f"Relation model on {os.path.basename(d['pairs'])}", objective=2, with_setup=False,
                  method="model vs cosine (and a baseline model) on reference skill pairs labelled by 3 judges; "
                         "'has it' precision / recall / F1, population-weighted over similarity bands >= 0.55",
                  dataset={"pairs": d["pairs"], "model": name, "cutoff": d.get("cutoff"),
                           "baseline": d.get("baseline"), "baseline_cutoff": d.get("baseline_cutoff")},
                  metrics={k: d[k] for k in ("unanimous", "majority") if k in d},
                  verdict=(d.get("pass_rule") or {}).get("verdict"),
                  files=[summary_json, os.path.join(REPO, "backend", d["pairs"])])


def all_runs() -> list[dict]:
    """Every run, oldest first. Raises if MongoDB can't be reached (the caller says so)."""
    return list(_col().find({}).sort("at", 1))
