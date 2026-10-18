"""
E2 ranking (15 Oct, evaluation step 4; IR Objective 2): does SkillMap's Job Matches order put suitable jobs nearer
the top than plain keyword matching?

Plan, fixed on 15 Oct BEFORE any result was seen (research: references.md "Ranking evaluation method"):
  - 10 graduate profiles, one per programme (SE, CS, CS-DA, CS-AI, CS-CY, IT, IT-CE, IT-BIS, GD, IMIT): the
    programme's compulsory and specialised modules of years 1-3 as stored now, grades drawn from a fixed spread
    (seed 1). Ranked through the app's own code: a temporary student is created inside a database transaction that
    is rolled back, so nothing is saved and the profile is built exactly as for a real student
  - the jobs Job Matches would show today (live, not too old), frozen in rankings.json
  - four orders: S = SkillMap (POST /recommend, Best fit, all jobs); B1 = keyword: share of the job's required
    skills whose name is in the profile word for word (same extracted job skills, no SBERT, no relationship model,
    no level penalty); B2 = B1 minus SkillMap's level penalty (separates "semantic matching" from "level"); R = random
  - pooling: the union of each order's top 10 per profile is judged; nothing outside it is scored
  - judges: Claude, Qwen, Gemini, never told which order suggested a job, grade each pair 0 / 1 / 2 with JUDGE_GUIDE
    from the programme and module names (not SkillMap's skill list, so the judges don't share its view); final grade
    = median of the three (Thomas et al. 2024: LLM labels about as accurate as human labellers, prompt-sensitive ->
    one fixed prompt, three judges, the author's spot-check of one profile, seed 2)
  - ad text (changed 16 Oct, BEFORE any score was computed): the judges see the title and the first AD_CHARS = 3,000
    characters of the ad (whitespace collapsed). The first run cut ads at 900: many ads spend those on the company
    introduction, so a grade could rest on the title alone (found by the author during the spot-check). TREC tells
    assessors a document is relevant if ANY part of it is (trec.nist.gov/data/qrels_noneng), which needs the
    requirements in view. The 900-character grades are kept in old_900/ and not used. Pairs, orders and the pass
    rule are unchanged
  - metrics: nDCG@10 (gain = grade; ideal = the profile's best judged jobs; Jarvelin & Kekalainen) and P@10 (share of
    grade 2 in the top 10); 95% paired bootstrap over profiles (10,000, seed 0)
  - pass rule: SkillMap beats keyword matching if its nDCG@10 is higher than B1's and the paired 95% interval of the
    difference is above 0. S vs B2 and S vs R are reported whatever the outcome

Steps (from backend/, venv active; files go to ../docs/evidence/ranking/):
  python scripts/evaluation/evaluate_ranking.py rank      # 1. profiles, the four orders, judging.json (+ .md)
     -> upload judging.json to Claude, who grades blind -> save as grades_claude.json
  python scripts/evaluation/evaluate_ranking.py refresh-ads   # 16 Oct, once: longer ad text in judging.json (same pairs);
                                                             # old grades -> old_900/, so every judge grades again
  python scripts/evaluation/evaluate_ranking.py qwen      # 2. Qwen grades (Groq; one call per profile chunk)
  python scripts/evaluation/evaluate_ranking.py gemini    # 3. Gemini grades
  python scripts/evaluation/evaluate_ranking.py merge     # 4. grades.json (median) + spot_check.csv
     -> fill your_check in spot_check.csv (correct / wrong / unsure), then merge again
  python scripts/evaluation/evaluate_ranking.py score     # 5. scores.txt, per_profile.csv
"""
import argparse
import csv
import json
import math
import os
import random
import sys
import time
from statistics import median
from types import SimpleNamespace

sys.path.append(".")

