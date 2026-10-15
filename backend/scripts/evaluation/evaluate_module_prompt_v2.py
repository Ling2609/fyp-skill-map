"""
E1 modules, round 2 (15 Oct, her choice "option B"): does module prompt v2 find module skills better than v1?
Step 3's error analysis (docs/evidence/module_skill_extraction/error_analysis.txt) found v1 leaves out the module's
main subject, drops tools written "X or Y" and adds words to plain skill names. Prompt v2 (app/nlp/skill_extractor.py
MODULE_PROMPT_V2) was written from those 30 modules, so it is tested on 30 NEW ones.

Plan, fixed on 15 Oct BEFORE any v2 result was seen:
  - 30 new modules with a description, none of step 3's 30, stratified by family, seed 2
  - v1, v2 and v2b all run on the same 30 descriptions (v1 and v2 fresh, 60 Groq calls, frozen in
    module_extractions.json); v2b = v2 + every O*NET software product name found in the description
    (data/external/onet_software_skills.csv, the spaCy baseline's matcher), added when v2 doesn't already have it
  - answer key = 2 of 3 labellers (Claude, Qwen, Gemini) with the step-3 guide, ONE rule changed before labelling:
    the module's main subject IS listed (step 3's guide said leave it out; that was wrong for SkillMap, employers
    search for exactly those words). The author spot-checks 5 modules (seed 2)
  - scored as before (canonical key + plain-name rules, micro P/R/F1, 95% bootstrap over modules, seed 0)
  - pass rule: v2 replaces v1 if its F1 is higher and the paired 95% interval of the F1 difference is above 0;
    v2b replaces v2 only if it beats v2 the same way. Both comparisons are reported whatever the outcome

Steps (from backend/, venv active; files go to ../docs/evidence/module_prompt_v2/):
  python scripts/evaluation/evaluate_module_prompt_v2.py sample    # 1. modules.json, then upload it to Claude
  python scripts/evaluation/evaluate_module_prompt_v2.py extract   # 2. v1 + v2 (60 Groq calls, resumes)
  python scripts/evaluation/evaluate_module_prompt_v2.py qwen      # 3.
  python scripts/evaluation/evaluate_module_prompt_v2.py gemini    # 4.
  python scripts/evaluation/evaluate_module_prompt_v2.py merge     # 5. then the spot-check, then merge again
  python scripts/evaluation/evaluate_module_prompt_v2.py score     # 6. scores.txt, per_module.csv, errors.csv
"""
import argparse
import csv
import os
import random
import sys
import time

sys.path.append(".")
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import evaluate_module_skill_extraction as me  # noqa: E402
import evaluate_spacy_baseline as sb  # noqa: E402

e1 = me.e1
OUT = "../docs/evidence/module_prompt_v2"
STEP3 = "../docs/evidence/module_skill_extraction/modules.json"
N_MODULES, SEED = 30, 2
VARIANTS = ("v1", "v2", "v2b")

GUIDE_V2 = me.MODULE_GUIDE.replace(
    "- the module's name repeated as a skill when the description names more specific skills\n", "").replace(
    "Keep the level the description states",
    "Include the module's main subject as a skill (e.g. \"Penetration testing\" for a penetration testing module),\n"
    "unless it is only a general word (\"Programming\", \"Computing\").\nKeep the level the description states")
PROMPT_V2 = GUIDE_V2 + """
Return only JSON: {{"skills": ["...", "..."]}}

Module: {title}

Description:
{text}"""


def use_files():
    e1.OUT = OUT
    load = e1.load
    e1.load = lambda name: load("modules.json" if name == "ads.json" else name)
    e1.QWEN_PROMPT = PROMPT_V2
    me.MODULE_GUIDE = GUIDE_V2          # written into labelling_guide.md by sample


