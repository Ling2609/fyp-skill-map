"""
Format All Job Descriptions
============================
Pre-processes all job descriptions using Groq and stores results in DB.
Run once — results cached permanently.

Usage:
  cd backend
  python data/scripts/format_all_descriptions.py

Options:
  --preview    Show first 5 jobs without saving (dry run)
  --reset      Clear all cached descriptions before processing
"""

import sys
import json
import time
import argparse
sys.path.append(".")

from app.database import SessionLocal
from app.models.job import Job
from app.nlp.skill_extractor import SkillExtractor


def preview_jobs(db, extractor, limit=5):
    """Show formatting preview without saving."""
    jobs = db.query(Job).limit(limit).all()
    print(f"\n{'='*60}")
    print("PREVIEW MODE — not saving to DB")
    print(f"{'='*60}")

    for job in jobs:
        if not job.description:
            continue
        print(f"\n--- {job.job_title} @ {job.company} ---")
        print(f"Raw description length: {len(job.description)} chars")
        print(f"Double spaces: {job.description.count('  ')}")
        print("\nFormatted output:")
        bullets = extractor.format_job_description(job.job_title, job.description)
        for b in bullets:
            if b.startswith('## '):
                print(f"\n  [{b}]")
            elif b.startswith('### '):
                print(f"    [{b}]")
            else:
                print(f"  • {b[:80]}{'...' if len(b) > 80 else ''}")
        time.sleep(2)


def process_all(db, extractor, reset=False):
    """Process all jobs and cache formatted descriptions."""
    if reset:
        print("Resetting all cached descriptions...")
        db.query(Job).update({Job.formatted_description: None})
        db.commit()
        print("Done.\n")

    jobs = db.query(Job).all()
    total = len(jobs)
    skipped = 0
    processed = 0
    failed = 0

    print(f"\n{'='*60}")
    print(f"Processing {total} jobs...")
    print(f"{'='*60}")

    for i, job in enumerate(jobs, 1):
        # Skip if already formatted
        if job.formatted_description and not reset:
            skipped += 1
            continue

        if not job.description:
            skipped += 1
            continue

        print(f"\n[{i}/{total}] {job.job_title[:50]}")
        print(f"  Length: {len(job.description)} | Double spaces: {job.description.count('  ')}")

        try:
            bullets = extractor.format_job_description(job.job_title, job.description)

            if bullets and len(bullets) >= 2:
                job.formatted_description = json.dumps(bullets)
                db.commit()
                processed += 1
                print(f"  ✓ Formatted: {len(bullets)} bullets")
            else:
                print(f"  ✗ Too few bullets ({len(bullets)}) — skipping")
                failed += 1

        except Exception as e:
            print(f"  ✗ Error: {e}")
            failed += 1

        # Rate limit
        if i < total:
            time.sleep(2)

    print(f"\n{'='*60}")
    print("COMPLETE")
    print(f"{'='*60}")
    print(f"  Processed:  {processed}")
    print(f"  Skipped:    {skipped} (already done or no description)")
    print(f"  Failed:     {failed}")
    print(f"  Total:      {total}")


def main():
    parser = argparse.ArgumentParser(description='Format all job descriptions')
    parser.add_argument('--preview', action='store_true', help='Preview first 5 jobs without saving')
    parser.add_argument('--reset', action='store_true', help='Clear all cached descriptions before processing')
    args = parser.parse_args()

    extractor = SkillExtractor()
    db = SessionLocal()

    try:
        if args.preview:
            preview_jobs(db, extractor)
        else:
            process_all(db, extractor, reset=args.reset)
    finally:
        db.close()


if __name__ == "__main__":
    main()