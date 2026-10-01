"""
Stage 1 dry run: extract job skills WITH evidence quotes and check them, next to the skills stored now.
Writes nothing to the database. Uses Groq (about 2-4k tokens per ad).

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

from app.database import SessionLocal
from app.models.job import Job, JobSkill
from app.services.evidence import verify_skills
from app.services.skill_names import canonical_key

OUT = "../docs/evidence/stage1_dryrun_{version}.csv"     # one file per prompt version
CSV_2024 = "data/jobstreet_clean.csv"
LIVE_CACHE = "data/live_jobs_cache.json"


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
    ap.add_argument("--no-glean", action="store_true", help="one pass only (no 'what did you miss' pass)")
    ap.add_argument("--print-ad", action="store_true", help="also print the ad text that was checked")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        jobs = []
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
        from app.nlp.skill_extractor import JOB_EVIDENCE_VERSION
        out = OUT.format(version=JOB_EVIDENCE_VERSION.split(":")[-1])
        totals = {"kept": 0, "rejected": 0, "conflict": 0, "old": 0, "grouped": 0, "units": 0, "pass2": 0}
        new_file = not os.path.exists(out)
        with open(out, "a", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            if new_file:
                w.writerow(["date", "job_id", "source", "job_title", "skill", "result", "type", "level",
                            "level_cue", "match_score", "alternative_group", "evidence_quote"])
            runs = {}                      # job id -> hard-skill keys of each run (--repeat)
            for job, r in [(j, r) for j in jobs for r in range(args.repeat)]:
                text = full.get(job.job_id) or job.description or ""
                stored = len(job.description or "")
                extra = f", stored {stored}" if len(text) != stored else ""
                print(f"\n=== {job.job_title} ({job.company}) [{job.source}, {len(text)} chars{extra}{f', run {r + 1}/{args.repeat}' if args.repeat > 1 else ''}]")
                if args.print_ad and r == 0:
                    print("----- ad text -----\n" + text + "\n-------------------")
                items = extractor.extract_job_skills_with_evidence(job.job_title, text, glean=not args.no_glean)
                kept, rejected = verify_skills(items, text)
                for k in kept:
                    flag = f"  <- cue says {k['level_cue']}" if k["level_conflict"] else ""
                    if k.get("pass") == 2:
                        flag += "  (2nd pass)"
                    if k["alternative_group"]:
                        flag += f"  [either: {k['alternative_group']}]"
                    print(f"  KEEP   {k['skill'][:30]:<30} {k['type']:<5} {k['level']:<11}{flag}")
                    print(f"         \"{k['evidence_quote'][:90]}\"")
                for r in rejected:
                    print(f"  REJECT {r['skill'][:30]:<30} ({r['reason']}, match {r['match_score']}) \"{r.get('evidence_quote', '')[:60]}\"")
                old = [s for (s,) in db.query(JobSkill.skill_name).filter(JobSkill.job_id == job.id)]
                old_keys = {canonical_key(s): s for s in old}
                new_keys = {canonical_key(k["skill"]): k["skill"] for k in kept}
                runs.setdefault(job.id, []).append({canonical_key(k["skill"]) for k in kept if k["type"] == "hard"})
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
                for k in kept + rejected:
                    w.writerow([date.today().isoformat(), job.job_id, job.source, job.job_title, k["skill"],
                                "keep" if k in kept else "reject: " + k["reason"], k.get("type"), k.get("level"),
                                k.get("level_cue"), k.get("match_score"), k.get("alternative_group", ""),
                                k.get("evidence_quote")])
        if args.repeat > 1:
            print("\nStability across runs (hard skills; Jaccard = shared / all, 1.0 = identical):")
            for job in jobs:
                sets = runs.get(job.id, [])
                jac = [len(a & b) / max(len(a | b), 1) for x, a in enumerate(sets) for b in sets[x + 1:]]
                always = set.intersection(*sets) if sets else set()
                print(f"  {job.job_title[:50]:<50} sizes {[len(x) for x in sets]}, mean Jaccard "
                      f"{sum(jac) / max(len(jac), 1):.2f}, in every run {len(always)}")
        n = totals["kept"] + totals["rejected"]
        print(f"\n{len(jobs)} ads: {n} skills returned, {totals['kept']} kept, {totals['rejected']} rejected "
              f"({round(100 * totals['rejected'] / max(n, 1))}%), {round(totals['kept'] / (len(jobs) * args.repeat), 1)} kept per ad, "
              f"{round(totals['units'] / (len(jobs) * args.repeat), 1)} hard-skill requirements per ad (either-or group = 1; "
              f"{totals['grouped']} skills in groups), {totals['pass2']} kept skills found only by the 2nd pass, "
              f"level cue disagrees on {totals['conflict']}; "
              f"old extraction had {totals['old']} skills. Details in {out}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
