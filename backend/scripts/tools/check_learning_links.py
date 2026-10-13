"""Open every link in data/learning_resources.json and mark it ok / not ok with today's date, so the AI Assistant
only gives students links that work (13 Oct 2026). Links that fail are kept in the file but never shown.

Run from backend/ with the venv active (needs internet; takes about a minute):
    python scripts/tools/check_learning_links.py              check every link, save the results
    python scripts/tools/check_learning_links.py --coverage   also list the skills live jobs ask for most that have
                                                              no resources yet (reads your database)

Then open a few of the links yourself to check they teach the skill (the script only checks that the page opens),
and commit data/learning_resources.json.
"""
import json
import sys
import time
from collections import Counter
from datetime import date
from pathlib import Path

import requests

BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND))
FILE = BACKEND / "data" / "learning_resources.json"
# Some sites refuse requests that don't look like a browser
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                         "Chrome/126.0 Safari/537.36", "Accept-Language": "en"}


def check(url: str) -> tuple[bool, str]:
    """(works, what happened). A page that opens after redirects counts as working; the final address is shown
    so a link that now lands somewhere else (e.g. a home page) can be spotted."""
    try:
        r = requests.get(url, headers=HEADERS, timeout=20, allow_redirects=True)
    except requests.RequestException as e:
        return False, type(e).__name__
    note = f"HTTP {r.status_code}"
    if r.url.rstrip("/") != url.rstrip("/"):
        note += f" -> {r.url}"
    return r.status_code < 400, note


def coverage():
    """The hard skills live jobs ask for most, and whether the list has resources for them."""
    from app.database import SessionLocal
    from app.models.job import Job, JobSkill
    from app.services import learning_resources as L
    L.reload()
    db = SessionLocal()
    try:
        rows = (db.query(JobSkill.skill_name).join(Job, Job.id == JobSkill.job_id)
                .filter(Job.source == "live", JobSkill.skill_type == "hard", JobSkill.level.in_(("required", "unspecified"))).all())
    finally:
        db.close()
    counts = Counter(name.strip().lower() for (name,) in rows)
    print(f"\nTop 40 required skills in live jobs ({sum(counts.values())} skill mentions):")
    for name, n in counts.most_common(40):
        entry = L.find_skills(name)
        print(f"  {n:4}  {name:32} {'-> ' + entry[0]['skill'] if entry else 'NO RESOURCES'}")


def main():
    data = json.loads(FILE.read_text(encoding="utf-8"))
    today, results = date.today().isoformat(), {}
    urls = sorted({r["url"] for e in data["skills"] for r in e["resources"]})
    print(f"Checking {len(urls)} links...")
    for url in urls:
        results[url] = check(url)
        print(f"  {'ok  ' if results[url][0] else 'FAIL'} {url}  ({results[url][1]})")
        time.sleep(0.5)                 # be polite to the sites
    for e in data["skills"]:
        for r in e["resources"]:
            r["ok"], r["checked"] = results[r["url"]][0], today
    FILE.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    bad = [u for u, (ok, _) in results.items() if not ok]
    print(f"\n{len(urls) - len(bad)} of {len(urls)} links work. Saved to {FILE.name}.")
    if bad:
        print("Not shown to students until fixed (change the url in the file, then run this again):")
        for u in bad:
            print("  ", u, f"({results[u][1]})")
    if "--coverage" in sys.argv:
        coverage()


if __name__ == "__main__":
    main()
