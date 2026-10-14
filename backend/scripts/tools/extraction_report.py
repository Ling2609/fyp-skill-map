"""
What the MongoDB extraction_records say about the AI's skill reading (14 Oct; app/services/extraction_records.py).
Per kind (job ads, modules, student projects) and prompt version:
  - records, and their outcomes (saved / suggested / too few skills / AI failed)
  - rejected rate: skills the checks rejected (quote not in the text, a plan not a use...) / skills proposed
  - the most common reasons for rejecting
  - corrections: of the records a person reviewed, how many skills they removed and added per record, and how often
    an employer moved a skill to another level
The rejected rate is what the quote check CAUGHT, not every mistake: a wrong skill with a real quote passes. That is
why the evaluation also hand-checks a sample (docs/evidence/), and why people's corrections are counted here.

Usage (from backend/, MongoDB running):
    python scripts/tools/extraction_report.py                 # everything
    python scripts/tools/extraction_report.py --since 2026-10-14
    python scripts/tools/extraction_report.py --csv ../docs/evidence/extraction_report.csv
"""
import argparse
import csv
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone

sys.path.insert(0, ".")

from app.mongo import get_db  # noqa: E402


def distinct_skills(items) -> int:
    return len({(x.get("skill") or "").strip().lower() for x in items if x.get("skill")})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", help="only records from this date (YYYY-MM-DD)")
    ap.add_argument("--csv", help="also write the table to this CSV file")
    args = ap.parse_args()
    query = {}
    if args.since:
        query["at"] = {"$gte": datetime.fromisoformat(args.since).replace(tzinfo=timezone.utc)}
    docs = list(get_db()["extraction_records"].find(query))
    if not docs:
        print("No extraction records yet. They are made whenever the AI reads skills (live jobs, Post a job, "
              "modules, student projects).")
        return

    groups = defaultdict(list)
    for d in docs:
        groups[(d["kind"], d.get("prompt_version") or "-")].append(d)
    rows = []
    for (kind, version), ds in sorted(groups.items()):
        outcomes = Counter(d.get("outcome") for d in ds)
        kept = sum(distinct_skills(d.get("kept", [])) for d in ds)
        rejected = sum(distinct_skills(d.get("rejected", [])) for d in ds)
        reasons = Counter(r.get("reason") or "-" for d in ds for r in d.get("rejected", []))
        reviewed = [d for d in ds if d.get("reviews")]
        removed = sum(len(r.get("removed", [])) for d in reviewed for r in d["reviews"])
        added = sum(len(r.get("added", [])) for d in reviewed for r in d["reviews"])
        moved = sum(len(r.get("level_changed", [])) for d in reviewed for r in d["reviews"])
        kept_reviewed = sum(distinct_skills(d.get("kept", [])) for d in reviewed)
        row = {"kind": kind, "prompt_version": version, "records": len(ds),
               "outcomes": ", ".join(f"{k} {v}" for k, v in outcomes.most_common()),
               "skills_proposed": kept + rejected, "kept": kept, "rejected": rejected,
               "rejected_pct": round(100 * rejected / (kept + rejected), 1) if kept + rejected else 0,
               "top_reasons": "; ".join(f"{k} {v}" for k, v in reasons.most_common(3)),
               "reviewed": len(reviewed),
               "removed_pct_of_kept": round(100 * removed / kept_reviewed, 1) if kept_reviewed else 0,
               "added_per_review": round(added / len(reviewed), 2) if reviewed else 0,
               "level_changed": moved}
        rows.append(row)
        print(f"\n{kind}  ({version})  {len(ds)} record{'' if len(ds) == 1 else 's'}: {row['outcomes']}")
        print(f"  skills proposed {row['skills_proposed']}: kept {kept}, rejected {rejected} ({row['rejected_pct']}%)")
        if reasons:
            print(f"  why rejected: {row['top_reasons']}")
        if reviewed:
            print(f"  reviewed by a person: {len(reviewed)} — removed {row['removed_pct_of_kept']}% of the AI's kept "
                  f"skills, added {row['added_per_review']} per review" + (f", moved {moved} to another level" if moved else ""))
    if args.csv:
        with open(args.csv, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0]))
            w.writeheader()
            w.writerows(rows)
        print(f"\nSaved {args.csv}")


if __name__ == "__main__":
    main()
