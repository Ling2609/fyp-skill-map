"""
Stage 1: extract job skills WITH evidence quotes and check them, next to the skills stored now.
Dry run by default (writes nothing to the database). Uses Groq (about 5-10k tokens per ad with the second pass).

--save replaces each job's stored skills with the checked ones (evidence, level, type, either-or group,
extracted_by = the prompt version). The old rows are copied once to job_skills_pre_stage1 first, so
--undo can put them back. --all-live processes every live job not yet saved with this version; it resumes
where it stopped and ends cleanly at Groq's daily limit. A job keeps its old skills if the new extraction
has fewer than 3 hard skills (failed or empty call). Restart uvicorn afterwards (the job cache does not
re-read skills of jobs it already holds).

For each ad it prints every skill the LLM returned: KEEP (quote found in the ad) or REJECT (quote not
there = unsupported), with type (hard/soft), level (required/preferred/trained/unspecified) and whether
the cue words around the quote agree with that level. Then: skills only the old extraction had, and only
the new one has. Results are appended to ../docs/evidence/stage1_dryrun_<prompt version>.csv.

Descriptions are stored cut (2024 ads at 2,000 characters, live ads at 6,000), so the full text is read
from data/jobstreet_clean.csv and data/live_jobs_cache.json when they are present.

Usage (from backend/, venv active):
  python scripts/pipeline/extract_job_skills_v2.py --title "Network Engineer Graduate"   # one live job
  python scripts/pipeline/extract_job_skills_v2.py --live 10                             # 10 random live jobs
  python scripts/pipeline/extract_job_skills_v2.py --dataset 10                          # 10 random 2024 ads
  python scripts/pipeline/extract_job_skills_v2.py --live 10 --seed 7                    # 10 different live jobs
  python scripts/pipeline/extract_job_skills_v2.py --title "Network Engineer" --company NEXTDC --repeat 3
  add --print-ad to also print the ad text that was checked
  python scripts/pipeline/extract_job_skills_v2.py --all-live --save                     # bulk: all live jobs
  python scripts/pipeline/extract_job_skills_v2.py --undo                                # put the old skills back
"""
import argparse
import csv
import hashlib
import json
import os
import random
import sys
from datetime import date

sys.path.append(".")

from sqlalchemy import text as sql

from app.database import SessionLocal
from app.models.job import Job, JobSkill
from app.services.evidence import verify_skills
from app.services.skill_names import canonical_key

OUT = "../docs/evidence/stage1_dryrun_{version}.csv"     # one file per prompt version
CSV_2024 = "data/jobstreet_clean.csv"
LIVE_CACHE = "data/live_jobs_cache.json"
BACKUP = "job_skills_pre_stage1"
MIN_HARD = 3
LEVEL_RANK = {"required": 0, "unspecified": 1, "preferred": 2, "trained": 3}   # strongest first


def save_skills(db, job, kept: list[dict], version: str) -> int:
    """Replace the job's stored skills with the checked ones; old rows are backed up once. Returns rows saved."""
    db.execute(sql(f"CREATE TABLE IF NOT EXISTS {BACKUP} AS TABLE job_skills WITH NO DATA"))
    db.execute(sql(f"INSERT INTO {BACKUP} SELECT * FROM job_skills WHERE job_id = :j "
                   f"AND NOT EXISTS (SELECT 1 FROM {BACKUP} WHERE job_id = :j)"), {"j": job.id})
    # One row per skill (A8 canonical key); if a skill appears twice, keep its strongest level
    best = {}
    for k in sorted(kept, key=lambda k: LEVEL_RANK.get(k.get("level"), 1)):
        best.setdefault(canonical_key(k["skill"]) or k["skill"].lower(), k)
    db.query(JobSkill).filter(JobSkill.job_id == job.id).delete()
    for k in best.values():
        db.add(JobSkill(job_id=job.id, job_ref=job.job_id, skill_name=k["skill"].strip(), extracted_by=version,
                        evidence_quote=k.get("evidence_quote"), level=k.get("level"), skill_type=k.get("type"),
                        match_score=k.get("match_score"), alternative_group=k.get("alternative_group") or None))
    db.commit()
    return len(best)


def undo(db):
    """Put back the skills backed up before --save, for every job in the backup."""
    exists = db.execute(sql("SELECT to_regclass(:t)"), {"t": BACKUP}).scalar()
    if not exists:
        print("Nothing to undo: no backup table")
        return
    ids = [i for (i,) in db.execute(sql(f"SELECT DISTINCT job_id FROM {BACKUP}"))]
    for i in ids:
        db.query(JobSkill).filter(JobSkill.job_id == i).delete()
        db.execute(sql(f"INSERT INTO job_skills SELECT * FROM {BACKUP} WHERE job_id = :j"), {"j": i})
    db.execute(sql(f"DROP TABLE {BACKUP}"))
    db.commit()
    print(f"Old skills restored for {len(ids)} jobs; backup table removed. Restart uvicorn.")


