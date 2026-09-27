"""
Live Job Fetcher (JSearch API)
==============================
Fetches current ICT job postings (mainly Malaysia, some Singapore) from the
JSearch API, keeps only good-quality ones, stores them in the jobs table and
extracts their skills with the same Groq extractor used for the 2024 dataset.

Quality rules (see references.md → Data Limitations):
  1. Trusted publishers only (allowlist) → no spam/scam job sites
  2. Description ≥ 800 characters     → enough text for skill extraction
  3. Posted within the last month
  4. No duplicates (same job fetched twice is skipped)

Needs JSEARCH_KEY in backend/.env (never commit the key).

Usage (from the backend folder):
  python data/scripts/fetch_live_jobs.py --dry-run               # call API, preview, save raw results to cache
  python data/scripts/fetch_live_jobs.py --use-cache             # save + extract skills from the cache (0 credits)
  python data/scripts/fetch_live_jobs.py                         # call API and save in one go

Credits: 1 per page. Malaysia queries fetch 2 pages, Singapore 1 → 27 credits per API run
(of 200/month). Using --use-cache after a dry run costs nothing.
"""

import argparse
import hashlib
import json
import re
import sys
import time
from datetime import datetime
from urllib.parse import urlparse

import requests

sys.path.append(".")

from app.config import settings
from app.database import SessionLocal
from app.models.job import Job, JobSkill
from app.nlp.skill_extractor import SkillExtractor

API_URL = "https://jsearch.p.rapidapi.com/search-v2"
API_HOST = "jsearch.p.rapidapi.com"

MIN_DESCRIPTION_CHARS = 800
MIN_SKILLS = 3                     # fewer than this = extraction failed or incomplete → redo / drop
PAGES = {"my": 2, "sg": 1}        # pages per query (10 jobs per page, 1 credit per page)
CACHE_FILE = "data/live_jobs_cache.json"

# (search query, country, subcategory to store — matches the JobStreet ICT subcategories
#  so the Job Matches category chips keep working)
QUERIES = [
    ("software engineer in Malaysia",            "my", "Engineering - Software"),
    ("graduate software developer in Malaysia",   "my", "Developers/Programmers"),
    ("web developer in Malaysia",                 "my", "Web Development & Production"),
    ("network engineer in Malaysia",              "my", "Engineering - Network"),
    ("system administrator in Malaysia",          "my", "Networks & Systems Administration"),
    ("IT support engineer in Malaysia",           "my", "Help Desk & IT Support"),
    ("data analyst in Malaysia",                  "my", "Database Development & Administration"),
    ("database administrator in Malaysia",        "my", "Database Development & Administration"),
    ("cyber security analyst in Malaysia",        "my", "Security"),
    ("QA test engineer in Malaysia",              "my", "Testing & Quality Assurance"),
    ("business analyst IT in Malaysia",           "my", "Business/Systems Analysts"),
    ("cloud devops engineer in Malaysia",         "my", "Engineering - Software"),
    ("software engineer in Singapore",            "sg", "Engineering - Software"),
    ("network engineer in Singapore",             "sg", "Engineering - Network"),
    ("data analyst in Singapore",                 "sg", "Database Development & Administration"),
    # removed "graduate IT trainee in Singapore": it only returned an HR internship
]

# Only apply links from these publishers / domains are kept (safety: students click these)
TRUSTED_PUBLISHERS = [
    "linkedin", "jobstreet", "hiredly", "maukerja", "glassdoor", "indeed",
    "mycareersfuture", "careers@gov", "jobsdb", "grabjobs",
]
TRUSTED_DOMAINS = [  # company career sites / applicant tracking systems
    "linkedin.com", "jobstreet.com", "hiredly.com", "maukerja.my", "glassdoor.",
    "indeed.com", "mycareersfuture.gov.sg", "careers.gov.sg",
    "myworkdayjobs.com", "eightfold.ai", "greenhouse.io", "lever.co",
    "smartrecruiters.com", "successfactors.", "oraclecloud.com", "taleo.net",
]


