"""
E1b: how well SkillMap extracts the skills a job ad asks for (IR Objective 1, evaluation; the extractor is frozen).

Plan agreed 9 Oct (roadmap "E1 PLAN"), fixed before any result is seen:
  - 30 live ads, stratified by JobStreet ICT subcategory (seed 1), the text the extractor read (full JSearch text)
  - answer key = technical skills listed by at least 2 of 3 independent labellers, Claude, Qwen and Gemini (three
    model families, none of them the extractor, gpt-oss, so the extractor never grades itself): majority vote, as
    with several non-expert annotators (Snow et al., EMNLP 2008). A skill only one of them listed stays out; the
    author MAY keep one in disagreements.csv (10 Oct, before any result: deciding all 252 by hand was too much, the
    spot-check below measures what the majority vote gets wrong or misses instead). All follow labelling_guide.md and never see the extractor's
    skills. (10 Oct, before any result: Gemini added and the author's spot-check of 5 ads, her choice "1+2".)
  - spot-check: the author checks every skill the labellers agreed on in 5 ads (seed 2) and adds any all three
    missed, to measure how often the labellers are wrong together (reported, the answer key is not changed)
  - compared with the extractor's stored hard skills (any level) by the app's canonical skill key (same rule the app
    uses to call two names one skill); soft skills are left out of both sides (too subjective to label)
  - precision, recall, F1 (micro, over all skills) with a 95% bootstrap interval over ads (10,000 resamples, seed 0)

Steps (from backend/, venv active; files go to ../docs/evidence/job_skill_extraction/):
  python scripts/evaluation/evaluate_job_skill_extraction.py sample     # 1. pick the 30 ads -> ads.json + ads.md (no skills shown)
     -> upload ads.json to Claude, who labels them blind -> save its answer as answer_key_claude.json
  python scripts/evaluation/evaluate_job_skill_extraction.py qwen       # 2. Qwen labels the same ads (Groq) -> answer_key_qwen.json
  python scripts/evaluation/evaluate_job_skill_extraction.py gemini     # 3. Gemini labels them -> answer_key_gemini.json
  python scripts/evaluation/evaluate_job_skill_extraction.py merge      # 4. answer_key.json (2 of 3), spot_check.csv to
                                                                        #    fill, disagreements.csv (optional keeps)
  python scripts/evaluation/evaluate_job_skill_extraction.py merge      # 5. again after any keeps (spot-check answers stay)
  python scripts/evaluation/evaluate_job_skill_extraction.py score      # 6. scores.txt, per_ad.csv, errors.csv
"""
import argparse
import csv
import json
import os
import random
import re
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
LABELLERS = ("claude", "qwen", "gemini")
SPOT_ADS, SPOT_SEED = 5, 2
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
    print(f"Written {path('ads.json')}, ads.md and labelling_guide.md. Next: upload ads.json to Claude, then run qwen and gemini.")


# ── 2. qwen ──────────────────────────────────────────────────────────────────────────────────────────────────────
def ask_qwen(prompt: str) -> list[str]:
    from groq import Groq
    from app.config import settings
    r = Groq(api_key=settings.groq_api_key).chat.completions.create(
        model=os.getenv("QWEN_JUDGE_MODEL") or QWEN_MODEL, temperature=0, max_completion_tokens=4096,
        response_format={"type": "json_object"}, messages=[{"role": "user", "content": prompt}])
    skills = json.loads(r.choices[0].message.content or "{}").get("skills", [])
    return [" ".join(str(s).split()) for s in skills if str(s).strip()]


def ask_gemini(prompt: str) -> list[str]:
    from google import genai
    from google.genai import types
    from app.config import settings
    model = os.getenv("GEMINI_JUDGE_MODEL") or os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY") or settings.gemini_api_key)
    r = client.models.generate_content(model=model, contents=prompt, config=types.GenerateContentConfig(
        temperature=0, response_mime_type="application/json",
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True)))
    skills = json.loads(r.text or "{}").get("skills", [])
    return [" ".join(str(s).split()) for s in skills if str(s).strip()]


