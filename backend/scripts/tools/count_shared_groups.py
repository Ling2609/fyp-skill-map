"""
How often does an ad offer the same skill in two different either-or choices? (F25 rule 3, read-only, no Groq)

Example: "Python or Java ..." and later "Python or C#". A stored skill row holds one group label, so
merge_mentions() keeps Python in the first group only, and a Python-only student can get a false gap on the
second choice. This script counts how many ads could have that, to report the limitation with a number.

Method (an upper bound, not an exact count): for each ad, a "choice sentence" is a sentence with a choice word
(the same words check_groups() accepts: or, such as, e.g., equivalent, either, one of, "/") that names at least
two of that ad's stored skills (whole words, any case). An ad counts if one skill appears in two choice
sentences. Not every choice sentence is a real either-or requirement, so the true rate is lower. Reported
twice: with "/" as a choice word (as check_groups) and without it ("CI/CD", "TCP/IP" are not choices).

The old extractor's skill names are used; the old first-mention dedupe never touched the ad text, so the ads
themselves still show every sentence.

Usage (from backend/, venv active):
  python scripts/tools/count_shared_groups.py              # live jobs (full text from data/live_jobs_cache.json)
  python scripts/tools/count_shared_groups.py --dataset    # 2024 ads too (full text from data/jobstreet_clean.csv)
  add --examples 10 to print more examples (default 5)
"""
import argparse
import hashlib
import json
import os
import re
import sys

sys.path.append(".")

from app.database import SessionLocal
from app.models.job import Job, JobSkill
from app.services.evidence import _CHOICE, _segments

LIVE_CACHE = "data/live_jobs_cache.json"
CSV_2024 = "data/jobstreet_clean.csv"
CHOICE_NO_SLASH = re.compile(r"\b(or|such as|e\.g\.?|eg|similar|equivalent|either|any of|one of)\b")


def full_text_live() -> dict:
    """job_ref -> full ad text from the JSearch cache (same id rule as fetch_live_jobs.py)."""
    if not os.path.exists(LIVE_CACHE):
        return {}
    with open(LIVE_CACHE, encoding="utf-8") as f:
        cache = json.load(f)
    out = {}
    for results in cache.values():
        for j in results or []:
            if j.get("job_id") and j.get("job_description"):
                out["live_" + hashlib.sha1(j["job_id"].encode()).hexdigest()[:16]] = j["job_description"]
    return out


def full_text_2024() -> dict:
    if not os.path.exists(CSV_2024):
        return {}
    import pandas as pd
    df = pd.read_csv(CSV_2024, usecols=["job_id", "descriptions"])
    return {str(i): str(d) for i, d in zip(df["job_id"], df["descriptions"])}


def name_pattern(name: str):
    return re.compile(rf"(?<![\w+#]){re.escape(name.lower())}(?![\w+#])")


def shared(text: str, skills: list[str], choice) -> list[tuple[str, str, str]]:
    """(skill, sentence A, sentence B) for each skill named in two choice sentences of this ad."""
    pats = [(s, name_pattern(s)) for s in skills if len(s.strip()) >= 2]
    where: dict[str, list[str]] = {}
    for _, sentence in _segments(text):
        low = sentence.lower()
        if not choice.search(low):
            continue
        named = {s for s, p in pats if p.search(low)}
        if len(named) >= 2:
            for s in named:
                where.setdefault(s, []).append(sentence)
    return [(s, v[0], v[1]) for s, v in where.items() if len(v) >= 2]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", action="store_true", help="also count the 2024 JobStreet ads")
    ap.add_argument("--examples", type=int, default=5)
    args = ap.parse_args()

    db = SessionLocal()
    try:
        sources = [("live", full_text_live())]
        if args.dataset:
            sources.append(("dataset", full_text_2024()))
        for source, full in sources:
            q = db.query(Job).filter(Job.source == "live") if source == "live" else db.query(Job).filter(Job.source != "live")
            jobs = q.order_by(Job.id).all()
            skills_by_job: dict[int, list[str]] = {}
            for job_id, name in db.query(JobSkill.job_id, JobSkill.skill_name).filter(JobSkill.job_id.in_([j.id for j in jobs])):
                skills_by_job.setdefault(job_id, []).append(name)
            n_full = sum(1 for j in jobs if j.job_id in full)
            counts = {"with /": [0, 0], "without /": [0, 0]}     # [ads with a choice sentence, ads with a shared skill]
            examples = []
            for j in jobs:
                text = full.get(j.job_id) or j.description or ""
                skills = sorted(set(skills_by_job.get(j.id, [])), key=len, reverse=True)
                for label, choice in (("with /", _CHOICE), ("without /", CHOICE_NO_SLASH)):
                    has_choice = any(choice.search(s.lower()) and sum(bool(name_pattern(k).search(s.lower())) for k in skills) >= 2
                                     for _, s in _segments(text))
                    hits = shared(text, skills, choice) if has_choice else []
                    counts[label][0] += has_choice
                    counts[label][1] += bool(hits)
                    if label == "without /" and hits and len(examples) < args.examples:
                        examples.append((j.job_title, j.company, hits[0]))
            print(f"\n=== {source}: {len(jobs)} ads ({n_full} with full text, the rest use the stored cut text)")
            for label, (with_choice, with_shared) in counts.items():
                print(f"  choice words {label:<10} ads with a choice sentence: {with_choice:>5}   "
                      f"ads where one skill is in two choices: {with_shared:>4} "
                      f"({100 * with_shared / max(len(jobs), 1):.1f}% of all ads, upper bound)")
            for title, company, (skill, a, b) in examples:
                print(f"\n  {title} ({company}): \"{skill}\"\n    1) {a[:110]}\n    2) {b[:110]}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