OUT = "../docs/evidence/ranking"
PROGRAMMES = ("SE", "CS", "CS-DA", "CS-AI", "CS-CY", "IT", "IT-CE", "IT-BIS", "GD", "IMIT")
GRADES = ((4.0, 20), (3.7, 15), (3.3, 25), (3.0, 20), (2.7, 10), (2.3, 7), (2.0, 3))   # grade, weight (%)
SEED, SPOT_SEED, K, CHUNK = 1, 2, 10, 4    # 4 pairs per judge call: longer ads (16 Oct; was 12 at 900 characters)
AD_CHARS = 3000                              # characters of each ad the judges see (16 Oct; was 900)
SYSTEMS = ("S", "B1", "B2", "R")
JUDGES = ("claude", "qwen", "gemini")

JUDGE_GUIDE = """# Judging guide: is this job a sensible recommendation for this graduate?

You see a final-year university student in Malaysia (their degree programme and the modules they have passed) and
several job ads. Grade each job for this student:

2 = good fit: a fresh graduate of this programme with these modules could reasonably apply, and would meet most of
    what the job asks for
1 = partly: a related field, but the job needs notable skills the modules don't cover, or it is a step above a
    graduate role (a few years' experience)
0 = not a fit: a different field, a clearly senior or managerial role, or most requirements unrelated to the modules

Judge only from the programme, the modules and the ad. Ignore salary, company name and location. Grade each job on
its own; the order of the jobs means nothing.
"""

JUDGE_PROMPT = JUDGE_GUIDE + """
Return only JSON: {{"grades": {{"<pair id>": 0, "<pair id>": 2}}}} with every pair id below.

Student: {programme}
Modules passed: {modules}

Jobs:
{jobs}"""


def path(name):
    return os.path.join(OUT, name)


def load(name):
    with open(path(name), encoding="utf-8") as f:
        return json.load(f)