def label(who: str, ask, pause: float):
    """One labeller over all ads; saved after each ad, so a stopped run (daily limit) continues where it stopped."""
    ads, name = load("ads.json"), f"answer_key_{who}.json"
    done = load(name) if os.path.exists(path(name)) else {}
    for i, a in enumerate(ads, 1):
        if a["job_ref"] in done:
            continue
        try:
            done[a["job_ref"]] = ask(QWEN_PROMPT.format(title=a["title"], text=a["text"]))
        except Exception as e:     # daily limit or network: keep what is done, run again later to continue
            print(f"Stopped at ad {i}: {type(e).__name__}: {e}")
            break
        save(name, done)
        print(f"{i:>2}/{len(ads)}  {len(done[a['job_ref']]):>2} skills  {a['title']}")
        time.sleep(pause)
    print(f"{who.capitalize()} labelled {len(done)} of {len(ads)} ads.")


# ── 3. merge ─────────────────────────────────────────────────────────────────────────────────────────────────────
# Same skill, different name (10 Oct, before any result; her first merge had 283 rows to decide, many only wording:
# "Amazon S3" / "AWS S3" / "S3", "Predictive modelling" / "modeling", "ERP" / "ERP systems"). Two names are one skill
# if the app's canonical key is equal, or they are equal after these safe rules: British -> American spelling, a
# leading AWS / Amazon / Microsoft / MS dropped, a trailing generic word dropped (systems, platforms, methodology,
# tools, technologies, services...), plurals made singular. Used the same way for the answer key and for scoring.
SPELLING = [("isation", "ization"), ("ising", "izing"), ("modelling", "modeling"), ("analyse", "analyze"),
            ("colour", "color"), ("licence", "license"), ("catalogue", "catalog"), ("behaviour", "behavior"),
            ("centre", "center"), ("optimise", "optimize"), ("organise", "organize"), ("visualise", "visualize")]
PREFIXES = ("aws ", "amazon ", "microsoft ", "ms ")
GENERIC = {"methodology", "methodologies", "method", "methods", "system", "systems", "platform", "platforms", "tool",
           "tools", "technology", "technologies", "service", "services", "concepts", "fundamentals", "knowledge", "skills", "os"}


def plain(name: str) -> str:
    s = " ".join(re.sub(r"[^a-z0-9+#/. ]", " ", name.lower()).split())
    for a, b in SPELLING:
        s = s.replace(a, b)
    for p in PREFIXES:
        if s.startswith(p) and len(s) > len(p):
            s = s[len(p):]
    words = s.split()
    while len(words) > 1 and words[-1] in GENERIC:
        words.pop()
    return " ".join(w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith(("ss", "is", "us")) else w for w in words)


