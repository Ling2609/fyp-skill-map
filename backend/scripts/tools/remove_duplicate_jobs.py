"""
Find and remove duplicate live jobs (roadmap F9).

The same posting can be saved twice when JSearch returns it with a new id on a later run
(e.g. via another publisher). Two live jobs count as duplicates when title, company and
location match (ignoring case, punctuation and spacing; see app/services/job_keys.py).

For each group of duplicates it keeps ONE job, the most recently posted (newest
listing_date; if equal, the one saved last), and deletes the others with their skills.
It lists everything first and only deletes after you type "y".
Only live jobs are checked; the 2024 dataset is never touched.

Usage (from backend/, venv active):
  python scripts/tools/remove_duplicate_jobs.py
"""
import sys
from collections import defaultdict
from datetime import datetime, timezone

sys.path.append(".")   # run from backend/

from app.database import SessionLocal
from app.models.job import Job, JobSkill
from app.services.job_keys import job_key

OLDEST = datetime.min.replace(tzinfo=timezone.utc)


def main():
    db = SessionLocal()
    try:
        groups = defaultdict(list)
        for job in db.query(Job).filter(Job.source == "live").all():
            groups[job_key(job.job_title, job.company, job.location)].append(job)
        duplicate_groups = [jobs for jobs in groups.values() if len(jobs) > 1]

        total_live = sum(len(jobs) for jobs in groups.values())
        if not duplicate_groups:
            print(f"No duplicates found among {total_live} live jobs.")
            return

        to_delete = []
        print(f"Duplicates among {total_live} live jobs:\n")
        for jobs in duplicate_groups:
            jobs.sort(key=lambda j: (j.listing_date or OLDEST, j.id), reverse=True)
            keep, extras = jobs[0], jobs[1:]
            print(f"  {keep.job_title} | {keep.company} | {keep.location}")
            for j in jobs:
                posted = j.listing_date.date() if j.listing_date else "no date"
                mark = "KEEP  " if j is keep else "delete"
                print(f"     {mark} {j.job_id}  posted {posted}  via {j.publisher or '?'}")
            to_delete.extend(extras)
            print()

        print(f"{len(duplicate_groups)} groups → {len(to_delete)} jobs to delete, "
              f"{total_live - len(to_delete)} live jobs left.")
        if input("Delete them? (y/n): ").strip().lower() != "y":
            print("Nothing deleted.")
            return

        for job in to_delete:
            db.query(JobSkill).filter(JobSkill.job_id == job.id).delete()
            db.delete(job)
        db.commit()
        print(f"Deleted {len(to_delete)} duplicate jobs (and their skills). "
              "Job Matches picks this up on the next search, no restart needed.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
