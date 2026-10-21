"""
What do real ICT job ads ask for besides skills? (21 Oct, for the "Profile strength" line on My Profile, her question:
should its order follow the student's target job category or one general ranking?)

For every job ad in the database (the 2024 JobStreet set and the live jobs; SkillMap's own posts are left out: too
few), counts how many ads in each job category (subcategory, the same as the career goal) mention each kind of
profile evidence:
  work experience / internship, fresh graduates welcome, a degree, a CGPA, a certification, a portfolio or GitHub,
  leadership, English, Malay, Mandarin / Chinese
by fixed word rules (no AI). The rules are rough: an ad that says "no experience needed" still counts as mentioning
experience, so read the numbers as "how often ads bring it up", not as an exact requirement rate.

Run from backend/ with the venv active:  python scripts/evaluation/profile_items_in_ads.py
Writes docs/evidence/profile_items_in_ads.csv and prints the table.
"""
import csv
import os
import re
import sys
from collections import Counter, defaultdict

sys.path.insert(0, ".")
from app.database import SessionLocal  # noqa: E402
from app.models.job import Job  # noqa: E402

RULES = {
    "work experience or internship": r"\binternships?\b|\bindustrial (training|attachment|placement)\b|\b\d+\s*\+?\s*(-\s*\d+\s*)?years?\b[^.\n]{0,40}\bexperience\b|\bworking experience\b|\bexperience (in|with|of)\b",
    "fresh graduates welcome": r"\bfresh (graduates?|grads?)\b",
    "degree or diploma": r"\b(degree|bachelor'?s?|diploma)\b",
    "CGPA": r"\bc?gpa\b",
    "certification": r"\bcertifi(cation|cations|ed|cate)\b",
    "portfolio or GitHub": r"\bportfolio\b|\bgithub\b",
    "leadership": r"\bleadership\b|\blead(ing)? (a )?team\b",
    "English": r"\benglish\b",
    "Malay": r"\b(malay|bahasa (malaysia|melayu)|\bbm\b)\b",
    "Mandarin or Chinese": r"\b(mandarin|chinese|cantonese)\b",
}
PATTERNS = {k: re.compile(v, re.I) for k, v in RULES.items()}
MIN_ADS = 30          # categories with fewer ads are grouped as "Other categories" (too few to compare)


def main():
    db = SessionLocal()
    try:
        rows = db.query(Job.subcategory, Job.description).filter(Job.source.in_(("dataset", "live")),
                                                                  Job.country == "MY").all()
    finally:
        db.close()
    ads = Counter()
    hits = defaultdict(Counter)
    for sub, text in rows:
        text = text or ""
        if not text.strip():
            continue
        for name in (sub or "Other categories", "All ICT ads"):
            ads[name] += 1
            for item, pat in PATTERNS.items():
                if pat.search(text):
                    hits[name][item] += 1
    small = [c for c in ads if c != "All ICT ads" and ads[c] < MIN_ADS]
    for c in small:          # fold small categories together
        ads["Other categories"] += ads.pop(c)
        for item, n in hits.pop(c).items():
            hits["Other categories"][item] += n
    order = ["All ICT ads"] + sorted((c for c in ads if c != "All ICT ads"), key=lambda c: -ads[c])
    out = os.path.join("..", "docs", "evidence", "profile_items_in_ads.csv")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["category", "ads", *RULES])
        for c in order:
            w.writerow([c, ads[c], *[round(100 * hits[c][i] / ads[c], 1) for i in RULES]])
    width = max(len(c) for c in order)
    print(f"{'category':{width}}  ads  " + "  ".join(f"{i[:12]:>12}" for i in RULES))
    for c in order:
        print(f"{c:{width}}  {ads[c]:>4} " + "  ".join(f"{100 * hits[c][i] / ads[c]:>11.0f}%" for i in RULES))
    print(f"\nShare of ads that mention each item. Saved to {out}")


if __name__ == "__main__":
    main()