def save(name, data):
    os.makedirs(OUT, exist_ok=True)
    with open(path(name), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


# ── 1. profiles and the four orders ──────────────────────────────────────────────────────────────────────────────
def profiles(db) -> list[dict]:
    from app.models.module import Module
    from app.models.programme import Programme, ProgrammeModule
    rng = random.Random(SEED)
    grades, weights = zip(*GRADES)
    out = []
    for code in PROGRAMMES:
        prog = db.query(Programme).filter(Programme.code == code).first()
        if not prog:
            print(f"  programme {code} not found: left out")
            continue
        rows = (db.query(Module, ProgrammeModule).join(ProgrammeModule, ProgrammeModule.module_id == Module.id)
                .filter(ProgrammeModule.programme_id == prog.id, ProgrammeModule.year <= 3,
                        ProgrammeModule.kind != "elective").order_by(ProgrammeModule.year, Module.code).all())
        mods = [{"code": m.code, "name": m.name, "year": pm.year, "grade": rng.choices(grades, weights)[0]} for m, pm in rows]
        out.append({"id": code, "programme": prog.name, "modules": mods})
    return out


def keyword_order(eligible, profile_keys, with_level) -> list:
    from app.routers.recommend import seniority_penalty
    from app.services.job_requirements import score_job
    scored = []
    for job_id, c in eligible:
        sc = score_job(c["items"], [it.key in profile_keys for it in c["items"]])
        if sc["total"] == 0:
            continue                                  # SkillMap leaves these out too (nothing to compare)
        score = sc["matched"] / sc["total"] - (seniority_penalty(c["level"]) if with_level else 0)
        scored.append((-score, -sc["matched"], c["job_id"]))
    return [ref for _, _, ref in sorted(scored)]


def rank():
    if os.path.exists(path("rankings.json")):
        sys.exit("rankings.json already exists: the profiles and orders are fixed once made (delete only before judging).")
    from app.database import SessionLocal
    from app.models.job import Job
    from app.models.user import User
    from app.models.user_module import UserModule
    import app.routers.recommend as rec
    from app.services.skill_profile import build_skill_profile
    db = SessionLocal()
    try:
        profs = profiles(db)
        rec.build_job_cache()
        eligible = [(j, c) for j, c in list(rec._job_cache.items()) if rec.is_current(c) and not rec.too_old(c)]
        snapshot = sorted(c["job_id"] for _, c in eligible)
        print(f"{len(profs)} profiles, {len(eligible)} jobs Job Matches would show today")
        orders = {}
        for p in profs:
            # a temporary student, inside a transaction that is rolled back below: nothing is saved
            u = User(username=f"_eval_{p['id']}", first_name="Eval", last_name=p["id"], email=f"_eval_{p['id']}@example.invalid",
                     hashed_password="-", is_active=True)
            db.add(u)
            db.flush()
            for m in p["modules"]:
                db.add(UserModule(user_id=u.id, module_code=m["code"], grade=m["grade"]))
            db.flush()
            res = rec.recommend_jobs(rec.RecommendRequest(top_n=0), db=db, current_user=u)
            s = [r["job_id"] for r in res["recommendations"]]
            keys = set(build_skill_profile(u.id, db))
            db.rollback()
            rng = random.Random(f"{SEED}-{p['id']}")
            r = [c["job_id"] for _, c in eligible]
            rng.shuffle(r)
            orders[p["id"]] = {"S": s, "B1": keyword_order(eligible, keys, False),
                               "B2": keyword_order(eligible, keys, True), "R": r}
            p["skills"] = len(keys)
            print(f"  {p['id']:<7} {len(p['modules'])} modules, {len(keys)} skills, {len(s)} jobs ranked")
        info = {c["job_id"]: c for _, c in eligible}
        texts = {j.job_id: (j.description or "") for j in db.query(Job).filter(Job.job_id.in_(snapshot))}
    finally:
        db.rollback()
        db.close()
    pairs, rng = [], random.Random(SEED)
    for p in profs:
        pool = sorted({ref for sysname in SYSTEMS for ref in orders[p["id"]][sysname][:K]})
        rng.shuffle(pool)                              # judges never see which order suggested a job
        for ref in pool:
            c = info[ref]
            pairs.append({"pair": f"{p['id']}|{ref}", "profile": p["id"], "job_ref": ref, "title": c["job_title"],
                          "company": c["company"] or "", "ad": " ".join(texts.get(ref, "").split())[:AD_CHARS]})
    save("profiles.json", profs)
    save("rankings.json", {"snapshot": snapshot, "orders": {p: {s: o[:50] for s, o in v.items()} for p, v in orders.items()}})
    data = {"guide": JUDGE_GUIDE, "ad_chars": AD_CHARS,
            "profiles": {p["id"]: {"programme": p["programme"], "modules": [m["name"] for m in p["modules"]]} for p in profs},
            "pairs": pairs}
    save("judging.json", data)
    write_judging_md(data)
    print(f"{len(pairs)} pairs to judge (pooled top {K} of S, B1, B2, R). Written {path('judging.json')}.")


def write_judging_md(data):
    with open(path("judging.md"), "w", encoding="utf-8") as f:
        f.write(data["guide"] + "\n")
        for pid, prof in data["profiles"].items():
            f.write(f"\n## {prof['programme']}\nModules: {', '.join(prof['modules'])}\n\n")
            for x in (x for x in data["pairs"] if x["profile"] == pid):
                f.write(f"- pair {x['pair']}: {x['title']}\n  {x['ad']}\n")


OLD_RUN_FILES = ("grades_claude.json", "grades_qwen.json", "grades_gemini.json", "grades.json", "spot_check.csv",
                 "scores.txt", "per_profile.csv")


def refresh_ads():
    """16 Oct: give the judges AD_CHARS of each ad instead of 900 (same pairs, same order, same rankings). The grades
    made on the short text move to old_900/ (kept, not used), so all three judges and the spot-check start again."""
    data = load("judging.json")
    if data.get("ad_chars") == AD_CHARS:
        sys.exit(f"judging.json already has {AD_CHARS}-character ads: nothing to do.")
    from app.database import SessionLocal
    from app.models.job import Job
    refs = sorted({x["job_ref"] for x in data["pairs"]})
    db = SessionLocal()
    try:
        texts = {j.job_id: (j.description or "") for j in db.query(Job).filter(Job.job_id.in_(refs))}
    finally:
        db.close()
    missing = [r for r in refs if r not in texts]
    if missing:                                    # a job deleted since rank: its pairs keep the short text
        print(f"{len(missing)} job(s) no longer in the database, kept as they were: {', '.join(missing[:3])}")
    longer = 0
    for x in data["pairs"]:
        if x["job_ref"] in texts:
            ad = " ".join(texts[x["job_ref"]].split())[:AD_CHARS]
            longer += len(ad) > len(x["ad"])
            x["ad"] = ad
    data["ad_chars"] = AD_CHARS
    moved = []
    for name in OLD_RUN_FILES:
        if os.path.exists(path(name)):
            os.makedirs(path("old_900"), exist_ok=True)
            os.replace(path(name), os.path.join(path("old_900"), name))
            moved.append(name)
    save("judging.json", data)
    write_judging_md(data)
    print(f"{len(data['pairs'])} pairs, {longer} with a longer ad now (up to {AD_CHARS} characters). "
          f"Moved to old_900/: {', '.join(moved) or 'nothing'}. Upload judging.json,run qwen and gemini.")


# ── 2-3. Qwen and Gemini ─────────────────────────────────────────────────────────────────────────────────────────
def judge(who: str, pause: float):
    data, name = load("judging.json"), f"grades_{who}.json"
    done = load(name) if os.path.exists(path(name)) else {}
    todo = [x for x in data["pairs"] if x["pair"] not in done]
    for pid, prof in data["profiles"].items():
        rows = [x for x in todo if x["profile"] == pid]
        for i in range(0, len(rows), CHUNK):
            chunk = rows[i:i + CHUNK]
            jobs = "\n\n".join(f"[{x['pair']}] {x['title']}\n{x['ad']}" for x in chunk)
            prompt = JUDGE_PROMPT.format(programme=prof["programme"], modules="; ".join(prof["modules"]), jobs=jobs)
            try:
                got, reply = ask_grades(who, prompt)
                got = by_pair(got, chunk)
                # 16 Oct: a judge sometimes leaves a few pairs out of a group, again on every run -> ask for those one by one
                for x in [x for x in chunk if got.get(x["pair"]) not in (0, 1, 2)] if len(chunk) > 1 else []:
                    time.sleep(pause)
                    one = JUDGE_PROMPT.format(programme=prof["programme"], modules="; ".join(prof["modules"]),
                                              jobs=f"[{x['pair']}] {x['title']}\n{x['ad']}")
                    g1, reply = ask_grades(who, one)
                    g1 = by_pair(g1, [x])
                    got.update(g1)
                    if g1.get(x["pair"]) not in (0, 1, 2):
                        print(f"    no grade for {x['pair']} ({x['title']}). The judge replied: {(reply or '(nothing)')[:300]!r}")
            except Exception as e:                     # daily limit or network: keep what is done, run again later
                save(name, done)
                sys.exit(f"Stopped at {pid}: {type(e).__name__}: {e}. Run {who} again later to continue.")
            for x in chunk:
                g = got.get(x["pair"])
                if g in (0, 1, 2):
                    done[x["pair"]] = g
            save(name, done)
            print(f"  {pid}: {sum(1 for x in chunk if x['pair'] in done)}/{len(chunk)} graded")
            time.sleep(pause)
    graded = sum(1 for x in data["pairs"] if x["pair"] in done)    # pairs of the current judging.json only
    left = len(data["pairs"]) - graded
    print(f"{who.capitalize()} graded {graded} of {len(data['pairs'])} pairs" + (f" ({left} missing: run again)" if left else "."))


def by_pair(got: dict, chunk: list) -> dict:
    """The grades keyed by pair id. 16 Oct: Gemini sometimes writes the job id without the profile ("live_x" for
    "CS-AI|live_x"); one prompt holds one profile's jobs, so the job id names the pair without doubt."""
    out = dict(got)
    for x in chunk:
        if x["pair"] not in out and x["job_ref"] in got:
            out[x["pair"]] = got[x["job_ref"]]
    return out


def ask_grades(who: str, prompt: str) -> tuple[dict, str]:
    """One judge call: ({pair id: 0/1/2}, the raw reply). Reuses the E1b clients' settings (models, keys)."""
    from app.config import settings
    if who == "qwen":
        from groq import Groq
        sys.path.append(os.path.dirname(os.path.abspath(__file__)))
        import evaluate_job_skill_extraction as e1
        r = Groq(api_key=settings.groq_api_key).chat.completions.create(
            model=os.getenv("QWEN_JUDGE_MODEL") or e1.QWEN_MODEL, temperature=0, max_completion_tokens=4096,
            response_format={"type": "json_object"}, messages=[{"role": "user", "content": prompt}])
        text = r.choices[0].message.content
    else:
        from google import genai
        from google.genai import types
        model = os.getenv("GEMINI_JUDGE_MODEL") or os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
        client = genai.Client(api_key=os.getenv("GEMINI_API_KEY") or settings.gemini_api_key)
        text = client.models.generate_content(model=model, contents=prompt, config=types.GenerateContentConfig(
            temperature=0, response_mime_type="application/json",
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True))).text
    try:
        grades = json.loads(text or "{}").get("grades", {})
    except (ValueError, AttributeError):          # not JSON or not an object: no grades, the caller shows the reply
        grades = {}
    if not isinstance(grades, dict):
        grades = {}
    return {str(k).strip(): int(v) for k, v in grades.items() if str(v).strip() in ("0", "1", "2")}, text