# ── 1. sample: new modules only ──────────────────────────────────────────────────────────────────────────────────
def sample(n: int, seed: int):
    import json
    with open(STEP3, encoding="utf-8") as f:
        used = {m["job_ref"] for m in json.load(f)}
    from app.database import SessionLocal
    from app.models.module import Module
    real = SessionLocal

    class Without:                       # step 3's modules left out of the population
        def __init__(self):
            self.db = real()

        def query(self, model):
            q = self.db.query(model)
            return q.filter(~model.code.in_(used)) if model is Module else q

        def close(self):
            self.db.close()
    import app.database
    app.database.SessionLocal = Without
    try:
        me.sample(n, seed)
    finally:
        app.database.SessionLocal = real
    print(f"(the {len(used)} modules of step 3 were left out)")


# ── 2. v1 and v2, fresh ──────────────────────────────────────────────────────────────────────────────────────────
def extract(pause: float):
    from app.nlp.skill_extractor import MODULE_EXTRACTED_BY, MODULE_EXTRACTED_BY_V2, SkillExtractor
    sys.path.append("scripts/pipeline")
    from extract_module_skills import dedupe
    mods, name = e1.load("modules.json"), "module_extractions.json"
    done = e1.load(name) if os.path.exists(e1.path(name)) else {}
    ex = SkillExtractor()
    labels = {"v1": MODULE_EXTRACTED_BY, "v2": MODULE_EXTRACTED_BY_V2}
    for i, m in enumerate(mods, 1):
        row = done.setdefault(m["job_ref"], {})
        for v in ("v1", "v2"):
            if v in row:
                continue
            found = ex.extract_from_module({"code": m["job_ref"], "name": m["title"], "level": m.get("level"),
                                            "description": m["text"]}, version=v)
            skills = dedupe(found["extracted_skills"])
            if not skills:
                e1.save(name, done)
                sys.exit(f"Stopped at module {i} ({v}): no skills back (usually Groq's daily limit). Run extract again later.")
            row[v] = {"skills": skills, "extracted_by": labels[v]}
            e1.save(name, done)
            time.sleep(pause)
        print(f"{i:>2}/{len(mods)}  v1 {len(row['v1']['skills']):>2}  v2 {len(row['v2']['skills']):>2}  {m['title']}")
    print(f"v1 and v2 run on {sum(1 for r in done.values() if 'v1' in r and 'v2' in r)} of {len(mods)} modules.")


def with_onet(mods, v2: dict) -> dict:
    """v2b: v2's skills + O*NET product names found in the description that v2 doesn't already have."""
    matcher = sb.Matcher({t: e for t, e in sb.public_dictionary(esco=os.devnull).items()})
    out = {}
    for m in mods:
        skills = list(v2[m["job_ref"]])
        for tool in matcher.skills(m["text"]):
            if not any(len(g) == 2 for g in e1.clusters({"a": skills, "b": [tool]})):
                skills.append(tool)
        out[m["job_ref"]] = skills
    return out


