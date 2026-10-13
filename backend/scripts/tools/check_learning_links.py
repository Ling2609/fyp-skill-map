"""Open every link in data/learning_resources.json and mark it ok / not ok with today's date, so the AI Assistant
only gives students links that work (13 Oct 2026). Links that fail are kept in the file but never shown.

Run from backend/ with the venv active (needs internet; takes about a minute):
    python scripts/tools/check_learning_links.py              check every link, save the results
    python scripts/tools/check_learning_links.py --coverage   also list the skills live jobs ask for most that have
                                                              no resources yet (reads your database)

Two checks per link (13 Oct; references.md "Learning plan: link checks"):
1. the page opens (HTTP status below 400, after redirects), and
2. it is not a "soft 404": a page that opens but is really "Page not found" or an error (its title says so).
A link passing both is marked ok. The page title is saved too; when it doesn't mention the skill (e.g. a redirect to a
site's home page) the link is listed under "Check by hand". Open those, and a few others, then commit
data/learning_resources.json.
"""
import html
import json
import re
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


# Pages a site shows robots instead of the real page (Cloudflare, reCAPTCHA, Akamai): the link may be fine, so it is
# "blocked", not failed; open it yourself and put the date in the CSV's checked_by_hand column (13 Oct, her first run:
# Linux Journey, Tableau, Kaggle)
BLOCKED = re.compile(r"just a moment|checking your browser|captcha|access denied|attention required|are you a robot", re.I)
SOFT_404 = re.compile(r"\b(404|not found|page (cannot|can't|could not) be found|no longer available|server error|something went wrong)\b", re.I)


def check(url: str) -> tuple[bool | None, str, str]:
    """(works, what happened, page title): True / False, or None when the site blocks robots. A page that opens
    after redirects counts as working; the final address is shown so a link that now lands somewhere else (e.g. a
    home page) can be spotted."""
    try:
        r = requests.get(url, headers=HEADERS, timeout=20, allow_redirects=True)
    except requests.RequestException as e:
        return False, type(e).__name__, ""
    note = f"HTTP {r.status_code}"
    if r.url.rstrip("/") != url.rstrip("/"):
        note += f" -> {r.url}"
    m = re.search(r"<title[^>]*>(.*?)</title>", r.text[:300_000], re.I | re.S)
    title = " ".join(html.unescape(m.group(1)).split()) if m else ""
    if BLOCKED.search(title) or r.status_code in (403, 429):
        return None, note + f", blocked: {title or 'no title'}", title
    if r.status_code < 400 and SOFT_404.search(title):
        return False, note + f" but the page says: {title}", title
    return r.status_code < 400, note, title


def mentions_skill(entry: dict, resource: dict, title: str) -> bool:
    words = [entry["skill"], *entry.get("aliases", []), resource["provider"]]
    return any(w.lower() in title.lower() for w in words if len(w) > 1)


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
        tag = {True: "ok  ", False: "FAIL", None: "BLOCKED"}[results[url][0]]
        print(f"  {tag} {url}  ({results[url][1]})")
        time.sleep(0.5)                 # be polite to the sites
    by_hand = []
    for e in data["skills"]:
        for r in e["resources"]:
            ok, _, title = results[r["url"]]
            r["ok"], r["checked"], r["page_title"] = ok, today, title
            if ok and not mentions_skill(e, r, title):
                by_hand.append(f"{e['skill']}: {r['url']}  (title: {title or 'none'})")
    FILE.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    bad = [u for u, (ok, _, _) in results.items() if ok is False]
    blocked = [u for u, (ok, _, _) in results.items() if ok is None]
    print(f"\n{len(urls) - len(bad) - len(blocked)} of {len(urls)} links work. Saved to {FILE.name}.")
    if bad:
        print("Not shown to students until fixed (change the url in data/learning_resources_curated.csv, run "
              "scripts/pipeline/build_learning_resources.py, then this again):")
        for u in bad:
            print("  ", u, f"({results[u][1]})")
    if blocked:
        print("\nBlocked (the site stops robots, so it couldn't be checked). Open each one; if it works, put today's date "
              "in its checked_by_hand column in data/learning_resources_curated.csv and run "
              "scripts/pipeline/build_learning_resources.py:")
        for u in blocked:
            print("  ", u, f"({results[u][1]})")
    if by_hand:
        print("\nCheck by hand (the page title doesn't mention the skill; still shown to students):")
        for line in by_hand:
            print("  ", line)
    if "--coverage" in sys.argv:
        coverage()


if __name__ == "__main__":
    main()
