"""
Tidy every live job ad before testers come (rewritten 25 Nov 2026)
==================================================================
The first student to open a job ad that has never been tidied waits while Gemini rewrites it (5-21 s in the
25 Nov response-time test, docs/evidence/performance/summary.txt). Run this once before user testing, and after
fetching new live jobs, so nobody waits.

It does exactly what Job Detail does, through the same function (app/routers/jobs.py description_of):
  - only ads students can see now (current_jobs_filter), never an employer's own post (shown as written, 18 Oct)
  - an ad that already has a good tidy version is left alone (a bad one is made again, as the page would)
  - Gemini tidies the ad; if it adds any text that isn't in the ad, or gives fewer than 3 points, the ad's own
    text is laid out by rules instead (18 Oct grounding check)
  - one Gemini call at a time, with a pause between them (default 6 s, about 10 a minute, inside the free tier)

Usage (backend/, venv on; uses DATABASE_URL from .env):
  python scripts/tools/format_all_descriptions.py --dry-run     # only count what would be tidied
  python scripts/tools/format_all_descriptions.py               # tidy them
  python scripts/tools/format_all_descriptions.py --pause 10    # slower, if Gemini says "too many requests"
  python scripts/tools/format_all_descriptions.py --redo-own-text   # also retry ads kept as their own text (e.g. after
                                                                   # a Gemini outage before 26 Nov locked them in)
"""

import argparse
import sys
import time

sys.path.append(".")

from app.database import SessionLocal  # noqa: E402
from app.models.job import Job  # noqa: E402
from app.routers.jobs import cached_bullets, current_jobs_filter, description_of, format_description_rules  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description="Tidy every live job ad, as Job Detail would")
    parser.add_argument("--dry-run", action="store_true", help="only count the ads that would be tidied")
    parser.add_argument("--pause", type=float, default=6.0, help="seconds between Gemini calls (default 6)")
    parser.add_argument("--redo-own-text", action="store_true",
                        help="also retry ads whose saved version is their own text laid out by rules")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        live = current_jobs_filter(db.query(Job)).filter(Job.source != "employer").order_by(Job.id).all()
        def own_text(j):                               # saved as the ad's own text (rules), not Gemini's version
            return bool(j.formatted_description) and cached_bullets(j) == format_description_rules(j.description)
        todo = [j for j in live if j.description and (cached_bullets(j) is None or (args.redo_own_text and own_text(j)))]
        if args.redo_own_text:
            for j in todo:
                if own_text(j):
                    j.formatted_description = None     # so description_of asks Gemini again
            db.commit()
        print(f"{len(live)} live ads (employer posts are shown as written and not counted); {len(todo)} to tidy")
        if args.dry_run or not todo:
            return
        by_ai = by_rules = 0
        for i, job in enumerate(todo, 1):
            started = time.time()
            bullets = description_of(job, db)["bullets"]
            # the page saves Gemini's version, or the ad's own text laid out by rules when Gemini's isn't safe
            rules = bullets == format_description_rules(job.description)
            kept = job.formatted_description is not None   # not saved = Gemini gave nothing: tried again next run
            by_rules += rules and kept
            by_ai += not rules
            print(f"[{i}/{len(todo)}] {job.job_title[:55]:<55} "
                  f"{'tidied by Gemini' if not rules else 'own text (rules)' if kept else 'Gemini busy: retry later'}"
                  f"  {time.time() - started:4.1f} s")
            if i < len(todo):
                time.sleep(args.pause)
        print(f"\nDone: {by_ai} tidied by Gemini, {by_rules} kept as the ad's own text. "
              f"Run again with --dry-run: it should say 0 to tidy.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
