"""
E1 modules (15 Oct, evaluation step 3; IR Objective 1, the academic side): how well SkillMap's extractor finds the
skills a module teaches from its description. Same method as E1b (job ads), so the two are comparable; the job-ad
script's labelling, merging, spot-check and scoring code is reused as it is (a module plays the part of an ad).

Plan, fixed on 15 Oct BEFORE any result was seen:
  - 30 of the modules that have a description, stratified by module family (code prefix: SE, IT, CS, QC, DA, AI, CY,
    MM, GD), seed 1; the description as stored now (what the app's extractor reads)
  - the extractor AS IT RUNS TODAY (app/nlp/skill_extractor.py, MODULE_PROMPT, gpt-oss-120b via Groq), run fresh on
    the 30 descriptions and frozen in module_extractions.json. Not the stored module skills: those include the
    career office's edits, so they would not measure the AI alone
  - answer key = skills listed by at least 2 of 3 labellers (Claude, Qwen, Gemini; none of them the extractor),
    following MODULE_GUIDE below and never seeing the extractor's skills (majority vote, Snow et al. 2008)
  - spot-check: the author checks every agreed skill in 5 modules (seed 2) and adds any all three missed
  - scored as E1b: the app's canonical skill key + the same plain-name rules, micro P/R/F1, 95% bootstrap over
    modules (10,000 resamples, seed 0); saved as a MongoDB evaluation run
  - known limit, reported: the extractor is asked for 3-10 skills ("fewer is better than guessing"), the labellers
    are not capped, so recall shows what the cap leaves out
  - caveat, reported: most descriptions were written from the brochure's module names (data/README.md), so this
    measures faithfulness to the description, not agreement with APU's official module content

Steps (from backend/, venv active; files go to ../docs/evidence/module_skill_extraction/):
  python scripts/evaluation/evaluate_module_skill_extraction.py sample    # 1. modules.json + modules.md + guide
     -> upload modules.json to Claude, who labels blind -> save as answer_key_claude.json
  python scripts/evaluation/evaluate_module_skill_extraction.py extract   # 2. the extractor, fresh (30 Groq calls)
  python scripts/evaluation/evaluate_module_skill_extraction.py qwen      # 3. Qwen labels (Groq)
  python scripts/evaluation/evaluate_module_skill_extraction.py gemini    # 4. Gemini labels
  python scripts/evaluation/evaluate_module_skill_extraction.py merge     # 5. answer_key.json + spot_check.csv
     -> fill your_check in spot_check.csv (correct / wrong / unsure), then merge again
  python scripts/evaluation/evaluate_module_skill_extraction.py score     # 6. scores.txt, per_module.csv, errors.csv
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
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import evaluate_job_skill_extraction as e1  # noqa: E402  (same labellers, grouping, spot-check and scoring)

OUT = "../docs/evidence/module_skill_extraction"
N_MODULES, SEED = 30, 1

MODULE_GUIDE = """# Labelling guide: skills a university module teaches

Read the module name and description. List every skill a student who passes this module would have: one the
description states, or one directly implied by a topic it states.

Skill = a programming language, framework, tool, software product, platform, database, protocol or standard, a
technical method or area (e.g. "SQL querying", "Network security", "Agile"), or a professional skill the module
clearly teaches as a topic (e.g. "Project management", "Technical report writing").

Do not list:
- personal qualities (curiosity, confidence) or general study habits
- assessment types or activities that name no skill ("group assignment", "presentation", "lab exercises")
- the module's name repeated as a skill when the description names more specific skills
- a general word next to its specific items ("Programming" when the description says "Python")

