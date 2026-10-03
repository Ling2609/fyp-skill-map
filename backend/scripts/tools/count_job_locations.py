"""Read-only: how live jobs spread over locations and categories (decides whether a location filter is worth it).

Run from backend/ with the venv active:
    python scripts/tools/count_job_locations.py
"""
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.database import SessionLocal  # noqa: E402
from app.models.job import Job  # noqa: E402


def region(location: str) -> str:
    """'Petaling Jaya, Selangor' -> 'Selangor'; the fetcher stores 'city, state' or just the country."""
    return (location or "Unknown").split(",")[-1].strip() or "Unknown"


def main():
    db = SessionLocal()
    try:
        jobs = db.query(Job.location, Job.subcategory).filter(Job.source == "live").all()
    finally:
        db.close()

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
    print(f"Categories: {len(cats)}")


if __name__ == "__main__":
    main()
