"""Before/after check for project and certificate skills (4 Oct; references.md "Project and certificate skill extraction").

Runs the OLD prompts (as they were before 4 Oct) and the NEW extraction (no example answer in the prompt, a quote for
every project skill, quotes checked against the description, plans dropped) on the same samples, and compares both
with the skills the description really states (gold list below, written by hand; check it yourself before reporting).

Projects: precision = share of returned skills that are in the gold list; recall = share of the gold list found;
"unsupported" = returned skills not in the gold list (the false "you have this" the change is meant to stop).
Certificates: no gold list (the official outline would be needed); the output is printed for a manual look, and the
unknown certificate should give no skills with the new prompt.

Calls Groq: 6 projects x 2 + 4 certificates x 2 = 20 calls (well within the free daily limit).
Run from backend/ with the venv active:
    python scripts/tools/compare_profile_extraction.py
Writes docs/evidence/profile_extraction_before_after.csv (in the repo root).
"""
import csv
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.routers import profile as P  # noqa: E402
from app.services.skill_names import canonical_key  # noqa: E402

OUT = Path(__file__).resolve().parents[3] / "docs" / "evidence" / "profile_extraction_before_after.csv"

# Realistic student projects. Traps on purpose: planned features, skills from the old prompt's example list that are
# NOT used (Docker, PostgreSQL, REST API), vague wording. gold = skills the text says were used.
PROJECTS = [
    {"name": "Hotel Booking System",
     "description": "A hotel management web application built with Jakarta EE (JSF, EJB, JPA) on GlassFish with a "
                    "Java DB database. Staff can manage rooms, bookings and payments. In the future we plan to move "
                    "it to Docker and add a REST API for a mobile app.",
     "gold": ["Jakarta EE", "JSF", "EJB", "JPA", "GlassFish", "Java DB", "Java"]},
    {"name": "Smart Evacuation App",
     "description": "Hackathon project: an Android app in Kotlin that guides people out of a building during a fire. "
                    "Uses Firebase for real-time alerts and Google Maps for indoor routes. The app will notify users "
                    "with push notifications.",
     "gold": ["Android", "Kotlin", "Firebase", "Google Maps"]},
    {"name": "Student Grade Predictor",
     "description": "Trained a random forest model in Python with scikit-learn and pandas to predict final grades from "
                    "attendance and coursework marks. Results were plotted with Matplotlib in a Jupyter notebook.",
     "gold": ["Python", "scikit-learn", "pandas", "Random Forest", "Machine Learning", "Matplotlib", "Jupyter"]},
    {"name": "Personal Portfolio Website",
     "description": "My own website made with HTML, CSS and a bit of JavaScript, hosted on GitHub Pages. "
                    "I would like to rebuild it in React later.",
     "gold": ["HTML", "CSS", "JavaScript", "GitHub Pages"]},
    {"name": "Library Inventory",
     "description": "Group assignment. We made a desktop system for a small library to track books and loans. "
                    "I did the database part and the reports.",
     "gold": []},
    {"name": "Network Lab Setup",
     "description": "Configured VLANs, OSPF routing and ACLs on Cisco routers and switches in Packet Tracer for a "
                    "three-branch company network, then tested connectivity with ping and traceroute.",
     "gold": ["VLAN", "OSPF", "ACL", "Cisco", "Packet Tracer", "Routing", "Network Configuration"]},
]

CERTS = [
    {"cert_name": "AWS Certified Cloud Practitioner", "issuer": "Amazon Web Services"},
    {"cert_name": "CCNA", "issuer": "Cisco"},
    {"cert_name": "Google IT Support Professional Certificate", "issuer": "Google (Coursera)"},
    {"cert_name": "Tech Explorer Bootcamp Completion", "issuer": "Bright Future Learning Centre"},   # unknown: expect []
]


# ── The OLD prompts, copied from routers/profile.py before 4 Oct ──────────────────────────────────────────────────
def old_project(name, description):
    prompt = f"""Extract technical skills from this software project. Return ONLY a JSON array of skill strings, nothing else.

Project: {name}
Description: {description}

Rules:
- Include programming languages, frameworks, libraries, tools, platforms, databases, APIs
- Be specific: "React" not "frontend", "PostgreSQL" not "database"
- No soft skills, no generic terms like "problem solving"
- Max 15 skills
- Example output: ["Python", "FastAPI", "PostgreSQL", "Docker", "REST API"]

Output the JSON array only:"""
    answer = P._ask_json(prompt, "old project")
    return [str(s).strip() for s in answer if s][:15] if isinstance(answer, list) else []