Keep the level the description states: an introductory topic stays introductory ("basic object-oriented
programming", not "object-oriented design").
Write each skill as a short standard name (1-4 words). One skill per idea; separate technologies stay separate.
"""

MODULE_PROMPT = MODULE_GUIDE + """
Return only JSON: {{"skills": ["...", "..."]}}

Module: {title}

Description:
{text}"""


def use_module_files():
    """Point the job-ad code at this evaluation: its own folder, modules.json where it reads ads.json, and the module
    guide for the labellers. Called only when this script runs (importing it changes nothing)."""
    e1.OUT = OUT
    load = e1.load
    e1.load = lambda name: load("modules.json" if name == "ads.json" else name)
    e1.QWEN_PROMPT = MODULE_PROMPT


def family(code: str) -> str:
    return (code or "").split("-")[0] or "Other"


# ── 1. sample ────────────────────────────────────────────────────────────────────────────────────────────────────
def sample(n: int, seed: int):
    if os.path.exists(e1.path("modules.json")):
        sys.exit("modules.json already exists: the sample is fixed once drawn (delete it only if no one has labelled yet).")
    from app.database import SessionLocal
    from app.models.module import Module
    db = SessionLocal()
    try:
        mods = [m for m in db.query(Module).order_by(Module.code) if (m.description or "").strip()]
    finally:
        db.close()
    groups = defaultdict(list)
    for m in mods:
        groups[family(m.code)].append(m)
    take = e1.allocate({g: len(v) for g, v in groups.items()}, n)
    rng = random.Random(seed)
    picked = []
    for g in sorted(take):
        for m in rng.sample(groups[g], take[g]):
            # job_ref / title / text: the names the job-ad code expects, so its labelling and merge run unchanged
            picked.append({"job_ref": m.code, "title": m.name, "subcategory": g, "level": m.level,
                           "text": m.description})
    rng.shuffle(picked)
    e1.save("modules.json", picked)
    with open(e1.path("labelling_guide.md"), "w", encoding="utf-8") as f:
        f.write(MODULE_GUIDE)
    with open(e1.path("modules.md"), "w", encoding="utf-8") as f:
        for i, m in enumerate(picked, 1):
            f.write(f"## {i}. {m['title']}\ncode: {m['job_ref']}\n\n{m['text']}\n\n")
    print(f"{len(picked)} modules from {len(mods)} with a description, {len(take)} families:")
    for g in sorted(take, key=lambda g: -take[g]):
        print(f"  {take[g]:>2}  {g} (of {len(groups[g])})")
    print(f"Written {e1.path('modules.json')}, modules.md and labelling_guide.md.")


# ── 2. the extractor, fresh ──────────────────────────────────────────────────────────────────────────────────────
def extract(pause: float):
    from app.nlp.skill_extractor import MODULE_EXTRACTED_BY_V1 as MODULE_EXTRACTED_BY, SkillExtractor  # step 3 tested v1
    sys.path.append("scripts/pipeline")
    from extract_module_skills import dedupe      # the same tidy-up the pipeline applies before saving
    mods, name = e1.load("modules.json"), "module_extractions.json"
    done = e1.load(name) if os.path.exists(e1.path(name)) else {}
    ex = SkillExtractor()
    for i, m in enumerate(mods, 1):
        if m["job_ref"] in done:
            continue
        found = ex.extract_from_module({"code": m["job_ref"], "name": m["title"], "level": m.get("level"),
                                        "description": m["text"]}, version="v1")
        skills = dedupe(found["extracted_skills"])
        if not skills:
            print(f"Stopped at module {i}: no skills back (usually Groq's daily limit). Run extract again later.")
            break
        done[m["job_ref"]] = {"skills": skills, "extracted_by": MODULE_EXTRACTED_BY}
        e1.save(name, done)
        print(f"{i:>2}/{len(mods)}  {len(skills):>2} skills  {m['title']}")
        time.sleep(pause)
    print(f"Extractor run on {len(done)} of {len(mods)} modules.")


# ── 6. score ─────────────────────────────────────────────────────────────────────────────────────────────────────
def score():
    mods, key = e1.load("modules.json"), e1.load("answer_key.json")
    ext = e1.load("module_extractions.json")
    missing = [m["title"] for m in mods if m["job_ref"] not in ext]
    if missing:
        sys.exit(f"{len(missing)} modules not extracted yet (run extract again): {', '.join(missing[:3])}...")
    per, errors = [], []
    for m in mods:
        g = e1.clusters({"key": key[m["job_ref"]], "pred": ext[m["job_ref"]]["skills"]})
        fp = [x["pred"] for x in g if list(x) == ["pred"]]
        fn = [x["key"] for x in g if list(x) == ["key"]]
        tp = sum(len(x) == 2 for x in g)
        per.append({"code": m["job_ref"], "module": m["title"], "family": m["subcategory"],
                    "answer_key": tp + len(fn), "extracted": tp + len(fp), "tp": tp, "fp": len(fp), "fn": len(fn)})
        errors += [{"code": m["job_ref"], "module": m["title"], "error": "extra (not in answer key)", "skill": s} for s in fp]
        errors += [{"code": m["job_ref"], "module": m["title"], "error": "missed (in answer key)", "skill": s} for s in fn]
    tot = lambda rows, k: sum(r[k] for r in rows)
    point = e1.prf(tot(per, "tp"), tot(per, "fp"), tot(per, "fn"))
    rng, boots = random.Random(0), []
    for _ in range(10_000):
        s = [rng.choice(per) for _ in per]
        boots.append(e1.prf(tot(s, "tp"), tot(s, "fp"), tot(s, "fn")))
    lines = [f"E1 module extraction vs answer key: {len(per)} modules, {tot(per, 'answer_key')} answer-key skills, "
             f"{tot(per, 'extracted')} extracted skills",
             f"TP {tot(per, 'tp')}  FP {tot(per, 'fp')}  FN {tot(per, 'fn')}"]
    metrics = {"tp": tot(per, "tp"), "fp": tot(per, "fp"), "fn": tot(per, "fn")}
    for i, k in enumerate(("precision", "recall", "f1")):
        lo, hi = sorted(b[i] for b in boots)[249], sorted(b[i] for b in boots)[9749]
        lines.append(f"{k.capitalize():<9} {point[i]:.3f}  (95% CI {lo:.3f}-{hi:.3f}, bootstrap over modules)")
        metrics[k] = {"value": round(point[i], 3), "ci95": [round(lo, 3), round(hi, 3)]}
    capped = sum(1 for r in per if r["answer_key"] > 10)
    lines.append(f"Modules whose answer key has more than 10 skills (the extractor's cap): {capped} of {len(per)}")
    spot = e1.read_csv("spot_check.csv")
    checked = [r for r in spot if r["kind"] == "agreed" and (r["your_check"] or "").strip().lower() in ("correct", "wrong")]
    if checked:
        right = sum(r["your_check"].strip().lower() == "correct" for r in checked)
        missed = sum(1 for r in spot if r["kind"] == "missing")
        lines.append(f"Answer-key check by the author ({len({r['job_ref'] for r in checked})} modules): {right} of "
                     f"{len(checked)} agreed skills correct ({right / len(checked):.0%}); {missed} skill"
                     f"{'' if missed == 1 else 's'} all three labellers missed")
    with open(e1.path("scores.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    for name, rows in (("per_module.csv", per), ("errors.csv", errors)):
        with open(e1.path(name), "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
    print("\n".join(lines))
    from app.services.evaluation_runs import record
    record("E1 module extraction", objective=1,
           method="extractor run fresh (MODULE_PROMPT, 3-10 skills) vs answer key (2 of 3 labellers: Claude, Qwen, "
                  "Gemini), canonical skill key, micro P/R/F1, 95% bootstrap over modules (10,000, seed 0)",
           dataset={"modules": len(per), "answer_key_skills": tot(per, "answer_key"), "extracted": tot(per, "extracted"),
                    "sample": "30 modules with a description, stratified by family, seed 1",
                    "extracted_by": next(iter(ext.values()))["extracted_by"]},
           metrics=metrics, files=[e1.path("modules.json"), e1.path("answer_key.json"),
                                   e1.path("module_extractions.json"), e1.path("spot_check.csv")])
    print("Written scores.txt, per_module.csv and errors.csv (every extra and missed skill).")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("step", choices=["sample", "extract", "qwen", "gemini", "merge", "score"])
    ap.add_argument("--n", type=int, default=N_MODULES)
    ap.add_argument("--seed", type=int, default=SEED)
    ap.add_argument("--pause", type=float, default=2.0)
    a = ap.parse_args()
    use_module_files()
    {"sample": lambda: sample(a.n, a.seed), "extract": lambda: extract(a.pause),
     "qwen": lambda: e1.label("qwen", e1.ask_qwen, a.pause), "gemini": lambda: e1.label("gemini", e1.ask_gemini, a.pause),
     "merge": e1.merge, "score": score}[a.step]()
