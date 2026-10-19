"""
E6 "other requirements" (19 Oct): how often do the reading rules in app/services/ad_requirements.py get a job ad's
qualification, field of study, languages, citizenship line and salary right?

Plan, fixed on 19 Oct BEFORE the sample was drawn (references.md "E6 other requirements: plan"):
  - the rules were written and tried on the 113 step-4 ads (docs/evidence/ranking/judging.json) and are frozen in
    the commit that adds this script. The test ads are 30 OTHER live ads: current live jobs with a description of 300+
    characters, step-4 ads left out, drawn with seed 1
  - labels: the author labels all 30 (the answer key). Three AI judges (Claude, Qwen, Gemini) label the same ads blind
    as a cross-check (Claude also wrote the rules, so it is not blind to them: reported)
  - what counts as right, per ad:
      qualification  the LOWEST level the ad accepts (none / diploma / bachelor / master / phd), exact
      field          both none, or both named and sharing at least one subject word (e.g. "computer")
      languages      the same set of languages the ad asks a candidate to speak or write (none = empty)
      citizenship    the same yes / no: does the ad limit who may apply by citizenship, residence or work pass
      salary         only for jobs with no salary field: both none, or both an amount with the same first number
  - pass rule: qualification, languages, citizenship and salary right on at least 90% of the ads, field on at least
    80%. Only the parts that pass are shown to students; a part that fails is fixed and tested on 30 NEW ads
  - 30 ads give a rough figure (one ad = 3.3 points): reported as such

Run from backend/ with the venv active, in this order:
  python scripts/evaluation/evaluate_ad_requirements.py sample          # -> ads.json, labels_author.csv, guide
  (author fills labels_author.csv; Claude labels ads.json -> labels_claude.json)
  python scripts/evaluation/evaluate_ad_requirements.py qwen --pause 20
  python scripts/evaluation/evaluate_ad_requirements.py gemini
  python scripts/evaluation/evaluate_ad_requirements.py score           # -> scores.txt, per_ad.csv, run record
Files in ../docs/evidence/ad_requirements/
"""
import argparse
import csv
import json
import os
import random
import re
import sys
import time

sys.path.append(".")
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

OUT = "../docs/evidence/ad_requirements"
SEED, N, MIN_CHARS = 1, 30, 300
FIELDS = ["qualification", "field", "languages", "citizenship", "salary"]
PASS = {"qualification": 0.9, "field": 0.8, "languages": 0.9, "citizenship": 0.9, "salary": 0.9}
LEVELS = ["none", "diploma", "bachelor", "master", "phd"]
STEP4 = "../docs/evidence/ranking/judging.json"

GUIDE = """# Labelling guide: other requirements (E6)

Read each ad in full and fill one row per ad in labels_author.csv. Write what the AD says, not what you think the
job needs. Leave the column empty (or write none) when the ad does not say it.

- **qualification**: the LOWEST level the ad accepts: none, diploma, bachelor, master or phd.
  "Bachelor's or Master's" = bachelor. "Diploma/Degree" = diploma. "Master's or above" = master. "Degree" = bachelor.
- **field**: the subject(s) of study named, as written: e.g. "Computer Science, IT or related". none if not named.
- **languages**: languages the candidate must or should speak/write, comma separated: e.g. English, Mandarin.
  Not languages that are only mentioned (a product in Bahasa Melayu, Chinese New Year).
- **citizenship**: yes if the ad limits who may apply by citizenship, permanent residence or a work pass
  ("Malaysians only", "must have the right to work in Singapore", "no visa sponsorship"); otherwise no.
- **salary**: only if the row says salary_field = (empty): the salary amount written in the ad, e.g. "RM 2,800 - 3,200";
  none if the ad gives no amount. Skip (leave empty) when salary_field already has a value.
"""

JUDGE_PROMPT = """You label job adverts. For each advert below, report what the AD itself says (not what the job might need).

- qualification: the LOWEST qualification the ad accepts, one of: none, diploma, bachelor, master, phd.
  "Bachelor's or Master's" = bachelor; "Diploma/Degree" = diploma; "Master's or above" = master; "Degree" = bachelor.
- field: the field(s) of study named, as written (e.g. "Computer Science, IT or related"), or null.
- languages: list of languages the candidate must or should speak or write (e.g. ["English","Mandarin"]); [] if none.
  Do not count a language that is only mentioned (a product in Bahasa Melayu, Chinese New Year).
- citizenship: true if the ad limits who may apply by citizenship, permanent residence or a work pass, else false.
- salary: the salary amount written in the ad text (e.g. "RM 2,800 - RM 3,200"), or null.

Return JSON only: {{"ads": {{"<id>": {{"qualification": "...", "field": ... , "languages": [...], "citizenship": true|false, "salary": ...}}, ...}}}}

{ads}"""


def path(name):
    return os.path.join(OUT, name)


def load(name):
    with open(path(name), encoding="utf-8") as f:
        return json.load(f)


