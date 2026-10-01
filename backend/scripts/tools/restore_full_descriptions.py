"""
Put the full ad text back into jobs.description (fix plan, Stage 1). No Groq, no JSearch credits.

Descriptions were stored cut: 2024 ads at 2,000 characters (extract_job_skills.py), live ads at 6,000
(fetch_live_jobs.py, before 1 Oct). The evidence check needs the whole ad, or a real quote from the cut-off
part is wrongly rejected. Full text comes from data/jobstreet_clean.csv (2024) and data/live_jobs_cache.json
(live). Only rows whose stored text is a cut-off start of the full text are changed; their cached display
bullets (formatted_description) are cleared so Job Detail re-formats the full ad on next view.

Usage (from backend/, venv active):
  python scripts/tools/restore_full_descriptions.py          # preview: counts only
  python scripts/tools/restore_full_descriptions.py --save   # write
"""
import hashlib
import json
import os
import sys

sys.path.append(".")

from app.database import SessionLocal
from app.models.job import Job

CSV_2024 = "data/jobstreet_clean.csv"
LIVE_CACHE = "data/live_jobs_cache.json"


def full_texts() -> dict:
    """job_id -> full description, from both sources (whichever files are present)."""
    out = {}
    if os.path.exists(CSV_2024):
        import pandas as pd
        df = pd.read_csv(CSV_2024, usecols=["job_id", "descriptions"])   # same read and str() as extract_job_skills.py
        out.update((str(i), str(d)) for i, d in zip(df["job_id"], df["descriptions"]))
    if os.path.exists(LIVE_CACHE):
        with open(LIVE_CACHE, encoding="utf-8") as f:
            for results in json.load(f).values():
                for j in results or []:
                    if j.get("job_id") and j.get("job_description"):     # same id rule as fetch_live_jobs.py
                        out["live_" + hashlib.sha1(j["job_id"].encode()).hexdigest()[:16]] = j["job_description"]
    return out


def main():
    save = "--save" in sys.argv
    full = full_texts()
    print(f"{CSV_2024}: {'yes' if os.path.exists(CSV_2024) else 'MISSING'}; "
          f"{LIVE_CACHE}: {'yes' if os.path.exists(LIVE_CACHE) else 'MISSING'}")
    db = SessionLocal()
    try:
        stats = {"restored": 0, "already full": 0, "not found": 0, "different text": 0}
        by_source = {}
        added = 0
        for job in db.query(Job).all():
            stored, text = job.description or "", full.get(job.job_id)
            if not text:
                stats["not found"] += 1
            elif len(text) <= len(stored):
                stats["already full"] += 1
            elif not text.startswith(stored):
                stats["different text"] += 1      # never overwrite text that isn't a cut of the same ad
            else:
                stats["restored"] += 1
                by_source[job.source] = by_source.get(job.source, 0) + 1
                added += len(text) - len(stored)
                if save:
                    job.description = text
                    job.formatted_description = None
        if save:
            db.commit()
        print(("Saved" if save else "Preview (nothing written; add --save)") + ":")
        for k, v in stats.items():
            print(f"  {k:<15} {v}")
        print(f"  restored by source: {by_source or '-'}; characters added: {added:,}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