# ── 6. score ─────────────────────────────────────────────────────────────────────────────────────────────────────
def score():
    mods, key, ext = e1.load("modules.json"), e1.load("answer_key.json"), e1.load("module_extractions.json")
    missing = [m["title"] for m in mods if not {"v1", "v2"} <= set(ext.get(m["job_ref"], {}))]
    if missing:
        sys.exit(f"{len(missing)} modules not extracted with v1 and v2 yet (run extract again).")
    pred = {v: {m["job_ref"]: ext[m["job_ref"]][v]["skills"] for m in mods} for v in ("v1", "v2")}
    have_onet = os.path.exists(sb.ONET)
    if have_onet:
        pred["v2b"] = with_onet(mods, pred["v2"])
    else:
        print(f"v2b skipped: {sb.ONET} is needed")
    rows = {v: sb.counts(mods, key, p) for v, p in pred.items()}
    cis = {v: sb.with_ci(r) for v, r in rows.items()}
    fmt = lambda m: "".join(f"{m[k]['value']:>8.3f} ({m[k]['ci95'][0]:.3f}-{m[k]['ci95'][1]:.3f})" for k in ("precision", "recall", "f1"))
    lines = [f"Module prompt v1 vs v2 on {len(mods)} NEW modules ({sum(len(key[m['job_ref']]) for m in mods)} answer-key skills)",
             "", f"{'':<6} {'found':>6} {'precision':>21} {'recall':>21} {'F1':>21}"]
    for v in pred:
        lines.append(f"{v:<6} {sum(r['tp'] + r['fp_n'] for r in rows[v]):>6} {fmt(cis[v])}")
    lines.append("(95% CI, bootstrap over modules)")
    verdicts = {}
    for base, new in (("v1", "v2"), ("v2", "v2b")):
        if new not in rows:
            continue
        d = sb.paired(rows[base], rows[new])
        f1 = d["f1"]
        ok = f1["diff"] > 0 and f1["ci95"][0] > 0
        verdicts[new] = (f"{new} F1 {f1['diff']:+.3f} vs {base} (CI {f1['ci95'][0]:+.3f} to {f1['ci95'][1]:+.3f}): "
                         + ("PASS" if ok else "FAIL"))
        lines += ["", f"{new} minus {base}, paired 95% CI over modules:"]
        lines += [f"  {k:<9} {d[k]['diff']:+.3f}  (CI {d[k]['ci95'][0]:+.3f} to {d[k]['ci95'][1]:+.3f})" for k in ("precision", "recall", "f1")]
        lines.append(f"  -> {verdicts[new]}")
        cis[new]["minus_" + base] = d
    winner = "v1"
    if verdicts.get("v2", "").endswith("PASS"):
        winner = "v2b" if verdicts.get("v2b", "").endswith("PASS") else "v2"
    lines += ["", f"Decision by the rule fixed before the result: use {winner}"]
    spot = e1.read_csv("spot_check.csv")
    checked = [r for r in spot if r["kind"] == "agreed" and (r["your_check"] or "").strip().lower() in ("correct", "wrong")]
    if checked:
        right = sum(r["your_check"].strip().lower() == "correct" for r in checked)
        lines.append(f"Answer-key check by the author ({len({r['job_ref'] for r in checked})} modules): {right} of "
                     f"{len(checked)} agreed skills correct; {sum(1 for r in spot if r['kind'] == 'missing')} missed by all three")
    errors = []
    for v, rs in rows.items():
        for r in rs:
            errors += [{"variant": v, "code": r["job_ref"], "module": r["title"], "error": "extra (not in answer key)", "skill": s} for s in r["fp"]]
            errors += [{"variant": v, "code": r["job_ref"], "module": r["title"], "error": "missed (in answer key)", "skill": s} for s in r["fn"]]
    with open(e1.path("scores.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    with open(e1.path("errors.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["variant", "code", "module", "error", "skill"])
        w.writeheader()
        w.writerows(errors)
    if have_onet:
        e1.save("v2b_skills.json", pred["v2b"])
    print("\n".join(lines))
    from app.services.evaluation_runs import record
    for v in pred:
        record(f"E1 module prompt {v} (new modules)", objective=1,
               method="fresh extraction vs answer key (2 of 3 labellers, main subject listed), canonical key, micro "
                      "P/R/F1, 95% bootstrap over modules; paired comparison v1 -> v2 -> v2b; rule fixed before results",
               dataset={"modules": len(mods), "sample": "30 modules not in step 3, stratified by family, seed 2",
                        "variant": v, "found": sum(r["tp"] + r["fp_n"] for r in rows[v])},
               metrics=cis[v], verdict=verdicts.get(v, f"decision: use {winner}" if v == "v1" else None),
               files=[e1.path("modules.json"), e1.path("answer_key.json"), e1.path("module_extractions.json"),
                      e1.path("spot_check.csv")])
    print("Written scores.txt and errors.csv.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("step", choices=["sample", "extract", "qwen", "gemini", "merge", "score"])
    ap.add_argument("--n", type=int, default=N_MODULES)
    ap.add_argument("--seed", type=int, default=SEED)
    ap.add_argument("--pause", type=float, default=2.0)
    a = ap.parse_args()
    use_files()
    {"sample": lambda: sample(a.n, a.seed), "extract": lambda: extract(a.pause),
     "qwen": lambda: e1.label("qwen", e1.ask_qwen, a.pause), "gemini": lambda: e1.label("gemini", e1.ask_gemini, a.pause),
     "merge": e1.merge, "score": score}[a.step]()
