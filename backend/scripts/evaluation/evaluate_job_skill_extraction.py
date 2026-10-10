"""
E1b: how well SkillMap extracts the skills a job ad asks for (IR Objective 1, evaluation; the extractor is frozen).

Plan agreed 9 Oct (roadmap "E1 PLAN"), fixed before any result is seen:
  - 30 live ads, stratified by JobStreet ICT subcategory (seed 1), the text the extractor read (full JSearch text)
  - answer key = technical skills listed by BOTH independent labellers, Claude and Qwen (a different model
    family from the extractor, gpt-oss, so the extractor never grades itself); a skill only one of them listed is
    decided by the author (keep / drop). Both follow labelling_guide.md and never see the extractor's skills.
  - compared with the extractor's stored hard skills (any level) by the app's canonical skill key (same rule the app
    uses to call two names one skill); soft skills are left out of both sides (too subjective to label)
  - precision, recall, F1 (micro, over all skills) with a 95% bootstrap interval over ads (10,000 resamples, seed 0)

Steps (from backend/, venv active; files go to ../docs/evidence/job_skill_extraction/):
  python scripts/evaluation/evaluate_job_skill_extraction.py sample     # 1. pick the 30 ads -> ads.json + ads.md (no skills shown)
     -> upload ads.json to Claude, who labels them blind -> save its answer as answer_key_claude.json
  python scripts/evaluation/evaluate_job_skill_extraction.py qwen       # 2. Qwen labels the same ads (Groq) -> answer_key_qwen.json
  python scripts/evaluation/evaluate_job_skill_extraction.py merge      # 3. agreements + disagreements.csv (fill your_decision)
  python scripts/evaluation/evaluate_job_skill_extraction.py merge      # 4. again once every row is decided -> answer_key.json
  python scripts/evaluation/evaluate_job_skill_extraction.py score      # 5. scores.txt, per_ad.csv, errors.csv
"""
import argparse
import csv
import json
import os
import random
import sys
import time
from collections import defaultdict

sys.path.append(".")

from app.database import SessionLocal
from app.models.job import Job, JobSkill
from app.services.skill_names import canonical_key

OUT = "../docs/evidence/job_skill_extraction"
N_ADS, SEED = 30, 1
QWEN_MODEL = "qwen/qwen3.8-27b"     # the same Qwen as the other judges (judge_reference_pairs.py)
LIVE_CACHE = "data/live_jobs_cache.json"

GUIDE = """# Labelling guide: technical skills in a job ad

Read the whole ad. List every TECHNICAL skill the job needs: one the ad asks for, prefers, says the role will
teach, or names as used in the work.

Technical skill = a programming language, framework, library, tool, software product, platform, database,
protocol, standard or certification, or a technical method or domain (e.g. "Network security", "Machine learning",
"Agile").

Do not list:
- soft skills and personal qualities (communication, teamwork, curiosity)
- tasks that name no skill ("prepare reports", "support users"); list the skill behind a task only if it is named
- degrees, years of experience, spoken languages, work conditions, benefits
- team, department or product names of the company, unless the ad asks for skill in them
- a general word next to its specific items ("Programming languages" when the ad says "Python or Java")

Write each skill as a short standard name (1-4 words): "PostgreSQL", "REST APIs", "Cisco routing".
One skill per idea: if the ad says the same thing twice, list it once. Separate technologies stay separate
("BGP, OSPF" -> "BGP", "OSPF").
"""

QWEN_PROMPT = GUIDE + """
Return only JSON: {{"skills": ["...", "..."]}}

Job title: {title}

Ad:
{text}"""


def path(name: str) -> str:
    return os.path.join(OUT, name)


def load(name: str):
    with open(path(name), encoding="utf-8") as f:
        return json.load(f)