def full_text_2024() -> dict:
    """job_id -> full description from the cleaned 2024 CSV (empty if the file is missing)."""
    if not os.path.exists(CSV_2024):
        return {}
    import pandas as pd
    df = pd.read_csv(CSV_2024, usecols=["job_id", "descriptions"])   # same read and str() as extract_job_skills.py
    return {str(i): str(d) for i, d in zip(df["job_id"], df["descriptions"])}


def full_text_live() -> dict:
    """job_id ("live_" + hash, as fetch_live_jobs.py makes it) -> full description from the JSearch cache."""
    if not os.path.exists(LIVE_CACHE):
        return {}
    with open(LIVE_CACHE, encoding="utf-8") as f:
        cache = json.load(f)
    out = {}
    for results in cache.values():
        for j in results or []:
            if j.get("job_id") and j.get("job_description"):
                ref = "live_" + hashlib.sha1(j["job_id"].encode()).hexdigest()[:16]
                out[ref] = j["job_description"]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--title", help="part of a live job's title")
    ap.add_argument("--live", type=int, default=0, help="number of random live jobs")
    ap.add_argument("--dataset", type=int, default=0, help="number of random 2024 ads")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--company", help="with --title: part of the company name (e.g. NEXTDC)")
    ap.add_argument("--repeat", type=int, default=1, help="extract each ad N times and report how stable the result is")
    ap.add_argument("--no-glean", action="store_true", help="one pass only (no re-asking for skipped sentences)")
    ap.add_argument("--save", action="store_true", help="write the checked skills to the database")
    ap.add_argument("--all-live", action="store_true", help="every live job not yet saved with this prompt version")
    ap.add_argument("--undo", action="store_true", help="restore the skills stored before --save")
    ap.add_argument("--print-ad", action="store_true", help="also print the ad text that was checked")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        if args.undo:
            undo(db)
            return
        from app.nlp.skill_extractor import JOB_EVIDENCE_VERSION
        if args.save and args.repeat > 1:
            print("--save with --repeat makes no sense: pick one")
            return
        jobs = []
        if args.all_live:
            done = {i for (i,) in db.query(JobSkill.job_id).filter(JobSkill.extracted_by == JOB_EVIDENCE_VERSION).distinct()}
            pool = db.query(Job).filter(Job.source == "live").order_by(Job.id).all()
            jobs += [j for j in pool if j.id not in done]
            print(f"Live jobs: {len(pool)}, already saved with {JOB_EVIDENCE_VERSION}: {len(pool) - len(jobs)}, to do: {len(jobs)}")
        if args.title:
            q = db.query(Job).filter(Job.source == "live", Job.job_title.ilike(f"%{args.title}%"))
            if args.company:
                q = q.filter(Job.company.ilike(f"%{args.company}%"))
            jobs += q.limit(1).all()
        rng = random.Random(args.seed)
        if args.live:
            pool = db.query(Job).filter(Job.source == "live").order_by(Job.id).all()
            jobs += rng.sample(pool, min(args.live, len(pool)))
        full = full_text_live() if jobs else {}
        if jobs:
            print(f"Live full text from {LIVE_CACHE}: {'yes' if full else 'NO (using the stored first 6,000 characters)'}")
        if args.dataset:
            pool = db.query(Job).filter(Job.source != "live").order_by(Job.id).all()
            jobs += rng.sample(pool, min(args.dataset, len(pool)))
            full.update(full_text_2024())
            print(f"2024 full text from {CSV_2024}: {'yes' if os.path.exists(CSV_2024) else 'NO (using the stored first 2,000 characters)'}")
        if not jobs:
            print(__doc__)
            return

        from app.nlp.skill_extractor import SkillExtractor
        extractor = SkillExtractor()
        out = OUT.format(version=JOB_EVIDENCE_VERSION.split(":")[-1])
        totals = {"kept": 0, "rejected": 0, "conflict": 0, "old": 0, "grouped": 0, "units": 0, "pass2": 0, "saved": 0, "kept_old": 0}
        new_file = not os.path.exists(out)
        with open(out, "a", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            if new_file:
                w.writerow(["date", "job_id", "source", "job_title", "skill", "result", "type", "level",
                            "level_cue", "match_score", "alternative_group", "evidence_quote"])
            runs = {}                      # job id -> hard-skill keys of each run (--repeat)
            core_runs = {}                 # the same, required + unspecified only (what the coverage % counts)
            for job, r in [(j, r) for j in jobs for r in range(args.repeat)]:
                text = full.get(job.job_id) or job.description or ""
                stored = len(job.description or "")
                extra = f", stored {stored}" if len(text) != stored else ""
                print(f"\n=== {job.job_title} ({job.company}) [{job.source}, {len(text)} chars{extra}{f', run {r + 1}/{args.repeat}' if args.repeat > 1 else ''}]")
                if args.print_ad and r == 0:
                    print("----- ad text -----\n" + text + "\n-------------------")
                try:
                    items = extractor.extract_job_skills_with_evidence(job.job_title, text, glean=not args.no_glean)
                except Exception as e:
                    if "tokens per day" in str(e).lower():
                        print(f"\nGroq daily limit reached. Saved {totals['saved']} jobs this run; run the same "
                              f"command again tomorrow, it carries on where it stopped.")
                        break
                    raise
                kept, rejected = verify_skills(items, text)
                done, n_sent = getattr(extractor, "last_coverage", (0, 0))
                calls = getattr(extractor, "last_calls", [])
                print(f"  sentences answered: {done}/{n_sent}" + ("" if done == n_sent else "  <- some skipped twice")
                      + f"; calls: {', '.join(f'{f}/{t}' for f, t in calls) or '-'} (finish reason / output tokens)")
                for k in kept:
                    flag = f"  <- cue says {k['level_cue']}" if k["level_conflict"] else ""
                    if k.get("pass") == 2:
                        flag += "  (2nd pass)"
                    if k["alternative_group"]:
                        flag += f"  [either: {k['alternative_group']}]"
                    print(f"  KEEP   {k['skill'][:30]:<30} {k['type']:<5} {k['level']:<11}{flag}")
                    print(f"         \"{k['evidence_quote'][:90]}\"")
                for rj in rejected:
                    print(f"  REJECT {rj['skill'][:30]:<30} ({rj['reason']}, match {rj['match_score']}) \"{rj.get('evidence_quote', '')[:60]}\"")
                old = [s for (s,) in db.query(JobSkill.skill_name).filter(JobSkill.job_id == job.id)]
                old_keys = {canonical_key(s): s for s in old}
                new_keys = {canonical_key(k["skill"]): k["skill"] for k in kept}
                runs.setdefault(job.id, []).append({canonical_key(k["skill"]) for k in kept if k["type"] == "hard"})
                core_runs.setdefault(job.id, []).append({canonical_key(k["skill"]) for k in kept if k["type"] == "hard"
                                                         and k.get("level") in ("required", "unspecified")})
                print(f"  old extraction only: {', '.join(v for k, v in old_keys.items() if k not in new_keys) or '-'}")
                print(f"  new extraction only: {', '.join(v for k, v in new_keys.items() if k not in old_keys) or '-'}")
                totals["kept"] += len(kept)
                totals["rejected"] += len(rejected)
                totals["conflict"] += sum(k["level_conflict"] for k in kept)
                totals["pass2"] += sum(1 for k in kept if k.get("pass") == 2)
                totals["old"] += len(old) if r == 0 else 0
                groups = {k["alternative_group"].lower() for k in kept if k["alternative_group"]}
                totals["grouped"] += sum(1 for k in kept if k["alternative_group"])
                totals["units"] += sum(1 for k in kept if k["type"] == "hard" and not k["alternative_group"]) + \
                    len({k["alternative_group"].lower() for k in kept if k["type"] == "hard" and k["alternative_group"]})
                if groups:
                    print(f"  either-or groups: {', '.join(sorted(groups))}")
                if args.save:
                    hard = sum(1 for k in kept if k["type"] == "hard")
                    if hard < MIN_HARD:
                        totals["kept_old"] += 1
                        print(f"  NOT SAVED: only {hard} hard skills; old skills kept")
                    else:
                        n_saved = save_skills(db, job, kept, JOB_EVIDENCE_VERSION)
                        totals["saved"] += 1
                        print(f"  SAVED {n_saved} skills (old ones backed up in {BACKUP})")
                for k in kept + rejected:
                    w.writerow([date.today().isoformat(), job.job_id, job.source, job.job_title, k["skill"],
                                "keep" if k in kept else "reject: " + k["reason"], k.get("type"), k.get("level"),
                                k.get("level_cue"), k.get("match_score"), k.get("alternative_group", ""),
                                k.get("evidence_quote")])
        if args.repeat > 1:
            print("\nStability across runs (Jaccard = shared / all, 1.0 = identical):")

            def stability(sets):
                jac = [len(a & b) / max(len(a | b), 1) for x, a in enumerate(sets) for b in sets[x + 1:]]
                always = set.intersection(*sets) if sets else set()
                return f"sizes {[len(x) for x in sets]}, mean Jaccard {sum(jac) / max(len(jac), 1):.2f}, in every run {len(always)}"
            for job in jobs:
                print(f"  {job.job_title[:50]:<50}")
                print(f"    all hard skills:                {stability(runs.get(job.id, []))}")
                print(f"    required + unspecified (the %): {stability(core_runs.get(job.id, []))}")
        n = totals["kept"] + totals["rejected"]
        print(f"\n{len(jobs)} ads: {n} skills returned, {totals['kept']} kept, {totals['rejected']} rejected "
              f"({round(100 * totals['rejected'] / max(n, 1))}%), {round(totals['kept'] / (len(jobs) * args.repeat), 1)} kept per ad, "
              f"{round(totals['units'] / (len(jobs) * args.repeat), 1)} hard-skill requirements per ad (either-or group = 1; "
              f"{totals['grouped']} skills in groups), {totals['pass2']} kept skills found only by the 2nd pass, "
              f"level cue disagrees on {totals['conflict']}; "
              f"old extraction had {totals['old']} skills. Details in {out}")
        if args.save:
            print(f"Saved: {totals['saved']} jobs; kept old skills: {totals['kept_old']}. Restart uvicorn to see them.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
