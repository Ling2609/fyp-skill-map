"""
Find and remove saved live jobs whose title isn't an ICT role.

Live jobs saved before fetch_live_jobs.py checked titles can include non-ICT postings
(e.g. "Graduate Programme" at a marine engineering firm), stored under an ICT subcategory.
Since Job Matches ranks entry-level titles higher (A7), these can appear near the top.
This uses the same rule the fetcher now uses (is_ict_title in app/services/job_titles.py).

It lists everything first and only deletes after you type "y".
Only live jobs are checked; the 2024 dataset is never touched.

Usage (from backend/, venv active):
  python scripts/tools/remove_non_ict_jobs.py
"""
import sys

sys.path.append(".")   # run from backend/

from app.database import SessionLocal
from app.models.job import Job, JobSkill
from app.services.job_titles import is_ict_title


def main():
    db = SessionLocal()
    try:
        live = db.query(Job).filter(Job.source == "live").all()
        to_delete = [j for j in live if not is_ict_title(j.job_title)]
        if not to_delete:
            print(f"All {len(live)} live jobs have an ICT title.")
            return

        print(f"Live jobs without an ICT title ({len(to_delete)} of {len(live)}):\n")
        for j in to_delete:
            print(f"  {j.job_title} | {j.company} | {j.subcategory}")
        if input(f"\nDelete these {len(to_delete)} jobs? (y/n): ").strip().lower() != "y":
            print("Nothing deleted.")
            return

        for job in to_delete:
            db.query(JobSkill).filter(JobSkill.job_id == job.id).delete()
            db.delete(job)
        db.commit()
        print(f"Deleted {len(to_delete)} jobs (and their skills), {len(live) - len(to_delete)} live jobs left. "
              "Job Matches picks this up on the next search, no restart needed.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