def is_trusted(publisher: str, url: str) -> bool:
    pub = (publisher or "").lower()
    domain = urlparse(url or "").netloc.lower()
    return any(t in pub for t in TRUSTED_PUBLISHERS) or any(d in domain for d in TRUSTED_DOMAINS)


def pick_apply_link(job: dict) -> tuple[str | None, str | None]:
    """Return (url, publisher) of the first trusted apply option, else (None, None)."""
    options = [(job.get("job_apply_link"), job.get("job_publisher"))]
    options += [(o.get("apply_link"), o.get("publisher")) for o in (job.get("apply_options") or [])]
    for url, publisher in options:
        if url and is_trusted(publisher, url):
            return url, publisher
    return None, None


def format_salary(job: dict) -> str | None:
    lo, hi = job.get("job_min_salary"), job.get("job_max_salary")
    if not lo and not hi:
        return None
    cur = {"MYR": "RM", "SGD": "S$"}.get(job.get("job_salary_currency") or "", job.get("job_salary_currency") or "")
    period = (job.get("job_salary_period") or "").lower()
    per = {"month": " per month", "year": " per year", "hour": " per hour"}.get(period, "")
    fmt = lambda v: f"{cur} {int(v):,}".strip()
    return f"{fmt(lo)} – {fmt(hi)}{per}" if lo and hi else f"{fmt(lo or hi)}{per}"


def parse_date(value: str | None):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def fetch(query: str, country: str) -> list[dict]:
    """Call JSearch; retry up to 3 times on timeouts. Returns [] instead of crashing."""
    headers = {"x-rapidapi-key": settings.jsearch_key, "x-rapidapi-host": API_HOST}
    params = {"query": query, "country": country, "date_posted": "month", "num_pages": str(PAGES[country])}
    for attempt in range(1, 4):
        try:
            r = requests.get(API_URL, headers=headers, params=params, timeout=90)
        except requests.exceptions.RequestException as e:
            print(f"  ! attempt {attempt} failed ({type(e).__name__}), retrying...")
            time.sleep(5 * attempt)
            continue
        if not r.ok:
            print(f"  ! HTTP {r.status_code}: {r.text[:200]}")
            return []
        data = r.json().get("data")
        return data if isinstance(data, list) else (data or {}).get("jobs", [])
    print("  ! giving up on this query")
    return []


def clean_company(name: str) -> str:
    """Workday sometimes prefixes an internal code, e.g. '583000 Motorola Solutions'."""
    return re.sub(r"^\d+\s+", "", (name or "").strip())


