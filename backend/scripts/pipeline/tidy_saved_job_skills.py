"""
Run the tidy rules (app/services/job_skill_tidy.py, 5 Oct) over job skills ALREADY saved by the evidence
extractor, so jobs saved before the rules existed get the same result as jobs saved after. No Groq calls:
the rules only need each skill's quote, level and the ad text. Running it twice changes nothing.

Dry run by default: prints every change per job and a total. --save writes the tidied skills (same
extracted_by version, so the bulk run still counts these jobs as done). The rows before tidying are copied once
to job_skills_pre_tidy; --undo puts them back. Restart uvicorn afterwards.

Usage (from backend/, venv active):
  python scripts/pipeline/tidy_saved_job_skills.py            # show what would change
  python scripts/pipeline/tidy_saved_job_skills.py --save     # write it
  python scripts/pipeline/tidy_saved_job_skills.py --undo     # put the rows from before tidying back
"""
import argparse
import sys

sys.path.append(".")
sys.path.append("scripts/pipeline")

from sqlalchemy import text as sql  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models.job import Job, JobSkill  # noqa: E402
from app.nlp.skill_extractor import JOB_EVIDENCE_VERSION  # noqa: E402
from app.services.evidence import cue_level  # noqa: E402
from app.services.job_skill_store import MIN_HARD, replace_job_skills, tidy_skills  # noqa: E402
from extract_job_skills_v2 import full_text_live  # noqa: E402

BACKUP = "job_skills_pre_tidy"


def row_items(rows, ad_text: str) -> list[dict]:
    return [{"skill": r.skill_name, "evidence_quote": r.evidence_quote or "", "level": r.level, "type": r.skill_type,
             "alternative_group": r.alternative_group or "", "match_score": r.match_score,
             "level_cue": cue_level(ad_text, r.evidence_quote or "")} for r in rows]


def describe(before: list[dict], after: list[dict], unnamed: list[dict], changes: dict) -> list[str]:
    lines = [f"  REJECT {u['skill']}: quote does not name it (\"{u['evidence_quote'][:70]}\")" for u in unnamed]
    old = {b["skill"]: b for b in before}
    for a in after:
        b = old.get(a["skill"], {})
        if a.get("level") != b.get("level"):
            lines.append(f"  LEVEL  {a['skill']}: {b.get('level')} -> {a['level']} (\"{a['evidence_quote'][:70]}\")")
        if (a.get("alternative_group") or "") != (b.get("alternative_group") or ""):
            lines.append(f"  GROUP  {a['skill']} [{a['alternative_group']}]")
    lines += [f"  MERGE  {gone} -> {kept}" for gone, kept in changes["merged"]]
    lines += [f"  DROP   {name}: only an option in [{group}]; {by or 'another option'} is asked for on its own"
              for name, group, by in changes["covered"]]
    return lines


def undo(db):
    if not db.execute(sql("SELECT to_regclass(:t)"), {"t": BACKUP}).scalar():
        print("Nothing to undo: no backup table")
        return
    ids = [i for (i,) in db.execute(sql(f"SELECT DISTINCT job_id FROM {BACKUP}"))]
    for i in ids:
        db.query(JobSkill).filter(JobSkill.job_id == i).delete()
        db.execute(sql(f"INSERT INTO job_skills SELECT * FROM {BACKUP} WHERE job_id = :j"), {"j": i})
    db.execute(sql(f"DROP TABLE {BACKUP}"))
    db.commit()
    print(f"Restored the rows from before tidying for {len(ids)} jobs")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--save", action="store_true", help="write the tidied skills")
    ap.add_argument("--undo", action="store_true", help="restore the rows from before tidying")
    args = ap.parse_args()
    db = SessionLocal()
    try:
        if args.undo:
            undo(db)
            return
        ids = [i for (i,) in db.query(JobSkill.job_id).filter(JobSkill.extracted_by == JOB_EVIDENCE_VERSION).distinct()]
        jobs = db.query(Job).filter(Job.id.in_(ids)).order_by(Job.id).all()
        full = full_text_live()
        print(f"Jobs saved with {JOB_EVIDENCE_VERSION}: {len(jobs)}; full ad text from the live cache: "
              f"{'yes' if full else 'NO (using the stored first 6,000 characters)'}")
        totals = {"jobs": 0, "changed": 0, "unnamed": 0, "duty": 0, "cue": 0, "grouped": 0, "merged": 0, "covered": 0,
                  "skills": 0}
        for job in jobs:
            ad = full.get(job.job_id) or job.description or ""
            rows = db.query(JobSkill).filter(JobSkill.job_id == job.id).order_by(JobSkill.id).all()
            before = row_items(rows, ad)
            after, unnamed, changes = tidy_skills(before, ad)
            lines = describe(before, after, unnamed, changes)
            totals["jobs"] += 1
            totals["skills"] += len(before)
            for k in ("unnamed", "duty", "cue", "grouped"):
                totals[k] += changes[k]
            totals["merged"] += len(changes["merged"])
            totals["covered"] += len(changes["covered"])
            if not lines:
                continue
            totals["changed"] += 1
            print(f"\n=== {job.job_title} ({job.company})")
            print("\n".join(lines))
            if args.save:
                if sum(1 for a in after if a.get("type") == "hard") < MIN_HARD:
                    print(f"  NOT SAVED: fewer than {MIN_HARD} hard skills would be left")
                    continue
                db.execute(sql(f"CREATE TABLE IF NOT EXISTS {BACKUP} AS TABLE job_skills WITH NO DATA"))
                db.execute(sql(f"INSERT INTO {BACKUP} SELECT * FROM job_skills WHERE job_id = :j "
                               f"AND NOT EXISTS (SELECT 1 FROM {BACKUP} WHERE job_id = :j)"), {"j": job.id})
                replace_job_skills(db, job, after, JOB_EVIDENCE_VERSION)
                db.commit()
                print(f"  SAVED {len(after)} skills (was {len(before)})")
        print(f"\n{totals['jobs']} jobs, {totals['skills']} skills checked; {totals['changed']} jobs change: "
              f"{totals['unnamed']} quotes not naming their skill, {totals['duty']} duties required -> unspecified, "
              f"{totals['cue']} levels taken from the heading, "
              f"{totals['grouped']} listed options grouped, {totals['merged']} names merged, "
              f"{totals['covered']} options dropped (choice already asked for on its own).")
        if not args.save and totals["changed"]:
            print("Dry run: nothing written. Add --save to write it.")
        elif args.save:
            print("Restart uvicorn to see the changes.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
