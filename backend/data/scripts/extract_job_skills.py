"""
Job Skill Extraction Pipeline
==============================
Samples 1000 jobs from jobstreet_clean.csv (stratified by subcategory),
extracts skills via Groq, stores in PostgreSQL.

Run once from backend/ folder:
    python data/scripts/extract_job_skills.py
"""

import sys
import time
import pandas as pd
sys.path.append(".")

from app.database import SessionLocal
from app.models.job import Job, JobSkill
from app.nlp.skill_extractor import SkillExtractor

SAMPLE_SIZE = 1000

def sample_jobs(df: pd.DataFrame, n: int) -> pd.DataFrame:
    """Stratified sample across subcategories."""
    subcats = df["subcategory"].value_counts()
    samples = []
    remaining = n

    for subcat, count in subcats.items():
        # Proportional allocation
        alloc = max(1, round(n * count / len(df)))
        alloc = min(alloc, count, remaining)
        sample = df[df["subcategory"] == subcat].sample(
            n=alloc, random_state=42
        )
        samples.append(sample)
        remaining -= alloc
        if remaining <= 0:
            break

    result = pd.concat(samples).sample(frac=1, random_state=42).reset_index(drop=True)
    return result.head(n)

def run():
    print("=" * 60)
    print("Job Skill Extraction Pipeline")
    print("=" * 60)

    # Load and sample jobs
    print("\nLoading job data...")
    df = pd.read_csv("data/jobstreet_clean.csv")
    print(f"  Total jobs: {len(df)}")

    sampled = sample_jobs(df, SAMPLE_SIZE)
    print(f"  Sampled: {len(sampled)} jobs")
    print(f"  Subcategories covered: {sampled['subcategory'].nunique()}")

    extractor = SkillExtractor()
    db = SessionLocal()

    try:
        total_skills = 0
        skipped = 0
        failed = 0

        for i, (_, row) in enumerate(sampled.iterrows(), 1):
            job_ref = str(row.get("job_id", f"job_{i}"))
            title = row.get("job_title", "")
            print(f"\n[{i}/{len(sampled)}] {title[:50]}")

            # Skip if already exists
            existing = db.query(Job).filter(Job.job_id == job_ref).first()
            if existing:
                skill_count = db.query(JobSkill).filter(
                    JobSkill.job_id == existing.id
                ).count()
                if skill_count > 0:
                    print(f"  Already processed ({skill_count} skills) — skipping")
                    skipped += 1
                    total_skills += skill_count
                    continue
                else:
                    db.query(JobSkill).filter(JobSkill.job_id == existing.id).delete()
                    db.delete(existing)
                    db.commit()

            # Insert job
            db_job = Job(
                job_id=job_ref,
                job_title=title,
                company=row.get("company", ""),
                location=row.get("location", ""),
                category=row.get("category", ""),
                subcategory=row.get("subcategory", ""),
                salary=str(row.get("salary", "")),
                description=str(row.get("descriptions", ""))[:2000],
            )
            db.add(db_job)
            db.commit()
            db.refresh(db_job)

            # Extract skills
            result = extractor.extract_from_job(row.to_dict())
            skills = result["extracted_skills"]

            if not skills:
                print(f"  No skills extracted — skipping")
                failed += 1
                continue

            print(f"  Extracted {len(skills)} skills: {skills[:5]}...")

            # Store skills
            for skill_name in skills:
                db_skill = JobSkill(
                    job_id=db_job.id,
                    job_ref=job_ref,
                    skill_name=skill_name,
                )
                db.add(db_skill)

            db.commit()
            total_skills += len(skills)

            # Rate limit
            if i < len(sampled):
                time.sleep(2)

        print("\n" + "=" * 60)
        print("EXTRACTION COMPLETE")
        print("=" * 60)
        print(f"  Jobs processed: {len(sampled)}")
        print(f"  Jobs skipped (already done): {skipped}")
        print(f"  Jobs failed: {failed}")
        print(f"  Total skills stored: {total_skills}")

    finally:
        db.close()

if __name__ == "__main__":
    run()