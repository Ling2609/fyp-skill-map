"""Read-only: how live jobs spread over locations, categories, job levels and job types
(decides which filters on Job Matches are worth having).

Run from backend/ with the venv active:
    python scripts/tools/count_job_locations.py
"""
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.database import SessionLocal  # noqa: E402
from app.models.job import Job  # noqa: E402
from app.services.job_titles import classify_seniority  # noqa: E402

CACHE_FILE = Path(__file__).resolve().parents[2] / "data" / "live_jobs_cache.json"


def region(location: str) -> str:
    """'Petaling Jaya, Selangor' -> 'Selangor'; the fetcher stores 'city, state' or just the country."""
    return (location or "Unknown").split(",")[-1].strip() or "Unknown"


def main():
    db = SessionLocal()
    try:
        rows = db.query(Job.location, Job.subcategory, Job.job_title, Job.job_id).filter(Job.source == "live").all()
    finally:
        db.close()

    jobs = [(loc, sub) for loc, sub, _, _ in rows]
    print(f"Live jobs: {len(jobs)}\n")
    for title, counter in [("By state / country", Counter(region(loc) for loc, _ in jobs)),
                           ("By exact location", Counter(loc or "Unknown" for loc, _ in jobs))]:
        print(f"{title} ({len(counter)} values)")
        for name, n in counter.most_common(15):
            print(f"  {n:4d}  {name}")
        print()

    per_cat = Counter((sub or "None", region(loc)) for loc, sub in jobs)
    cats = Counter(sub or "None" for _, sub in jobs)
    print(f"Category x state, how many pairs have fewer than 3 jobs: "
          f"{sum(1 for n in per_cat.values() if n < 3)} of {len(per_cat)}")
    print(f"Categories: {len(cats)}\n")

    levels = Counter(classify_seniority(title) for _, _, title, _ in rows)
    print("Job level (from the title, as on the cards):")
    for name, n in levels.most_common():
        print(f"  {n:4d}  {name}")
    print()

    # Job type is not stored in the database; the saved JSearch results (0 credits) still have it
    try:
        cache = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"Job type: {CACHE_FILE.name} not found, skipped")
        return
    saved = {ref for _, _, _, ref in rows}
    types, found = Counter(), set()
    for results in cache.values():
        for j in results:
            ref = "live_" + hashlib.sha1((j.get("job_id") or "").encode()).hexdigest()[:16]
            if j.get("job_id") and ref in saved and ref not in found:
                found.add(ref)
                types[j.get("job_employment_type") or "not stated"] += 1
    print(f"Job type (JSearch job_employment_type, {len(found)} of {len(saved)} saved jobs found in the cache):")
    for name, n in types.most_common():
        print(f"  {n:4d}  {name}")


if __name__ == "__main__":
    main()
