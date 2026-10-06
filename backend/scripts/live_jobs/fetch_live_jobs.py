"""
Live Job Fetcher (JSearch API)
==============================
Fetches current ICT job postings (mainly Malaysia, some Singapore) from the
JSearch API, keeps only good-quality ones, stores them in the jobs table and
extracts their skills with the Stage 1 evidence extractor (gpt-oss-120b via Groq):
each skill comes with a quote from the ad (checked), a type (hard / soft), a level
(required / preferred / trained / unspecified) and either-or groups, exactly as
scripts/pipeline/extract_job_skills_v2.py saves them (app/services/job_skill_store.py).
A job is saved only with at least 3 checked hard skills. The free Groq tier (200k tokens/day)
covered about 45 ads a day in the 1 Oct dry runs; at Groq's daily limit the run stops cleanly
and --use-cache carries on the next day.

Quality rules (see references.md → Data Limitations):
  1. Trusted publishers only (allowlist) → no spam/scam job sites
  2. Description ≥ 800 characters     → enough text for skill extraction
  3. Posted within the last month
  4. No duplicates (same job fetched twice is skipped)
  5. ICT job title (e.g. "Electrical Engineer" is skipped before Groq sees it; app/services/job_titles.py)

Needs JSEARCH_KEY in backend/.env (never commit the key).

Usage (from the backend folder):
  python scripts/live_jobs/fetch_live_jobs.py --dry-run --new-only    # fetch ONLY queries not in the cache yet, preview
  python scripts/live_jobs/fetch_live_jobs.py --use-cache             # save + extract skills from the cache (0 credits)
  python scripts/live_jobs/fetch_live_jobs.py --dry-run               # refresh: re-fetch every query (e.g. before the demo)
  python scripts/live_jobs/fetch_live_jobs.py --sync-only --dry-run   # what the sync below would change (0 credits, no Groq)
  python scripts/live_jobs/fetch_live_jobs.py --sync-only             # do it

Sync (6 Oct, every run that is not a dry run, or --sync-only): the cache holds the latest search results, so
  - a saved live job the latest results no longer return is hidden (jobs.gone_at set; kept for the report), and
    shown again if a later refresh returns it: Job Matches shows only the latest ads, like a fresh snapshot.
    Skipped when a query has no results in the cache (a failed search must not hide its jobs);
  - a saved job's apply link moves to the company's own careers site when the results have one (pick_apply_link).

Queries: data/live_job_queries.json, generated from the 2024 JobStreet data by
generate_live_queries.py (the most common ICT roles per subcategory). Regenerate it to change them.

Credits: 1 per page. Malaysia queries fetch 2 pages, Singapore 1 (the generator prints the total,
~53 for the default 25 + 3 queries, of 200/month); --new-only costs only queries not fetched
before; --use-cache costs nothing.
"""

import argparse
import hashlib
import json
import re
import sys
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

import requests

sys.path.append(".")

from app.config import settings
from app.database import SessionLocal
from app.models.job import Job, JobSkill
from app.services.job_keys import job_key
from app.services.job_skill_store import MIN_HARD, check_job_skills, job_skill_rows
from app.services.job_titles import is_ict_title
from app.nlp.skill_extractor import JOB_EVIDENCE_VERSION, SkillExtractor

API_URL = "https://jsearch.p.rapidapi.com/search-v2"
API_HOST = "jsearch.p.rapidapi.com"

MIN_DESCRIPTION_CHARS = 800
MIN_SKILLS = 3                     # a saved job with fewer skill rows = left half-done by an old run → redo
PAGES = {"my": 2, "sg": 1}        # pages per query (10 jobs per page, 1 credit per page)
CACHE_FILE = "data/live_jobs_cache.json"

QUERIES_FILE = "data/live_job_queries.json"   # made by generate_live_queries.py from the 2024 market data