def save(name: str, data):
    os.makedirs(OUT, exist_ok=True)
    with open(path(name), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


def full_text_live() -> dict:
    """job_ref -> full ad text from the JSearch cache (what the extractor read; stored descriptions are cut)."""
    import hashlib
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


# ── 1. sample ────────────────────────────────────────────────────────────────────────────────────────────────────
def allocate(sizes: dict[str, int], n: int) -> dict[str, int]:
    """n ads split over the groups in proportion to their size (largest remainder), at least 1 each while n allows."""
    total = sum(sizes.values())
    groups = sorted(sizes, key=lambda g: -sizes[g])
    take = {g: 1 for g in groups[:n]}
    left = n - len(take)
    if left > 0:
        share = {g: left * sizes[g] / total for g in groups}
        for g in groups:
            take[g] = take.get(g, 0) + int(share[g])
        rest = n - sum(take.values())
        for g in sorted(groups, key=lambda g: -(share[g] - int(share[g])))[:rest]:
            take[g] += 1
    return {g: min(take[g], sizes[g]) for g in take}


def sample(n: int, seed: int):
    if os.path.exists(path("ads.json")):
        sys.exit("ads.json already exists: the sample is fixed once drawn (delete it only if no one has labelled yet).")
    db = SessionLocal()
    try:
        with_skills = {j for (j,) in db.query(JobSkill.job_id).filter(JobSkill.evidence_quote.isnot(None)).distinct()}
        jobs = [j for j in db.query(Job).filter(Job.source == "live", Job.gone_at.is_(None),
                                                 Job.hidden_by_admin_at.is_(None), Job.posted_by_user_id.is_(None))
                .order_by(Job.id) if j.id in with_skills]
    finally:
        db.close()
    groups = defaultdict(list)
    for j in jobs:
        groups[j.subcategory or "Other"].append(j)
    take = allocate({g: len(v) for g, v in groups.items()}, n)
    rng = random.Random(seed)
    full = full_text_live()
    ads = []
    for g in sorted(take):
        for j in rng.sample(groups[g], take[g]):
            ads.append({"job_ref": j.job_id, "title": j.job_title, "company": j.company or "", "subcategory": g,
                        "text": full.get(j.job_id) or j.description or ""})
    rng.shuffle(ads)          # labellers see the ads in a mixed order, not grouped by subcategory
    save("ads.json", ads)
    with open(path("labelling_guide.md"), "w", encoding="utf-8") as f:
        f.write(GUIDE)
    with open(path("ads.md"), "w", encoding="utf-8") as f:
        for i, a in enumerate(ads, 1):
            f.write(f"## {i}. {a['title']} ({a['company']})\nref: {a['job_ref']}\n\n{a['text']}\n\n")
    print(f"{len(ads)} ads from {len(jobs)} live jobs with checked skills, {len(take)} subcategories:")
    for g in sorted(take, key=lambda g: -take[g]):
        print(f"  {take[g]:>2}  {g} (of {len(groups[g])})")
    print(f"Written {path('ads.json')}, ads.md and labelling_guide.md. Next: upload ads.json to Claude, then run qwen.")


# ── 2. qwen ──────────────────────────────────────────────────────────────────────────────────────────────────────
def ask_qwen(prompt: str) -> list[str]:
    from groq import Groq
    from app.config import settings
    r = Groq(api_key=settings.groq_api_key).chat.completions.create(
        model=os.getenv("QWEN_JUDGE_MODEL") or QWEN_MODEL, temperature=0, max_completion_tokens=4096,
        response_format={"type": "json_object"}, messages=[{"role": "user", "content": prompt}])
    skills = json.loads(r.choices[0].message.content or "{}").get("skills", [])
    return [" ".join(str(s).split()) for s in skills if str(s).strip()]


def qwen(pause: float):
    ads = load("ads.json")
    done = load("answer_key_qwen.json") if os.path.exists(path("answer_key_qwen.json")) else {}
    for i, a in enumerate(ads, 1):
        if a["job_ref"] in done:
            continue
        try:
            done[a["job_ref"]] = ask_qwen(QWEN_PROMPT.format(title=a["title"], text=a["text"]))
        except Exception as e:     # daily limit or network: keep what is done, run again later to continue
            print(f"Stopped at ad {i}: {type(e).__name__}: {e}")
            break
        save("answer_key_qwen.json", done)
        print(f"{i:>2}/{len(ads)}  {len(done[a['job_ref']]):>2} skills  {a['title']}")
        time.sleep(pause)
    print(f"Qwen labelled {len(done)} of {len(ads)} ads.")


# ── 3. merge ─────────────────────────────────────────────────────────────────────────────────────────────────────
def by_key(names: list[str]) -> dict[str, str]:
    out = {}
    for n in names:
        k = canonical_key(n)
        if k and k not in out:
            out[k] = n
    return out


def merge():
    ads = load("ads.json")
    claude, qw = load("answer_key_claude.json"), load("answer_key_qwen.json")
    missing = [a["job_ref"] for a in ads if a["job_ref"] not in claude or a["job_ref"] not in qw]
    if missing:
        sys.exit(f"{len(missing)} ads lack a label from Claude or Qwen (e.g. {missing[0]}).")
    decided = {}
    if os.path.exists(path("disagreements.csv")):
        with open(path("disagreements.csv"), encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                decided[(r["job_ref"], r["key"])] = (r["your_decision"] or "").strip().lower()
    agreed = union = 0
    rows, key = [], {}
    for a in ads:
        c, q = by_key(claude[a["job_ref"]]), by_key(qw[a["job_ref"]])
        both = c.keys() & q.keys()
        agreed += len(both)
        union += len(c.keys() | q.keys())
        key[a["job_ref"]] = [c[k] for k in c if k in both]
        for k, name, by in [(k, c[k], "Claude") for k in c if k not in q] + [(k, q[k], "Qwen") for k in q if k not in c]:
            d = decided.get((a["job_ref"], k), "")
            rows.append({"job_ref": a["job_ref"], "title": a["title"], "skill": name, "key": k, "listed_by": by,
                         "your_decision": d})
            if d == "keep":
                key[a["job_ref"]].append(name)
    with open(path("disagreements.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["job_ref", "title", "skill", "key", "listed_by", "your_decision"])
        w.writeheader()
        w.writerows(rows)
    open_rows = [r for r in rows if r["your_decision"] not in ("keep", "drop")]
    print(f"Claude and Qwen agree on {agreed} of {union} skills ({agreed / union:.0%}, overlap of the two lists).")
    if open_rows:
        print(f"{len(open_rows)} of {len(rows)} disagreements to decide: open {path('disagreements.csv')}, type keep or "
              f"drop in your_decision (keep = the ad really needs it, by the guide), save, run merge again.")
        return
    save("answer_key.json", key)
    print(f"All {len(rows)} decided: answer_key.json written ({sum(map(len, key.values()))} skills in {len(key)} ads). Next: score.")


# ── 4. score ─────────────────────────────────────────────────────────────────────────────────────────────────────
def prf(tp: int, fp: int, fn: int) -> tuple[float, float, float]:
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    return p, r, (2 * p * r / (p + r) if p + r else 0.0)


def score():
    ads, key = load("ads.json"), load("answer_key.json")
    db = SessionLocal()
    try:
        ids = {j.job_id: j.id for j in db.query(Job).filter(Job.job_id.in_([a["job_ref"] for a in ads]))}
        predicted = defaultdict(list)
        for s in db.query(JobSkill).filter(JobSkill.job_id.in_(ids.values()), JobSkill.skill_type == "hard"):
            predicted[s.job_id].append(s.skill_name)
    finally:
        db.close()
    per_ad, errors = [], []
    for a in ads:
        g, p = by_key(key[a["job_ref"]]), by_key(predicted.get(ids.get(a["job_ref"]), []))
        tp, fp, fn = g.keys() & p.keys(), p.keys() - g.keys(), g.keys() - p.keys()
        per_ad.append({"job_ref": a["job_ref"], "title": a["title"], "subcategory": a["subcategory"],
                       "answer_key": len(g), "predicted": len(p), "tp": len(tp), "fp": len(fp), "fn": len(fn)})
        errors += [{"job_ref": a["job_ref"], "title": a["title"], "error": "extra (not in answer key)", "skill": p[k]} for k in fp]
        errors += [{"job_ref": a["job_ref"], "title": a["title"], "error": "missed (in answer key)", "skill": g[k]} for k in fn]
    tot = lambda rows, k: sum(r[k] for r in rows)
    P, R, F = prf(tot(per_ad, "tp"), tot(per_ad, "fp"), tot(per_ad, "fn"))
    rng, boots = random.Random(0), []
    for _ in range(10_000):
        s = [rng.choice(per_ad) for _ in per_ad]
        boots.append(prf(tot(s, "tp"), tot(s, "fp"), tot(s, "fn")))
    ci = lambda i: (sorted(b[i] for b in boots)[249], sorted(b[i] for b in boots)[9749])
    lines = [f"E1b extraction vs answer key: {len(per_ad)} ads, {tot(per_ad, 'answer_key')} answer-key skills, "
             f"{tot(per_ad, 'predicted')} extracted hard skills",
             f"TP {tot(per_ad, 'tp')}  FP {tot(per_ad, 'fp')}  FN {tot(per_ad, 'fn')}"]
    for name, i, v in (("Precision", 0, P), ("Recall", 1, R), ("F1", 2, F)):
        lo, hi = ci(i)
        lines.append(f"{name:<9} {v:.3f}  (95% CI {lo:.3f}-{hi:.3f}, bootstrap over ads)")
    with open(path("scores.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    for name, rows in (("per_ad.csv", per_ad), ("errors.csv", errors)):
        with open(path(name), "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
    print("\n".join(lines))
    print("Written scores.txt, per_ad.csv and errors.csv (every extra and missed skill, for the error analysis).")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("step", choices=["sample", "qwen", "merge", "score"])
    ap.add_argument("--n", type=int, default=N_ADS)
    ap.add_argument("--seed", type=int, default=SEED)
    ap.add_argument("--pause", type=float, default=2.0, help="seconds between Qwen calls")
    a = ap.parse_args()
    {"sample": lambda: sample(a.n, a.seed), "qwen": lambda: qwen(a.pause), "merge": merge, "score": score}[a.step]()