def old_cert(cert_name, issuer):
    prompt = f"""List the technical skills validated by this certification. Return ONLY a JSON array of skill strings.

Certification: {cert_name}
Issuer: {issuer}

Rules:
- List the specific technologies, tools, platforms, or methodologies the cert covers
- Max 10 skills
- Example for "AWS Certified Solutions Architect": ["AWS", "Cloud Architecture", "EC2", "S3", "VPC", "IAM", "RDS", "CloudFormation"]

Output the JSON array only:"""
    answer = P._ask_json(prompt, "old certificate")
    return [str(s).strip() for s in answer if s][:10] if isinstance(answer, list) else []


def in_gold(skill, gold):
    """Same skill as a gold one: same canonical key, or one name inside the other ("Java DB" / "Java DB database")."""
    k, low = canonical_key(skill), skill.lower()

    def inside(a, b):   # whole words only: "java" is not inside "javascript"
        return re.search(rf"(?<!\w){re.escape(a)}(?!\w)", b) is not None
    return any(k == canonical_key(g) or inside(g.lower(), low) or inside(low, g.lower()) for g in gold)


def score(skills, gold):
    hits = [s for s in skills if in_gold(s, gold)]
    found = [g for g in gold if any(in_gold(s, [g]) for s in skills)]
    precision = len(hits) / len(skills) if skills else (1.0 if not gold else 0.0)
    recall = len(found) / len(gold) if gold else 1.0
    return precision, recall, [s for s in skills if s not in hits]


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    rows, totals = [], {"old": [0, 0, 0, 0], "new": [0, 0, 0, 0]}   # returned, correct, gold found, gold total
    print("PROJECTS")
    for s in PROJECTS:
        old = old_project(s["name"], s["description"])
        new_quotes = P.extract_skills_from_project(s["name"], s["description"])
        new = list(new_quotes)
        print(f"\n{s['name']}  (gold: {', '.join(s['gold']) or 'none'})")
        for label, skills in (("old", old), ("new", new)):
            p, r, wrong = score(skills, s["gold"])
            t = totals[label]
            t[0] += len(skills)
            t[1] += len(skills) - len(wrong)
            t[2] += round(r * len(s["gold"]))
            t[3] += len(s["gold"])
            print(f"  {label}: {len(skills):2d} skills, precision {p:.0%}, recall {r:.0%}"
                  + (f", unsupported: {', '.join(wrong)}" if wrong else ""))
            rows.append([date.today().isoformat(), "project", s["name"], label, "; ".join(skills), "; ".join(wrong),
                         f"{p:.2f}", f"{r:.2f}", "; ".join(f"{k}: {v}" for k, v in new_quotes.items()) if label == "new" else ""])
    print("\nTOTAL (all projects)")
    for label, (n, ok, found, gold) in totals.items():
        print(f"  {label}: {n} skills returned, {n - ok} unsupported ({(n - ok) / n:.0%} of returned)" if n else f"  {label}: 0 skills",
              f"| precision {ok / n:.0%}" if n else "", f"| recall {found / gold:.0%}" if gold else "")
    print("\nCERTIFICATES (look by hand: the unknown one should give nothing with the new prompt)")
    for c in CERTS:
        old, new = old_cert(c["cert_name"], c["issuer"]), P.map_cert_to_skills(c["cert_name"], c["issuer"])
        print(f"\n{c['cert_name']} ({c['issuer']})\n  old: {', '.join(old) or '-'}\n  new: {', '.join(new) or '-'}")
        for label, skills in (("old", old), ("new", new)):
            rows.append([date.today().isoformat(), "certificate", c["cert_name"], label, "; ".join(skills), "", "", "", ""])
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", "kind", "sample", "version", "skills", "unsupported", "precision", "recall", "quotes"])
        w.writerows(rows)
    print(f"\nSaved {OUT}")


if __name__ == "__main__":
    main()
