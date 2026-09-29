"""
Generate the live-job search queries from the 2024 JobStreet market data.

JSearch is a search engine: live jobs can only be collected by sending search queries.
Instead of a hand-picked list, the queries are the most common ICT job titles in each
JobStreet ICT subcategory, so every search can be traced back to real market demand:

  1. Read the cleaned JobStreet ICT postings (data/jobstreet_clean.csv).
  2. Skip manager- and lead-level titles (not graduate roles) and non-ICT titles.
  3. Reduce each title to its role: "Senior Software Engineer (Java) - KL" -> "software engineer",
     one spelling per role ("front end" = "frontend"); one-word roles such as "developer" are too vague.
  4. Take the top role of every subcategory (every ICT area is searched), then fill the budget
     with the most common remaining roles overall. A role that only adds words to a chosen one
     ("IT support executive" after "IT support") is skipped: the shorter search already finds it.
  5. Save the list to data/live_job_queries.json, which fetch_live_jobs.py reads.

Nothing is fetched here, so it costs no API credits. Look at the preview, then commit the JSON:
it is the record of which queries were used.

Usage (from backend/, venv active):
  python scripts/live_jobs/generate_live_queries.py                 # preview only
  python scripts/live_jobs/generate_live_queries.py --roles         # preview + top roles of every subcategory
  python scripts/live_jobs/generate_live_queries.py --save          # write data/live_job_queries.json
  python scripts/live_jobs/generate_live_queries.py --my 25 --sg 3  # budget (default 25 Malaysia + 3 Singapore)
"""
import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date

import pandas as pd

sys.path.append(".")   # run from backend/

from app.services.job_titles import classify_seniority, is_ict_title

DATASET = "data/jobstreet_clean.csv"
OUTPUT = "data/live_job_queries.json"
MIN_POSTINGS = 5         # a role needs at least this many 2024 postings to become a query
MIN_WORDS, MAX_WORDS = 2, 4   # "developer" alone is too vague to search for; 5+ words too specific
ACRONYMS = {"IT", "ICT", "AI", "ML", "QA", "UI", "UX", "SAP", "SOC", "BI", "ERP", "SQL", "PHP", ".NET", "API"}

# Words that say the level, place or contract, not the role itself
NOT_ROLE_WORDS = re.compile(
    r"\b(senior|snr|sr|junior|jr|mid|entry|level|intern|internship|trainee|graduate|fresh|associate"
    r"|i|ii|iii|iv|1|2|3|l1|l2|l3|malaysia|kuala|lumpur|kl|penang|selangor|johor|cyberjaya|petaling|jaya|pj"
    r"|remote|hybrid|contract|permanent|temporary|urgent|immediate|hiring|wanted|new)\b",
    re.IGNORECASE,
)
# One spelling per role, so "front end developer" and "frontend developer" count as one role
SPELLINGS = [
    (r"\bfront[\s-]?end\b", "frontend"), (r"\bback[\s-]?end\b", "backend"), (r"\bfull[\s-]?stack\b", "full stack"),
    (r"\bcyber[\s-]?security\b", "cybersecurity"), (r"\bdev[\s-]?ops\b", "devops"), (r"\bsystems\b", "system"),
]


def role_of(title: str) -> str:
    """'Senior Software Engineer (Java) - KL' -> 'Software Engineer'. Case is kept so
    is_ict_title can still tell 'IT' from 'it'; compare roles with .lower()."""
    t = re.sub(r"\(.*?\)|\[.*?\]", " ", title or "")            # drop bracketed details
    t = re.split(r"\s[-–|@/]\s|,|\sfor\s|\sat\s", t)[0]   # keep the part before " - ", ",", " for "...
    t = NOT_ROLE_WORDS.sub(" ", t)
    t = re.sub(r"[^\w\s/+#.]", " ", t)                           # stray punctuation, keep UI/UX, C++, C#, .NET
    for pattern, spelling in SPELLINGS:
        t = re.sub(pattern, spelling, t, flags=re.IGNORECASE)
    return " ".join(t.split()).rstrip(" ./")    # keep a leading "." (.NET)