def save(name, data):
    os.makedirs(OUT, exist_ok=True)
    with open(path(name), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


# ── 1. sample ─────────────────────────────────────────────────────────────────────────────────────────────────────
def sample():
    if os.path.exists(path("ads.json")):
        sys.exit("ads.json already exists: the sample is drawn once (delete it only before any labelling).")
    from app.database import SessionLocal
    from app.models.job import Job
    from app.routers.jobs import current_jobs_filter
    with open(STEP4, encoding="utf-8") as f:
        seen = {p["pair"].split("|")[1] for p in json.load(f)["pairs"]}
    db = SessionLocal()
    try:
        jobs = current_jobs_filter(db.query(Job).filter(Job.source == "live")).order_by(Job.job_id).all()
        pool = [j for j in jobs if j.job_id not in seen and len(j.description or "") >= MIN_CHARS]
        picked = random.Random(SEED).sample(pool, min(N, len(pool)))
        ads = [{"id": f"A{i + 1:02d}", "job_id": j.job_id, "title": j.job_title, "company": j.company,
                "salary_field": (j.salary or "").strip() if str(j.salary or "").strip().lower() not in ("nan", "none") else "",
                "ad": j.description} for i, j in enumerate(picked)]
    finally:
        db.close()
    save("ads.json", {"seed": SEED, "pool": len(pool), "left_out_step4": len(seen), "ads": ads})
    with open(path("labels_author.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["id", "title", "salary_field"] + FIELDS + ["ad"])
        for a in ads:
            w.writerow([a["id"], a["title"], a["salary_field"] or "(empty)", "", "", "", "", "", a["ad"]])
    with open(path("labelling_guide.md"), "w", encoding="utf-8") as f:
        f.write(GUIDE)
    print(f"{len(ads)} ads drawn from {len(pool)} live ads (seed {SEED}; {len(seen)} step-4 ads left out). "
          f"Written ads.json, labels_author.csv and labelling_guide.md in {OUT}.")


# ── 2. judges (Qwen, Gemini; Claude's file is written by hand from ads.json) ─────────────────────────────────────
def ask(who: str, prompt: str) -> tuple[dict, str]:
    from app.config import settings
    if who == "qwen":
        from groq import Groq
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
        got = json.loads(text or "{}").get("ads", {})
    except (ValueError, AttributeError):
        got = {}
    return (got if isinstance(got, dict) else {}), text


def judge(who: str, pause: float, chunk: int = 3):
    ads = load("ads.json")["ads"]
    name = f"labels_{who}.json"
    done = load(name) if os.path.exists(path(name)) else {}
    todo = [a for a in ads if a["id"] not in done]
    for i in range(0, len(todo), chunk):
        part = todo[i:i + chunk]
        prompt = JUDGE_PROMPT.format(ads="\n\n".join(f"[{a['id']}] {a['title']}\n{a['ad']}" for a in part))
        try:
            got, reply = ask(who, prompt)
        except Exception as e:
            save(name, done)
            sys.exit(f"Stopped: {type(e).__name__}: {e}. Run {who} again later to continue.")
        for a in part:
            if isinstance(got.get(a["id"]), dict):
                done[a["id"]] = got[a["id"]]
            else:
                print(f"  no answer for {a['id']}. The judge replied: {(reply or '(nothing)')[:200]!r}")
        save(name, done)
        print(f"  {len(done)}/{len(ads)} labelled")
        time.sleep(pause)
    print(f"{who.capitalize()} labelled {len(done)} of {len(ads)} ads" + ("" if len(done) == len(ads) else " (run again)"))


# ── 3. score ─────────────────────────────────────────────────────────────────────────────────────────────────────
_SUBJECT_STOP = {"related", "field", "fields", "or", "and", "equivalent", "relevant", "any", "other", "similar", "in",
                 "of", "a", "the", "discipline", "disciplines", "degree", "studies", "etc", "area", "areas"}
LANG_ALIASES = {"bahasa malaysia": "malay", "bahasa melayu": "malay", "bm": "malay", "chinese": "mandarin",
                "bahasa indonesia": "indonesian"}


def norm(fieldname: str, v):
    """One label (author CSV text, a judge's JSON value, or a rule result) in one comparable form."""
    if fieldname == "qualification":
        if isinstance(v, dict):
            v = v.get("level")
        v = str(v or "none").strip().lower()
        v = {"degree": "bachelor", "bachelors": "bachelor", "bachelor's": "bachelor", "masters": "master",
             "master's": "master", "doctorate": "phd", "ph.d": "phd", "": "none"}.get(v, v)
        return v if v in LEVELS else "none"
    if fieldname == "languages":
        if isinstance(v, dict):
            v = v.get("languages")
        if isinstance(v, str):
            v = [] if v.strip().lower() in ("", "none", "-") else re.split(r"[,/;]| and ", v)
        out = set()
        for x in v or []:
            x = str(x).strip().lower()
            x = LANG_ALIASES.get(x, x)
            if x:
                out.add(x)
        return frozenset(out)
    if fieldname == "citizenship":
        if isinstance(v, dict):
            return True
        if isinstance(v, bool):
            return v
        return str(v or "").strip().lower() in ("yes", "y", "true", "1")
    if fieldname == "field":
        if isinstance(v, dict):
            v = v.get("field")
        v = str(v or "").strip().lower()
        if v in ("", "none", "null", "-"):
            return frozenset()
        return frozenset(w for w in re.findall(r"[a-z]+", v) if w not in _SUBJECT_STOP and len(w) > 1)
    if fieldname == "salary":
        if isinstance(v, dict):
            v = v.get("salary")
        v = str(v or "").strip().lower()
        if v in ("", "none", "null", "-", "skip"):
            return None
        m = re.search(r"\d[\d,]*(?:\.\d+)?\s?k?", v)
        if not m:
            return None
        num = m.group(0).replace(",", "").strip()
        return str(int(float(num[:-1]) * 1000)) if num.endswith("k") else str(int(float(num)))


def same(fieldname: str, a, b) -> bool:
    if fieldname == "field":
        return (not a and not b) or bool(a and b and (a & b))
    return a == b


def score():
    from app.services.ad_requirements import read_ad
    data = load("ads.json")
    ads = data["ads"]
    with open(path("labels_author.csv"), encoding="utf-8-sig") as f:
        author = {r["id"]: r for r in csv.DictReader(f)}
    judges = {w: load(f"labels_{w}.json") for w in ("claude", "qwen", "gemini") if os.path.exists(path(f"labels_{w}.json"))}
    rows, right, n = [], {k: 0 for k in FIELDS}, {k: 0 for k in FIELDS}
    judge_right = {w: {k: 0 for k in FIELDS} for w in judges}
    for a in ads:
        rule = read_ad(a["ad"], a["salary_field"])
        lab = author.get(a["id"], {})
        row = {"id": a["id"], "title": a["title"]}
        for k in FIELDS:
            if k == "salary" and a["salary_field"]:
                continue                                  # salary is read from the text only when the field is empty
            gold = norm(k, lab.get(k))
            got = norm(k, rule[k])
            ok = same(k, gold, got)
            n[k] += 1
            right[k] += ok
            row[f"{k} (author)"] = sorted(gold) if isinstance(gold, frozenset) else gold
            row[f"{k} (rules)"] = sorted(got) if isinstance(got, frozenset) else got
            row[f"{k} ok"] = "yes" if ok else "NO"
            for w, labs in judges.items():
                judge_right[w][k] += same(k, gold, norm(k, (labs.get(a["id"]) or {}).get(k)))
        rows.append(row)
    lines = ["E6 other requirements: reading rules vs the author's labels (30 live ads not used to write the rules)",
             f"Sample: seed {data['seed']}, {len(ads)} of {data['pool']} live ads; {data['left_out_step4']} step-4 ads left out\n",
             f"{'part':<14}{'rules right':>14}{'bar':>8}  verdict" + "".join(f"{w:>10}" for w in judges)]
    verdicts = {}
    for k in FIELDS:
        share = right[k] / n[k] if n[k] else 0
        verdicts[k] = "PASS" if n[k] and share >= PASS[k] else "FAIL"
        lines.append(f"{k:<14}{right[k]:>4}/{n[k]:<3} {share:>5.0%}{PASS[k]:>7.0%}  {verdicts[k]:<7}"
                     + "".join(f"{(judge_right[w][k] / n[k] if n[k] else 0):>10.0%}" for w in judges))
    lines.append("\nJudge columns: how often each AI judge agreed with the author (a cross-check of how hard each part is).")
    lines.append("Shown to students: " + (", ".join(k for k in FIELDS if verdicts[k] == "PASS") or "nothing yet"))
    text = "\n".join(lines)
    print(text)
    with open(path("scores.txt"), "w", encoding="utf-8") as f:
        f.write(text + "\n")
    with open(path("per_ad.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=sorted({k for r in rows for k in r}, key=lambda c: (c != "id", c != "title", c)))
        w.writeheader()
        w.writerows(rows)
    try:
        from app.services.evaluation_runs import record
        record("E6 other requirements", objective=3,
               method="fixed reading rules (app/services/ad_requirements.py) vs the author's labels on 30 live ads not "
                      "used to write the rules; Claude, Qwen and Gemini labels as a cross-check",
               dataset={"seed": data["seed"], "ads": len(ads), "pool": data["pool"]},
               metrics={k: {"right": right[k], "of": n[k]} for k in FIELDS},
               verdict="; ".join(f"{k} {verdicts[k]}" for k in FIELDS),
               files=[path("ads.json"), path("labels_author.csv"), path("per_ad.csv")])
    except Exception as e:                               # MongoDB off: the files are still written
        print(f"(run record not saved: {e})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("step", choices=["sample", "qwen", "gemini", "score"])
    ap.add_argument("--pause", type=float, default=5)
    a = ap.parse_args()
    {"sample": sample, "score": score}.get(a.step, lambda: judge(a.step, a.pause))()


if __name__ == "__main__":
    main()
