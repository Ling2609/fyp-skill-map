"""Build data/learning_resources.json (the AI Assistant's checked learning links) from two inputs, so the list can be
explained and rebuilt (13 Oct 2026, her question: "it comes out of nowhere"):

1. WHICH skills: the hard skills real ads ask for most. Counted from the job-skill evidence file
   docs/evidence/stage1_dryrun_evidence-v8.csv (213 live ads, every skill kept with a quote from its ad), or with
   --from-db from the live jobs in your database. The counts are saved to
   docs/evidence/learning_resources_skill_counts.csv, with which skills have resources.
2. WHICH resources: data/learning_resources_curated.csv, one row per resource (open it in Excel to add or change one;
   "checked_by_hand" = the date you opened a link the check script couldn't, because the site blocks robots).
   Selection rule (references.md "Learning plan"): for each skill, the tool's own official documentation or tutorial,
   plus at most one well-known free course or practice site; free first; no single videos or playlists (their
   addresses change and can't be checked well).

The JSON keeps each link's last check result (ok, date, page title) when the address hasn't changed. After building,
check the links:  python scripts/tools/check_learning_links.py

Run from backend/ with the venv active:
    python scripts/pipeline/build_learning_resources.py            counts from the evidence file
    python scripts/pipeline/build_learning_resources.py --from-db  counts from the live jobs in your database
"""
import csv
import json
import sys
from collections import Counter
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))
CURATED = BACKEND / "data" / "learning_resources_curated.csv"
OUT = BACKEND / "data" / "learning_resources.json"
EVIDENCE = ROOT / "docs" / "evidence" / "stage1_dryrun_evidence-v8.csv"
COUNTS_OUT = ROOT / "docs" / "evidence" / "learning_resources_skill_counts.csv"
TOP = 60          # how many of the most-asked skills are listed in the counts file


def skill_counts(from_db: bool) -> tuple[Counter, str]:
    """{skill name (lower case): number of ads asking for it}."""
    if from_db:
        from app.database import SessionLocal
        from app.models.job import Job, JobSkill
        db = SessionLocal()
        try:
            rows = (db.query(JobSkill.job_id, JobSkill.skill_name).join(Job, Job.id == JobSkill.job_id)
                    .filter(Job.source == "live", JobSkill.skill_type == "hard").all())
        finally:
            db.close()
        pairs = {(job, name.strip().lower()) for job, name in rows}
        return Counter(name for _, name in pairs), f"live jobs in the database ({len({j for j, _ in pairs})} ads)"
    pairs = set()
    with open(EVIDENCE, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if r["result"] == "keep" and r["type"] == "hard":
                pairs.add((r["job_id"], r["skill"].strip().lower()))
    return Counter(name for _, name in pairs), f"{EVIDENCE.name} ({len({j for j, _ in pairs})} live ads)"


def main():
    old = {}
    if OUT.exists():
        for e in json.loads(OUT.read_text(encoding="utf-8"))["skills"]:
            for r in e["resources"]:
                old[r["url"]] = {k: r.get(k) for k in ("checked", "ok", "page_title")}
    skills: dict[str, dict] = {}
    with open(CURATED, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            entry = skills.setdefault(row["skill"].strip(), {
                "skill": row["skill"].strip(),
                "aliases": [a.strip() for a in row["aliases"].split(";") if a.strip()], "resources": []})
            res = {k: row[k].strip() for k in ("name", "url", "provider", "kind", "cost")}
            res.update(old.get(res["url"], {"checked": None, "ok": None, "page_title": None}))
            # a site that blocks automatic checks (e.g. "Just a moment...") can be opened by hand: the date goes here
            res["checked_by_hand"] = (row.get("checked_by_hand") or "").strip() or None
            entry["resources"].append(res)

    counts, source = skill_counts("--from-db" in sys.argv)

    def covered_by(name: str) -> str:
        for e in skills.values():
            if name in [e["skill"].lower(), *(a.lower() for a in e["aliases"])]:
                return e["skill"]
        return ""

    COUNTS_OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(COUNTS_OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["rank", "skill", "ads", "resources_under"])
        for i, (name, n) in enumerate(counts.most_common(TOP), 1):
            w.writerow([i, name, n, covered_by(name)])
    top = counts.most_common(TOP)
    covered = sum(1 for name, _ in top if covered_by(name))
    data = {
        "about": ("The AI Assistant's learning links. Built by scripts/pipeline/build_learning_resources.py from "
                  "data/learning_resources_curated.csv (which resources) and the most-asked skills in " + source +
                  "; see backend/data/README.md. A link is shown to students only when "
                  "scripts/tools/check_learning_links.py has opened it (ok = true)."),
        "skills": list(skills.values()),
    }
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(skills)} skills, {sum(len(e['resources']) for e in skills.values())} resources -> {OUT.name}")
    print(f"Skill counts from {source}: {covered} of the top {TOP} have resources -> {COUNTS_OUT.name}")
    missing = [f"{name} ({n})" for name, n in top if not covered_by(name)][:15]
    if missing:
        print("Most-asked skills with no resources (add rows to the CSV if they are learnable skills):")
        print("  " + ", ".join(missing))


if __name__ == "__main__":
    main()