def written(role: str) -> str:
    """How a role is written in the query: lower case, acronyms in capitals ("IT support executive")."""
    def word(w):
        return w.upper() if all(part.upper() in ACRONYMS for part in w.split("/")) else w.lower()
    return " ".join(word(w) for w in role.split())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--my", type=int, default=25, help="number of Malaysia queries (2 credits each)")
    parser.add_argument("--sg", type=int, default=3, help="number of Singapore queries (1 credit each)")
    parser.add_argument("--save", action="store_true", help=f"write {OUTPUT}")
    parser.add_argument("--roles", action="store_true", help="also list the top roles of every subcategory")
    args = parser.parse_args()

    try:
        df = pd.read_csv(DATASET, usecols=["job_title", "subcategory"]).dropna()
    except FileNotFoundError:
        sys.exit(f"{DATASET} not found. It is created by scripts/pipeline/clean_jobstreet.py.")

    # Count roles per subcategory
    counts = defaultdict(Counter)       # subcategory -> role (lower case) -> postings
    skipped = Counter()
    for title, subcat in zip(df["job_title"], df["subcategory"]):
        if classify_seniority(title) in ("manager", "lead"):
            skipped["manager / lead"] += 1
            continue
        role = role_of(title)
        if not MIN_WORDS <= len(role.split()) <= MAX_WORDS:
            skipped["too vague (1 word) or too specific (5+ words)"] += 1
            continue
        if not is_ict_title(role):
            skipped["not an ICT role"] += 1
            continue
        key = role.lower()
        counts[subcat][key] += 1

    # Each role belongs to the subcategory where it appears most, so it's searched once
    home = {}
    for subcat, roles in counts.items():
        for key, n in roles.items():
            if key not in home or n > counts[home[key]][key]:
                home[key] = subcat
    ranked = {
        subcat: [(key, n) for key, n in roles.most_common() if home[key] == subcat and n >= MIN_POSTINGS]
        for subcat, roles in counts.items()
    }
    ranked = {s: r for s, r in ranked.items() if r}

    # Choose the Malaysia queries:
    #   1. coverage   - the top role of every subcategory, so every ICT area is searched;
    #   2. popularity - then the most common remaining roles overall, until the budget is used.
    # A role that only adds words to a chosen one ("IT support executive" after "IT support") is
    # skipped: searching the shorter role already returns those jobs.
    chosen = {}                                    # role -> (postings, subcategory)

    def covered(key):
        words = set(key.split())
        return any(set(c.split()) <= words or words <= set(c.split()) for c in chosen)

    by_size = sorted(ranked, key=lambda s: -sum(counts[s].values()))
    for subcat in by_size:
        for key, n in ranked[subcat]:
            if not covered(key):
                chosen[key] = (n, subcat)
                break
    for n, key, subcat in sorted(((n, k, s) for s in ranked for k, n in ranked[s]), reverse=True):
        if len(chosen) >= args.my:
            break
        if key not in chosen and not covered(key):
            chosen[key] = (n, subcat)
    # A budget smaller than the number of subcategories keeps the most common roles
    chosen = dict(sorted(chosen.items(), key=lambda kv: -kv[1][0])[:args.my])

    queries = [{"query": f"{written(key)} in Malaysia", "country": "my", "subcategory": subcat,
                "postings_2024": n} for key, (n, subcat) in chosen.items()]
    # Singapore: the most common chosen roles, one per subcategory so the few SG searches don't overlap
    # (the dataset is Malaysian; Singapore is a small add-on)
    sg_subcats = set()
    for key, (n, subcat) in chosen.items():
        if len(sg_subcats) >= args.sg:
            break
        if subcat not in sg_subcats:
            sg_subcats.add(subcat)
            queries.append({"query": f"{written(key)} in Singapore", "country": "sg",
                            "subcategory": subcat, "postings_2024": n})

    if args.roles:
        print("\nTop roles per subcategory (* = used as a query):")
        for subcat in by_size:
            print(f"  {subcat} ({sum(counts[subcat].values())} postings)")
            for key, n in ranked[subcat][:8]:
                print(f"    {'*' if key in chosen else ' '} {n:>4}  {key}")
    print(f"\n{'2024 postings':>13}  {'query':<45} subcategory")
    for q in queries:
        print(f"{q['postings_2024']:>13}  {q['query']:<45} {q['subcategory']}")
    credits = sum(2 if q["country"] == "my" else 1 for q in queries)
    print(f"\n{len(queries)} queries, a full fetch costs {credits} credits (Malaysia 2 pages, Singapore 1)")

    if args.save:
        with open(OUTPUT, "w", encoding="utf-8") as f:
            json.dump({
                "generated": date.today().isoformat(),
                "method": ("Top ICT role of every JobStreet 2024 ICT subcategory, then the most common remaining "
                           "roles overall (manager/lead titles excluded, overlapping roles skipped)"),
                "source": DATASET,
                "budget": {"my": args.my, "sg": args.sg},
                "queries": queries,
            }, f, indent=2)
        print(f"Saved to {OUTPUT}. fetch_live_jobs.py now uses these queries.")
    else:
        print("Preview only. Add --save to write the file.")


if __name__ == "__main__":
    main()