def run(dry_run: bool, use_cache: bool):
    if use_cache:
        try:
            with open(CACHE_FILE, encoding="utf-8") as f:
                cache = json.load(f)
        except FileNotFoundError:
            sys.exit(f"No cache found at {CACHE_FILE}. Run with --dry-run first.")
        print(f"Using cached API results from {CACHE_FILE} (0 credits)")
    else:
        if not settings.jsearch_key:
            sys.exit("JSEARCH_KEY is missing. Add JSEARCH_KEY=your-key to backend/.env first.")
        cache = {}

    extractor = None if dry_run else SkillExtractor()
    db = SessionLocal()
    stats = {"fetched": 0, "untrusted": 0, "short": 0, "duplicate": 0, "saved": 0, "no_skills": 0}
    seen = set()           # job_ref already handled this run
    seen_titles = set()    # (title, company): the same posting can come back with different ids
    credits = 0

    try:
        for query, country, subcategory in QUERIES:
            print(f"\n=== {query} ({country.upper()}) ===")
            if use_cache:
                results = cache.get(query, [])
            else:
                results = fetch(query, country)
                credits += PAGES[country]
                cache[query] = results
            for j in results:
                stats["fetched"] += 1
                title = j.get("job_title") or ""
                desc = j.get("job_description") or ""

                url, publisher = pick_apply_link(j)
                if not url:
                    stats["untrusted"] += 1
                    continue
                if len(desc) < MIN_DESCRIPTION_CHARS:
                    stats["short"] += 1
                    continue

                # Stable, URL-safe id (JSearch ids contain / + =)
                company = clean_company(j.get("employer_name"))
                job_ref = "live_" + hashlib.sha1((j.get("job_id") or url).encode()).hexdigest()[:16]
                title_key = (title.strip().lower(), company.lower())
                if job_ref in seen or title_key in seen_titles:
                    stats["duplicate"] += 1
                    continue
                existing = db.query(Job).filter(Job.job_id == job_ref).first()
                if existing:
                    n_skills = db.query(JobSkill).filter(JobSkill.job_id == existing.id).count()
                    if n_skills >= MIN_SKILLS:
                        stats["duplicate"] += 1  # already done properly
                        continue
                    # Left half-done by an interrupted run (Ctrl+C / rate limit) → redo it
                    print(f"  ~ redoing '{title[:45]}' (only {n_skills} skills saved last time)")
                    if not dry_run:
                        db.query(JobSkill).filter(JobSkill.job_id == existing.id).delete()
                        db.delete(existing)
                        db.commit()
                seen.add(job_ref)
                seen_titles.add(title_key)

                location = ", ".join(x for x in [j.get("job_city"), j.get("job_state")] if x) \
                    or ("Malaysia" if country == "my" else "Singapore")
                print(f"  + {title[:55]} | {company} | via {publisher} | {len(desc)} chars")

                if dry_run:
                    stats["saved"] += 1
                    continue

                db_job = Job(
                    job_id=job_ref,
                    job_title=title,
                    company=company,
                    location=location,
                    category="Information & Communication Technology",
                    subcategory=subcategory,
                    salary=format_salary(j),
                    description=desc[:6000],
                    source="live",
                    source_url=url,
                    publisher=publisher,
                    listing_date=parse_date(j.get("job_posted_at_datetime_utc")),
                    country=country.upper(),
                )
                db.add(db_job)
                db.commit()
                db.refresh(db_job)

                skills = extractor.extract_from_job({"job_title": title, "descriptions": desc})["extracted_skills"]
                if len(skills) < MIN_SKILLS:
                    print(f"    only {len(skills)} skills extracted, removing job (will retry next run)")
                    db.delete(db_job)
                    db.commit()
                    stats["no_skills"] += 1
                    continue
                for name in skills:
                    db.add(JobSkill(job_id=db_job.id, job_ref=job_ref, skill_name=name))
                db.commit()
                stats["saved"] += 1
                print(f"    {len(skills)} skills: {skills[:5]}")
                time.sleep(2)  # Groq rate limit
    finally:
        db.close()
        if not use_cache and cache:
            with open(CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(cache, f)
            print(f"\nRaw API results saved to {CACHE_FILE}")

    print("\n" + "=" * 60)
    print("DRY RUN (nothing saved)" if dry_run else "DONE")
    print("=" * 60)
    print(f"  Fetched from API:          {stats['fetched']}")
    print(f"  Dropped, untrusted source: {stats['untrusted']}")
    print(f"  Dropped, short description:{stats['short']:>4}")
    print(f"  Dropped, duplicate:        {stats['duplicate']}")
    if not dry_run:
        print(f"  Dropped, no skills found:  {stats['no_skills']}")
    print(f"  {'Would save' if dry_run else 'Saved'}:                {stats['saved']}")
    print(f"  API credits used:          {credits}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="preview only, nothing saved to the database")
    parser.add_argument("--use-cache", action="store_true", help="reuse the last API results (0 credits)")
    args = parser.parse_args()
    run(args.dry_run, args.use_cache)