# ── 4. merge ─────────────────────────────────────────────────────────────────────────────────────────────────────
def merge():
    data = load("judging.json")
    g = {who: load(f"grades_{who}.json") for who in JUDGES if os.path.exists(path(f"grades_{who}.json"))}
    if len(g) < len(JUDGES):
        sys.exit(f"Missing grades from: {', '.join(w for w in JUDGES if w not in g)}.")
    missing = [x["pair"] for x in data["pairs"] if any(x["pair"] not in v for v in g.values())]
    if missing:
        sys.exit(f"{len(missing)} pairs lack a grade from a judge (e.g. {missing[0]}): run that judge again.")
    final = {x["pair"]: int(median(g[w][x["pair"]] for w in JUDGES)) for x in data["pairs"]}
    save("grades.json", final)
    agree = sum(1 for x in data["pairs"] if len({g[w][x["pair"]] for w in JUDGES}) == 1)
    spot_profile = random.Random(SPOT_SEED).choice(sorted(data["profiles"]))
    old = {r["pair"]: r for r in read_csv("spot_check.csv")}
    rows = [{"pair": x["pair"], "programme": data["profiles"][x["profile"]]["programme"], "job": x["title"],
             "grade (median of 3)": final[x["pair"]], "your_check": old.get(x["pair"], {}).get("your_check", ""),
             "ad (as the judges saw it)": x["ad"]} for x in data["pairs"] if x["profile"] == spot_profile]
    write_csv("spot_check.csv", rows)
    print(f"{len(final)} pairs graded; all three judges agree on {agree} ({agree / len(final):.0%}). "
          f"Spot-check: the {len(rows)} jobs of profile {spot_profile} in {path('spot_check.csv')} "
          f"(type correct / wrong / unsure in your_check; the modules are in judging.md). Then score.")