def clusters(named: dict[str, list[str]]) -> list[dict[str, str]]:
    """Names from several sources (labellers, or answer key + extractor) grouped into skills: each group is
    {source: the name it used}; a source's own duplicates collapse into one."""
    items = [(src, n) for src, names in named.items() for n in names if canonical_key(n)]
    parent = list(range(len(items)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    seen = {}
    for i, (_, n) in enumerate(items):
        for k in (("ck", canonical_key(n)), ("plain", plain(n))):
            if k[1]:
                if k in seen:
                    parent[find(i)] = find(seen[k])
                else:
                    seen[k] = i
    groups = {}
    for i, (src, n) in enumerate(items):
        groups.setdefault(find(i), {}).setdefault(src, n)
    return list(groups.values())


def words(name: str) -> set[str]:
    return set(plain(name).replace("-", " ").replace("/", " ").split())


# Where a spot-check skill is in the ad (10 Oct, her request: the check should not need searching the ad, and
# should come from the code, not a hand-made file): the ad sentence naming it, so she only judges "is this a
# technical skill the job needs, by the guide". Plain text search, no AI.
_STOP = {"and", "of", "the", "for", "with", "a", "to", "in", "models", "model", "tools", "systems", "development",
         "management"}


def where_in_ad(skill: str, text: str) -> tuple[str, str]:
    """("found" / "words found" / "partly" / "not found", the ad sentence)."""
    sents = [x.strip() for x in re.split(r"(?<=[.!?;:])\s+|\n+|\u2022", text or "") if x.strip()]
    low = str.lower
    variants = []
    for v in (skill, re.sub(r"\s+", "", skill), skill.replace("-", " "), plain(skill)):
        variants += [v, v[:-1] if v.lower().endswith("s") else v + "s", re.sub(r"ing$", "", v), re.sub(r"ful\b", "", v)]
    for v in variants:
        for x in sents:
            if v and re.search(r"(?<![a-z0-9])" + re.escape(low(v)) + r"(?![a-z0-9])", low(x)):
                return "found", x
    words = [w for w in re.findall(r"[a-z0-9+#]+", low(skill)) if w not in _STOP and len(w) > 1]
    best = None
    for x in sents:
        hit = sum(1 for w in words if re.search(r"(?<![a-z0-9])" + re.escape(w[:max(4, len(w) - 3)]), low(x)))
        if words and hit == len(words):
            return "words found", x
        if hit and (not best or hit > best[0]):
            best = (hit, x)
    return ("partly", best[1]) if best else ("not found", "")


def read_csv(name: str) -> list[dict]:
    if not os.path.exists(path(name)):
        return []
    with open(path(name), encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def write_csv(name: str, rows: list[dict], fields: list[str]):
    with open(path(name), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


def merge():
    ads = load("ads.json")
    labels = {who: load(f"answer_key_{who}.json") for who in LABELLERS if os.path.exists(path(f"answer_key_{who}.json"))}
    if len(labels) < len(LABELLERS):
        sys.exit(f"Missing labels from: {', '.join(w for w in LABELLERS if w not in labels)}.")
    missing = [a["job_ref"] for a in ads if any(a["job_ref"] not in l for l in labels.values())]
    if missing:
        sys.exit(f"{len(missing)} ads lack a label from one of the labellers (e.g. {missing[0]}).")
    decided = {(r["job_ref"], r["key"]): (r["your_decision"] or "").strip().lower() for r in read_csv("disagreements.csv")}
    rows, key, spot = [], {}, []
    votes_total = {1: 0, 2: 0, 3: 0}
    spot_refs = {a["job_ref"] for a in random.Random(SPOT_SEED).sample(ads, SPOT_ADS)}
    old_spot = {(r["job_ref"], r["skill"]): r for r in read_csv("spot_check.csv")}
    order = {who.capitalize(): i for i, who in enumerate(LABELLERS)}
    for a in ads:
        groups = clusters({who.capitalize(): labels[who][a["job_ref"]] for who in LABELLERS})
        key[a["job_ref"]] = []
        agreed = []
        for g in groups:
            votes_total[len(g)] += 1
            if len(g) >= 2:
                name = min(g.values(), key=lambda n: list(g.values()).count(n) * -1)  # the name most labellers used
                agreed.append(name)
                key[a["job_ref"]].append(name)
                if a["job_ref"] in spot_refs:
                    prev = old_spot.get((a["job_ref"], name), {})
                    found, sentence = where_in_ad(name, a["text"])
                    spot.append({"job_ref": a["job_ref"], "title": a["title"], "kind": "agreed", "skill": name,
                                 "your_check": prev.get("your_check", ""), "in_ad": found,
                                 "where_in_ad": sentence if len(sentence) <= 220 else sentence[:220] + "…"})
        singles = sorted((g for g in groups if len(g) == 1), key=lambda g: order[next(iter(g))])
        for g in singles:
            by, name = next(iter(g.items()))
            k = canonical_key(name)
            # hint only: a skill in the answer key whose words contain this one's, or the other way round
            near = [x for x in agreed if words(name) and (words(name) < words(x) or words(x) < words(name))]
            d = decided.get((a["job_ref"], k), "")
            rows.append({"job_ref": a["job_ref"], "title": a["title"], "skill": name, "key": k, "listed_by": by,
                         "similar_in_answer_key": "; ".join(near), "your_decision": d})
            if d == "keep":
                key[a["job_ref"]].append(name)
    # skills the author added in the spot-check as missed by all three stay in the file
    spot += [r for r in read_csv("spot_check.csv") if r.get("kind") == "missing"]
    write_csv("disagreements.csv", rows, ["job_ref", "title", "skill", "key", "listed_by", "similar_in_answer_key",
                                          "your_decision"])
    write_csv("spot_check.csv", spot, ["job_ref", "title", "kind", "skill", "your_check", "in_ad", "where_in_ad"])
    union = sum(votes_total.values())
    print(f"{union} different skills listed: all three agree on {votes_total[3]} ({votes_total[3] / union:.0%}), two on "
          f"{votes_total[2]} ({votes_total[2] / union:.0%}), only one on {votes_total[1]} ({votes_total[1] / union:.0%}).")
    open_spot = [r for r in spot if r["kind"] == "agreed" and (r["your_check"] or "").strip().lower() not in ("correct", "wrong", "unsure")]
    kept = sum(1 for r in rows if r["your_decision"] == "keep")
    print(f"{len(rows)} skills listed by only one labeller stay out of the answer key ({kept} kept by you in "
          f"disagreements.csv; optional: type keep there for one the ad really needs, then run merge again).")
    if open_spot:
        print(f"Spot-check: {len(open_spot)} agreed skills in {SPOT_ADS} ads to check in {path('spot_check.csv')}: type "
              f"correct (the ad names it and it is a technical skill by the guide), wrong (it does not, or it is a task, "
              f"soft skill or company product) or unsure in your_check (where_in_ad shows the ad sentence naming it; ads.md has the whole ad). For a skill all three missed, add a row with "
              f"kind = missing and the skill name.")
    save("answer_key.json", key)
    print(f"answer_key.json written ({sum(map(len, key.values()))} skills in {len(key)} ads). Next: the spot-check, then score.")


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
        groups = clusters({"key": key[a["job_ref"]], "pred": predicted.get(ids.get(a["job_ref"]), [])})
        tp = [g for g in groups if len(g) == 2]
        fp = [g["pred"] for g in groups if list(g) == ["pred"]]
        fn = [g["key"] for g in groups if list(g) == ["key"]]
        per_ad.append({"job_ref": a["job_ref"], "title": a["title"], "subcategory": a["subcategory"],
                       "answer_key": len(tp) + len(fn), "predicted": len(tp) + len(fp),
                       "tp": len(tp), "fp": len(fp), "fn": len(fn)})
        errors += [{"job_ref": a["job_ref"], "title": a["title"], "error": "extra (not in answer key)", "skill": n} for n in fp]
        errors += [{"job_ref": a["job_ref"], "title": a["title"], "error": "missed (in answer key)", "skill": n} for n in fn]
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
    spot = read_csv("spot_check.csv")
    checked = [r for r in spot if r["kind"] == "agreed" and (r["your_check"] or "").strip().lower() in ("correct", "wrong")]
    if checked:
        right = sum(1 for r in checked if r["your_check"].strip().lower() == "correct")
        missed = sum(1 for r in spot if r["kind"] == "missing")
        unsure = sum(1 for r in spot if r["kind"] == "agreed" and (r["your_check"] or "").strip().lower() == "unsure")
        lines.append(f"Answer-key check by the author ({len({r['job_ref'] for r in checked})} ads): {right} of "
                     f"{len(checked)} agreed skills correct ({right / len(checked):.0%}); {missed} skill{'' if missed == 1 else 's'} "
                     f"all three labellers missed; {unsure} marked unsure (left out)")
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
    ap.add_argument("step", choices=["sample", "qwen", "gemini", "merge", "score"])
    ap.add_argument("--n", type=int, default=N_ADS)
    ap.add_argument("--seed", type=int, default=SEED)
    ap.add_argument("--pause", type=float, default=2.0, help="seconds between Qwen calls")
    a = ap.parse_args()
    {"sample": lambda: sample(a.n, a.seed), "qwen": lambda: label("qwen", ask_qwen, a.pause),
     "gemini": lambda: label("gemini", ask_gemini, a.pause), "merge": merge, "score": score}[a.step]()
