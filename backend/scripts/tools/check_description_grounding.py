"""
Check every saved job description (the bullet points students see on Job Detail) against its advert (18 Oct).

Why: an employer post that said only "test ttttt..." was shown as a full invented advert; Gemini had been told to
rewrite, and nothing checked its answer. The same check now runs on every new answer
(app/services/description_check.py); this script applies it to the answers saved before.

Run from backend/ with the venv active:
  python scripts/tools/check_description_grounding.py            # report only: how many fail, with examples
  python scripts/tools/check_description_grounding.py --apply    # also clear the failing ones (rebuilt on next view)
Writes ../docs/evidence/description_grounding.txt (the report).
"""
import argparse
import json
import sys

sys.path.append(".")

OUT = "../docs/evidence/description_grounding.txt"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="clear the saved bullets that fail the check")
    args = ap.parse_args()
    from app.database import SessionLocal
    from app.models.job import Job
    from app.services.description_check import GROUNDED_SHARE, ungrounded
    db = SessionLocal()
    lines, failing, checked = [], [], 0
    try:
        jobs = db.query(Job).filter(Job.formatted_description.isnot(None)).all()
        for job in jobs:
            try:
                bullets = json.loads(job.formatted_description)
            except ValueError:
                continue
            checked += 1
            bad = ungrounded(bullets, job.description or "")
            if bad:
                failing.append(job)
                lines.append(f"\n{job.job_id} | {job.source} | {job.job_title} | {job.company}: {len(bad)} of "
                             f"{sum(1 for b in bullets if not b.startswith('## '))} bullets not found in the ad")
                for b, share in bad[:3]:
                    lines.append(f"   {share:.2f}  {b[:160]}")
        head = [f"Saved job descriptions checked against their advert (18 Oct): {checked}",
                f"Failing (any bullet with under {GROUNDED_SHARE:.0%} of its words in the ad): {len(failing)}",
                "By source: " + ", ".join(f"{s} {sum(1 for j in failing if j.source == s)}"
                                            for s in sorted({j.source for j in failing})) if failing else "By source: none"]
        if args.apply:
            for job in failing:
                job.formatted_description = None
            db.commit()
            head.append(f"Cleared {len(failing)}: Job Detail rebuilds them (checked) on the next view.")
        else:
            head.append("Report only. Run again with --apply to clear them.")
    finally:
        db.close()
    text = "\n".join(head + lines)
    print(text)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(text + "\n")
    print(f"\nWritten {OUT}.")


if __name__ == "__main__":
    main()