def read_csv(name):
    if not os.path.exists(path(name)):
        return []
    with open(path(name), encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def write_csv(name, rows):
    with open(path(name), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)


# ── 5. score ─────────────────────────────────────────────────────────────────────────────────────────────────────
def ndcg(order: list, grades: dict, pid: str) -> float:
    gains = [grades.get(f"{pid}|{ref}", 0) for ref in order[:K]]
    ideal = sorted((v for k, v in grades.items() if k.startswith(pid + "|")), reverse=True)[:K]
    dcg = lambda gs: sum(g / math.log2(i + 2) for i, g in enumerate(gs))
    return dcg(gains) / dcg(ideal) if dcg(ideal) else 0.0


def p_at_k(order: list, grades: dict, pid: str) -> float:
    return sum(1 for ref in order[:K] if grades.get(f"{pid}|{ref}") == 2) / K


def score():
    grades, orders = load("grades.json"), load("rankings.json")["orders"]
    pids = sorted(orders)
    per = {s: {"ndcg": [ndcg(orders[p][s], grades, p) for p in pids], "p": [p_at_k(orders[p][s], grades, p) for p in pids]}
           for s in SYSTEMS}
    mean = lambda xs: sum(xs) / len(xs)
    rng = random.Random(0)
    boots = [[rng.randrange(len(pids)) for _ in pids] for _ in range(10_000)]
    ci = lambda vals: tuple(sorted(mean([vals[i] for i in b]) for b in boots)[j] for j in (249, 9749))
    names = {"S": "SkillMap (Job Matches)", "B1": "Keyword match", "B2": "Keyword match + level penalty", "R": "Random order"}
    lines = [f"E2 ranking: {len(pids)} graduate profiles, pooled top {K} judged 0/1/2 (median of Claude, Qwen, Gemini)", "",
             f"{'':<32} {'nDCG@10':>22} {'P@10 (good fit)':>22}"]
    metrics = {}
    for s in SYSTEMS:
        n, p = per[s]["ndcg"], per[s]["p"]
        lines.append(f"{names[s]:<32} {mean(n):>8.3f} ({ci(n)[0]:.3f}-{ci(n)[1]:.3f}) {mean(p):>8.3f} ({ci(p)[0]:.3f}-{ci(p)[1]:.3f})")
        metrics[s] = {"ndcg10": round(mean(n), 3), "ndcg10_ci95": [round(v, 3) for v in ci(n)],
                      "p10": round(mean(p), 3), "p10_ci95": [round(v, 3) for v in ci(p)]}
    lines.append("(95% CI, bootstrap over profiles)")
    verdict = None
    for other in ("B1", "B2", "R"):
        d = [a - b for a, b in zip(per["S"]["ndcg"], per[other]["ndcg"])]
        lo, hi = ci(d)
        ok = mean(d) > 0 and lo > 0
        lines.append(f"\nSkillMap minus {names[other]}: nDCG@10 {mean(d):+.3f} (paired 95% CI {lo:+.3f} to {hi:+.3f})"
                     + (" -> PASS (the rule fixed beforehand)" if other == "B1" and ok else " -> FAIL" if other == "B1" else ""))
        metrics["S_minus_" + other] = {"diff": round(mean(d), 3), "ci95": [round(lo, 3), round(hi, 3)]}
        if other == "B1":
            verdict = "PASS: SkillMap beats keyword matching" if ok else "FAIL: not shown better than keyword matching"
    spot = [r for r in read_csv("spot_check.csv") if (r["your_check"] or "").strip().lower() in ("correct", "wrong")]
    if spot:
        right = sum(r["your_check"].strip().lower() == "correct" for r in spot)
        lines.append(f"\nGrades checked by the author (1 profile): {right} of {len(spot)} correct")
    with open(path("scores.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    write_csv("per_profile.csv", [{"profile": p, **{f"{s}_ndcg10": round(per[s]["ndcg"][i], 3) for s in SYSTEMS},
                                   **{f"{s}_p10": per[s]["p"][i] for s in SYSTEMS}} for i, p in enumerate(pids)])
    print("\n".join(lines))
    from app.services.evaluation_runs import record
    record("E2 ranking vs keyword baseline", objective=2,
           method="10 programme profiles; SkillMap vs keyword overlap (B1), keyword + level penalty (B2), random; "
                  "pooled top 10 judged 0/1/2 by 3 LLM judges (median); nDCG@10, P@10, paired bootstrap over profiles",
           dataset={"profiles": len(pids), "pairs": len(grades), "jobs": len(load("rankings.json")["snapshot"])},
           metrics=metrics, verdict=verdict,
           files=[path("profiles.json"), path("rankings.json"), path("judging.json"), path("grades.json"), path("spot_check.csv")])
    print("Written scores.txt and per_profile.csv.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("step", choices=["rank", "refresh-ads", "qwen", "gemini", "merge", "score"])
    ap.add_argument("--pause", type=float, default=3.0)
    a = ap.parse_args()
    {"rank": rank, "refresh-ads": refresh_ads, "qwen": lambda: judge("qwen", a.pause), "gemini": lambda: judge("gemini", a.pause),
     "merge": merge, "score": score}[a.step]()