def load_queries() -> list[tuple[str, str, str]]:
    """(search query, country, subcategory to store). The subcategory is the JobStreet ICT
    subcategory the query was generated from, so the Job Matches category chips keep working."""
    try:
        with open(QUERIES_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        sys.exit(f"{QUERIES_FILE} not found. Run: python scripts/live_jobs/generate_live_queries.py --save")
    return [(q["query"], q["country"], q["subcategory"]) for q in data["queries"]]

# Only apply links from these publishers / domains are kept (safety: students click these).
# Decided from the 27 Sep cache: aggregators that only repost snippets (Trabajo.org, JobLeads,
# Jooble, BeBee, Jobrapido, Jobsora, Recruit.net, Expertini) are left out on purpose.
TRUSTED_PUBLISHERS = [
    # job boards
    "linkedin", "jobstreet", "hiredly", "maukerja", "glassdoor", "indeed",
    "mycareersfuture", "careers@gov", "jobsdb", "grabjobs", "foundit", "jobstore",
    # established recruitment agencies
    "randstad", "hays", "michael page", "robert half", "red global", "efinancialcareers",
]
TRUSTED_DOMAINS = [  # company career sites / applicant tracking systems
    "linkedin.com", "jobstreet.com", "hiredly.com", "maukerja.my", "glassdoor.",
    "indeed.com", "mycareersfuture.gov.sg", "careers.gov.sg", "foundit.",
    "myworkdayjobs.com", "eightfold.ai", "greenhouse.io", "lever.co",
    "smartrecruiters.com", "successfactors.", "oraclecloud.com", "taleo.net",
]
BLOCKED_DOMAINS = ["liveblog365", "blogspot.", "wordpress.com", "expertini"]  # spam seen in testing
BLOCKED_PUBLISHERS = [  # snippet-only aggregators: never trusted, whatever the other rules say
    "trabajo", "jobleads", "jooble", "bebee", "jobrapido", "jobsora", "recruit.net", "expertini",
]


def is_trusted(publisher: str, url: str, employer: str = "") -> bool:
    pub = (publisher or "").lower()
    domain = urlparse(url or "").netloc.lower()
    if any(b in domain for b in BLOCKED_DOMAINS) or any(b in pub for b in BLOCKED_PUBLISHERS):
        return False
    if any(t in pub for t in TRUSTED_PUBLISHERS) or any(d in domain for d in TRUSTED_DOMAINS):
        return True
    # The company's own careers site, e.g. "Careers At Mastercard", "Cisco Careers", "TNG EWallet"
    if "careers" in pub and "@" not in pub:
        return True
    first_word = (employer or "").lower().split(" ")[0] if employer else ""
    return len(first_word) >= 3 and first_word in pub


# The company's own posting (6 Oct): its careers site, or the hiring system it runs. It is the original ad, taken
# down first when the job closes, while board copies (LinkedIn, Indeed...) can stay up for days (references.md,
# "Closed jobs"). In the 5 Oct cache 81 of 918 jobs had one; JSearch's own "is_direct" flag was false for all.
ATS_DOMAINS = ["myworkdayjobs.com", "greenhouse.io", "lever.co", "smartrecruiters.com", "successfactors.",
               "oraclecloud.com", "taleo.net", "eightfold.ai"]
JOB_BOARD_DOMAINS = ["linkedin.", "jobstreet.", "indeed.", "glassdoor.", "hiredly.", "maukerja.", "mycareersfuture.",
                     "careers.gov.sg", "foundit.", "jobsdb.", "grabjobs.", "jobstore.", "accaglobal.", "jobleads.",
                     "jooble.", "trabajo.", "bebee.", "jobrapido.", "jobsora.", "recruit.net", "expertini."]
GENERIC_WORDS = {"malaysia", "singapore", "global", "international", "group", "holdings", "berhad", "sdn", "bhd",
                 "pte", "ltd", "limited", "technologies", "technology", "solutions", "services", "systems", "digital",
                 "consulting", "asia", "pacific", "company", "corporation", "inc", "the", "and", "labs", "plc"}


def is_company_own(url: str, employer: str) -> bool:
    """The link is on the employer's own site: an ATS, or a web address holding the company's name
    ("careers.malaysiaairports.com.my" for Malaysia Airports, "careers.nttdata.com" for NTT DATA)."""
    host = urlparse(url or "").netloc.lower()
    if not host or any(b in host for b in JOB_BOARD_DOMAINS + BLOCKED_DOMAINS):
        return False
    if any(a in host for a in ATS_DOMAINS):
        return True
    name = clean_company(employer).lower()
    compact = re.sub(r"[^a-z0-9]", "", name)
    words = [w for w in re.findall(r"[a-z0-9]+", name) if len(w) >= 4 and w not in GENERIC_WORDS]
    return (len(compact) >= 4 and compact in host.replace(".", "").replace("-", "")) or any(w in host for w in words)


def pick_apply_link(job: dict) -> tuple[str | None, str | None]:
    """Return (url, publisher) of the apply option to show, else (None, None): the company's own site when the
    results have one, otherwise the first trusted option (as before)."""
    employer = job.get("employer_name") or ""
    options = [(job.get("job_apply_link"), job.get("job_publisher"))]
    options += [(o.get("apply_link"), o.get("publisher")) for o in (job.get("apply_options") or [])]
    for url, publisher in options:
        if url and is_company_own(url, employer):
            host = urlparse(url).netloc.lower()
            # "Apply on Workday" says nothing to a student: name the company for a hiring system
            return url, (f"{clean_company(employer)} careers" if any(a in host for a in ATS_DOMAINS) else publisher)
    for url, publisher in options:
        if url and is_trusted(publisher, url, employer):
            return url, publisher
    return None, None


def job_location(job: dict, country: str) -> str:
    return ", ".join(x for x in [job.get("job_city"), job.get("job_state")] if x) \
        or ("Malaysia" if country == "my" else "Singapore")


def job_ref_of(job: dict, url: str | None = None) -> str:
    """Stable, URL-safe id (JSearch ids contain / + =)."""
    return "live_" + hashlib.sha1((job.get("job_id") or url or "").encode()).hexdigest()[:16]


def format_salary(job: dict) -> str | None:
    lo, hi = job.get("job_min_salary"), job.get("job_max_salary")
    if not lo and not hi:
        return None
    cur = {"MYR": "RM", "SGD": "S$"}.get(job.get("job_salary_currency") or "", job.get("job_salary_currency") or "")
    period = (job.get("job_salary_period") or "").lower()
    per = {"month": " per month", "year": " per year", "hour": " per hour"}.get(period, "")
    fmt = lambda v: f"{cur} {int(v):,}".strip()
    return f"{fmt(lo)} - {fmt(hi)}{per}" if lo and hi else f"{fmt(lo or hi)}{per}"


def parse_date(value: str | None):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def fetch(query: str, country: str) -> list[dict] | None:
    """Call JSearch; retry up to 3 times on timeouts.
    Returns None if the call failed, so the caller knows not to cache it
    (an empty list means the API worked but found no jobs)."""
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
            return None
        try:
            data = r.json().get("data")
        except ValueError:
            print(f"  ! response was not JSON: {r.text[:200]}")
            return None
        return data if isinstance(data, list) else (data or {}).get("jobs", [])
    print("  ! giving up on this query")
    return None


def clean_company(name: str) -> str:
    """Workday sometimes prefixes an internal code, e.g. '583000 Motorola Solutions'."""
    return re.sub(r"^\d+\s+", "", (name or "").strip())


def load_cache() -> dict:
    try:
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def sync_saved_jobs(db, cache: dict, queries: list[tuple[str, str, str]], dry_run: bool):
    """Saved live jobs vs the latest search results (the cache): hide the ones no longer returned, show again the
    ones returned again, and move apply links to the company's own site. Prints every change."""
    missing = [q for q, _, _ in queries if q not in cache]   # never fetched (failed calls are not cached)
    country_of = {q: c for q, c, _ in queries}
    seen, links = set(), {}
    # Every search in the cache counts, also ones no longer in the query list (the 27 Sep set): a job is hidden
    # because the latest results no longer return it, never because the query list changed. A full refresh
    # drops searches that are not in the list any more (run), so their jobs are judged by the new searches.
    for query, results in cache.items():
        country = country_of.get(query) or ("sg" if "singapore" in query.lower() else "my")
        for j in results or []:
            url, publisher = pick_apply_link(j)
            ids = {job_ref_of(j, url), job_key(j.get("job_title") or "", clean_company(j.get("employer_name")),
                                               job_location(j, country))}
            seen |= ids
            if url:
                for i in ids:
                    links.setdefault(i, (url, publisher))
    now = datetime.now(timezone.utc)
    hidden, back, relinked = [], [], []
    for job in db.query(Job).filter(Job.source == "live").order_by(Job.id):
        ids = {job.job_id, job_key(job.job_title, job.company, job.location)}
        found = bool(ids & seen)
        if not found and job.gone_at is None and not missing:
            hidden.append(job)
            if not dry_run:
                job.gone_at = now
        elif found and job.gone_at is not None:
            back.append(job)
            if not dry_run:
                job.gone_at = None
        link = next((links[i] for i in ids if i in links), None)
        if found and link and (link[0], link[1]) != (job.source_url, job.publisher) and is_company_own(link[0], job.company):
            relinked.append((job, job.publisher, link[1]))
            if not dry_run:
                job.source_url, job.publisher = link
    if not dry_run:
        db.commit()
    print("\n" + "=" * 60)
    print(f"SYNC with the latest search results{' (dry run: nothing saved)' if dry_run else ''}")
    print("=" * 60)
    if missing:
        print(f"  Not hiding anything: {len(missing)} queries are not in the cache "
              f"(e.g. '{missing[0]}'); a failed search must not hide its jobs")
    for job in hidden:
        print(f"  HIDE   {job.job_title[:55]} | {job.company} (not in the latest results)")
    for job in back:
        print(f"  SHOW   {job.job_title[:55]} | {job.company} (returned again)")
    for job, old, new in relinked:
        print(f"  LINK   {job.job_title[:55]} | {job.company}: {old} -> {new}")
    print(f"  {'Would hide' if dry_run else 'Hidden'}: {len(hidden)}   {'would show again' if dry_run else 'shown again'}: "
          f"{len(back)}   apply link -> company site: {len(relinked)}")


def run(dry_run: bool, use_cache: bool, new_only: bool, sync_only: bool = False):
    queries = load_queries()
    # Always load the old cache, so a failed query in a full refresh keeps its previous results
    cache = load_cache()
    if use_cache:
        if not cache:
            sys.exit(f"No cache found at {CACHE_FILE}. Run with --dry-run first.")
        print(f"Using cached API results from {CACHE_FILE} (0 credits)")
    elif not settings.jsearch_key:
        sys.exit("JSEARCH_KEY is missing. Add JSEARCH_KEY=your-key to backend/.env first.")
    elif not new_only:
        # Full refresh: searches no longer in the query list are dropped, so they cannot keep old jobs visible
        old = [q for q in cache if q not in {q for q, _, _ in queries}]
        if old:
            print(f"Full refresh: {len(old)} searches no longer in the query list are dropped from the cache")
            cache = {q: r for q, r in cache.items() if q not in old}
    if new_only and not use_cache:
        missing = [q for q, _, _ in queries if q not in cache]
        print(f"--new-only: {len(missing)} new queries to fetch, {len(queries) - len(missing)} reused from cache")

    if sync_only:
        if not cache:
            sys.exit(f"No cache found at {CACHE_FILE}. Run with --dry-run first.")
        db = SessionLocal()
        try:
            sync_saved_jobs(db, cache, queries, dry_run)
        finally:
            db.close()
        return

    extractor = None if dry_run else SkillExtractor()
    db = SessionLocal()
    stats = {"fetched": 0, "not_ict": 0, "untrusted": 0, "short": 0, "duplicate": 0, "saved": 0, "no_skills": 0,
             "rejected": 0}
    groq_limit = False
    seen = set()           # job_ref already handled this run
    seen_titles = set()    # job_key (title, company, location): the same posting can come back with different ids
    # Live jobs already in the database, by job_key → job_ref. A posting fetched again on a
    # later run (or via another publisher) gets a new id; this stops it being saved twice (F9)
    saved_keys = {job_key(t, c, l): ref for ref, t, c, l in
                  db.query(Job.job_id, Job.job_title, Job.company, Job.location).filter(Job.source == "live")}
    credits = 0

    try:
        for query, country, subcategory in queries:
            if groq_limit:
                break
            print(f"\n=== {query} ({country.upper()}) ===")
            if use_cache or (new_only and query in cache):
                results = cache.get(query, [])
            else:
                results = fetch(query, country)
                credits += PAGES[country]
                if results is None:
                    # Failed call: keep any older cached results and retry this query next run
                    print("  ! skipped (not cached, will be retried next run)")
                    continue
                cache[query] = results
            for j in results:
                stats["fetched"] += 1
                title = j.get("job_title") or ""
                desc = j.get("job_description") or ""

                if not is_ict_title(title):
                    stats["not_ict"] += 1
                    print(f"  - not ICT, skipped: {title[:55]}")
                    continue
                url, publisher = pick_apply_link(j)
                if not url:
                    stats["untrusted"] += 1
                    continue
                if len(desc) < MIN_DESCRIPTION_CHARS:
                    stats["short"] += 1
                    continue

                company = clean_company(j.get("employer_name"))
                job_ref = job_ref_of(j, url)
                location = job_location(j, country)
                title_key = job_key(title, company, location)
                if job_ref in seen or title_key in seen_titles:
                    stats["duplicate"] += 1
                    continue
                if saved_keys.get(title_key, job_ref) != job_ref:
                    stats["duplicate"] += 1  # same job already saved under another id
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

                print(f"  + {title[:55]} | {company} | via {publisher} | {len(desc)} chars")

                if dry_run:
                    stats["saved"] += 1
                    continue

                # Skills first, then the job: an interrupted run never leaves a job without skills
                try:
                    mentions = extractor.extract_job_skills_with_evidence(title, desc)
                except Exception as e:
                    if "tokens per day" in str(e).lower() or "tpd" in str(e).lower():
                        print("\nGroq daily limit reached: stopping. Run the same command with --use-cache "
                              "tomorrow (0 credits); saved jobs are skipped.")
                        groq_limit = True
                        break
                    raise
                checked = check_job_skills(mentions, desc)
                stats["rejected"] += len(checked.rejected)
                if checked.hard < MIN_HARD:
                    print(f"    only {checked.hard} checked hard skills, not saved (will retry next run)")
                    stats["no_skills"] += 1
                    continue

                db_job = Job(
                    job_id=job_ref,
                    job_title=title,
                    company=company,
                    location=location,
                    category="Information & Communication Technology",
                    subcategory=subcategory,
                    salary=format_salary(j),
                    description=desc,   # full text: the evidence check needs the whole ad
                    source="live",
                    source_url=url,
                    publisher=publisher,
                    listing_date=parse_date(j.get("job_posted_at_datetime_utc")),
                    country=country.upper(),
                )
                db.add(db_job)
                db.flush()                                    # gives db_job.id
                db.add_all(job_skill_rows(db_job, checked.kept, JOB_EVIDENCE_VERSION))
                db.commit()                                   # job and skills together
                saved_keys[title_key] = job_ref
                stats["saved"] += 1
                required = [k["skill"] for k in checked.kept if k.get("type") == "hard" and k.get("level") == "required"]
                print(f"    {len(checked.kept)} skills ({checked.hard} hard, {len(required)} required"
                      f"{f', {len(checked.rejected)} unsupported dropped' if checked.rejected else ''}): {required[:5]}")
                time.sleep(2)  # Groq rate limit
        sync_saved_jobs(db, cache, queries, dry_run)
    finally:
        db.close()
        if not use_cache and credits and cache:
            with open(CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(cache, f)
            print(f"\nRaw API results saved to {CACHE_FILE}")

    print("\n" + "=" * 60)
    print("DRY RUN (nothing saved)" if dry_run else "DONE")
    print("=" * 60)
    print(f"  Fetched from API:          {stats['fetched']}")
    print(f"  Dropped, not an ICT title: {stats['not_ict']}")
    print(f"  Dropped, untrusted source: {stats['untrusted']}")
    print(f"  Dropped, short description:{stats['short']:>4}")
    print(f"  Dropped, duplicate:        {stats['duplicate']}")
    if not dry_run:
        print(f"  Dropped, < {MIN_HARD} hard skills:  {stats['no_skills']}")
        print(f"  Unsupported skills dropped:{stats['rejected']:>4}  (quote not in the ad)")
        if groq_limit:
            print("  Stopped early: Groq daily limit")
    print(f"  {'Would save' if dry_run else 'Saved'}:                {stats['saved']}")
    print(f"  API credits used:          {credits}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="preview only, nothing saved to the database")
    parser.add_argument("--use-cache", action="store_true", help="reuse the last API results (0 credits)")
    parser.add_argument("--new-only", action="store_true", help="only call the API for queries not in the cache yet")
    parser.add_argument("--sync-only", action="store_true",
                        help="only sync saved jobs with the cache: hide jobs no longer listed, company apply links")
    args = parser.parse_args()
    run(args.dry_run, args.use_cache or args.sync_only, args.new_only, args.sync_only)   # sync reads the cache only