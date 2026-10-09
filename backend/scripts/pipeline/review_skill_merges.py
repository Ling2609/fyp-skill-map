"""
A8 follow-up (9 Oct): find skill-name duplicates the merge step missed, and decide them with two judges.

Why: after the Stage 1 re-extraction of all live jobs, students saw the same skill twice ("Docker Containerisation" and
"Docker Containers", "CI/CD" and "CI/CD Pipelines"). decide_skill_merges.py misses two kinds of pairs:
  (a) disputed: its first check said "same" but its stricter second check did not (kept apart on purpose, 30 Sep:
      precision over recall; some of these are plainly the same skill)
  (b) near: names a little below its similarity cut-off (0.85)
  (c) plus one word: one name is the other plus one word ("CI/CD" / "CI/CD Pipelines"), whatever their similarity
      (a short name and a longer one can score low even when the extra word adds nothing)
Only names in use matter (in a live job, a module or a student's profile), most used first: the duplicates students see.

Method, as for the abbreviations (find_abbreviations.py): two judges from different model families, gpt-oss-120b and
Qwen (both via Groq), label each pair with the label guide's rules (docs/skill_relation_label_guide.md, rule 2: spelling,
abbreviation, filler words and versions are the same skill; rules 3-7: tool/area, part/field, broader/narrower, related,
look-alike = different). A pair is merged only if BOTH say "same". The author then checks a blind sample.

Files: data/skill_merge_review.csv (one row per pair, both answers, a `decision` column the author may fill to overrule:
same / different), data/skill_merge_review_sample.csv (blind sample). --apply writes the merged pairs into
data/skill_merge_overrides.json, which wins over the LLM merges (app/services/skill_names.py).

Usage (from backend/, venv active; run decide_skill_merges.py and --verify first, so its own answers are in):
  python scripts/pipeline/review_skill_merges.py                  # list the pairs -> data/skill_merge_review.csv
  python scripts/pipeline/review_skill_merges.py --judge          # both judges label them (Groq; resumes, stops at the daily limit)
  python scripts/pipeline/review_skill_merges.py --sample 20      # blind sample of merged pairs for the author
  python scripts/pipeline/review_skill_merges.py --apply          # write the merges; restart uvicorn afterwards
"""
import argparse
import json
import os
import sys
import time
from collections import Counter, defaultdict

import numpy as np
import pandas as pd

sys.path.append(".")   # run from backend/

from app.database import SessionLocal
from app.models.job import Job, JobSkill
from app.models.module import ModuleSkill
from app.models.profile import UserCertification, UserProject
from app.nlp.embedder import get_embedder
from app.services.skill_names import canonical_key, skill_key
from app.services.skill_profile import normalise_rows

REVIEW_CSV = "data/skill_merge_review.csv"
SAMPLE_CSV = "data/skill_merge_review_sample.csv"
OVERRIDES = "data/skill_merge_overrides.json"
MERGES_FILE = "data/skill_merges.json"
NEAR_MIN, NEAR_MAX = 0.75, 0.85      # (b): just below decide_skill_merges.py's cut-off
MAX_NEAR = 300                       # (b) pairs listed, most used first (keeps the Groq cost small)
MAX_PLUS_ONE = 300                   # (c) likewise
BATCH = 20
COLUMNS = ["kind", "a", "b", "similarity", "live_jobs", "in_profile", "gpt_oss", "qwen", "decision"]

SYSTEM = (
    "You compare two names of skills from IT job adverts and student profiles. Answer \"same\" only if a person who "
    "has one has the other: the names differ only in spelling (British/American), abbreviation, word order, filler "
    "words (programming, development, skills, pipelines, containers, process) or version. Answer \"different\" if one "
    "is a tool and the other its general area, one is part of a broader field, one is broader or narrower, they are "
    "related but distinct, or they only look alike. When unsure, answer \"different\". Judge only the two names. "
    'Return JSON: {"labels": [{"id": <id>, "label": "same" | "different"}, ...]}'
)
EXAMPLES = (
    "Examples:\n"
    '"JS" | "JavaScript" -> same\n'
    '"Python programming" | "Python" -> same\n'
    '"Optimisation" | "Optimization" -> same\n'
    '"HTML5" | "HTML" -> same\n'
    '"Teamwork" | "Team collaboration" -> same\n'
    '"Docker" | "Containerisation" -> different (tool and its area)\n'
    '"Unit testing" | "Software testing" -> different (part of a broader field)\n'
    '"Scrum" | "Agile" -> different (a method and its family)\n'
    '"Java" | "JavaScript" -> different (look-alike)\n'
    '"Stakeholder management" | "Stakeholder communication" -> different (related, distinct)\n'
)
GROQ_MODEL = "openai/gpt-oss-120b"
QWEN_MODEL = "qwen/qwen3.8-27b"      # the same Qwen as the reference-set judge (judge_reference_pairs.py)


# ── Which names are in use, and how often ───────────────────────────────────────────────────────────────

def usage(db):
    """canonical key -> (name employers use most, live jobs using it, in a module or a student's profile?)"""
    names, jobs, profile = defaultdict(Counter), defaultdict(set), set()
    for name, job_id in (db.query(JobSkill.skill_name, JobSkill.job_id).join(Job, Job.id == JobSkill.job_id)
                         .filter(Job.source == "live", Job.gone_at.is_(None))):
        k = canonical_key(name)
        names[k][name.strip()] += 1
        jobs[k].add(job_id)
    for (name,) in db.query(ModuleSkill.skill_name):
        names[canonical_key(name)][name.strip()] += 1
        profile.add(canonical_key(name))
    for (lst,) in db.query(UserProject.extracted_skills):
        for name in lst or []:
            names[canonical_key(name)][name.strip()] += 1
            profile.add(canonical_key(name))
    for (lst,) in db.query(UserCertification.mapped_skills):
        for name in lst or []:
            names[canonical_key(name)][name.strip()] += 1
            profile.add(canonical_key(name))
    names.pop("", None)
    return {k: (c.most_common(1)[0][0], len(jobs.get(k, ())), k in profile) for k, c in names.items()}


def decided_by_author() -> set:
    data = json.load(open(OVERRIDES, encoding="utf-8")) if os.path.exists(OVERRIDES) else {}
    return {frozenset((skill_key(a), skill_key(b))) for d in ("same", "different") for a, b in data.get(d, [])}


def propose():
    db = SessionLocal()
    try:
        use = usage(db)
    finally:
        db.close()
    author = decided_by_author()
    rows, seen = [], set()

    def add(kind, ka, kb, sim):
        pair = frozenset((ka, kb))
        if ka == kb or pair in seen or ka not in use or kb not in use:
            return
        if frozenset((skill_key(use[ka][0]), skill_key(use[kb][0]))) in author:
            return
        seen.add(pair)
        (na, ja, pa), (nb, jb, pb) = use[ka], use[kb]
        rows.append({"kind": kind, "a": na, "b": nb, "similarity": round(sim, 3), "live_jobs": ja + jb,
                     "in_profile": pa or pb, "gpt_oss": "", "qwen": "", "decision": ""})

    # (a) first check "same", second check not: the merge step kept them apart
    merges = json.load(open(MERGES_FILE, encoding="utf-8")).get("pairs", {}) if os.path.exists(MERGES_FILE) else {}
    for v in merges.values():
        if v.get("same") and not v.get("verified"):
            add("disputed", canonical_key(v["a"]), canonical_key(v["b"]), v.get("similarity", 0))

    # (b) close but below the merge step's cut-off; only names students meet (a live job, or a profile and a job)
    keys = [k for k, (_, j, p) in use.items() if j >= 1]
    vecs = normalise_rows(get_embedder().embed_cached([use[k][0] for k in keys])).astype(np.float32)
    near = []
    for start in range(0, len(keys), 1000):
        sims = vecs[start:start + 1000] @ vecs.T
        for i, j in zip(*np.nonzero((sims >= NEAR_MIN) & (sims < NEAR_MAX))):
            if start + i < j:
                ka, kb = keys[start + i], keys[j]
                near.append((use[ka][1] + use[kb][1] + 5 * (use[ka][2] or use[kb][2]), float(sims[i, j]), ka, kb))
    for _, sim, ka, kb in sorted(near, reverse=True)[:MAX_NEAR]:
        add("near", ka, kb, sim)

    # (c) one name is the other plus one word, both in live jobs (similarity shown for information only)
    words = {k: tuple(use[k][0].lower().split()) for k in keys}
    by_words = {w: k for k, w in words.items()}
    plus = []
    for k, w in words.items():
        for drop in range(len(w)) if len(w) > 1 else ():
            short = by_words.get(w[:drop] + w[drop + 1:])
            if short:
                plus.append((use[k][1] + use[short][1], short, k))
    index = {k: i for i, k in enumerate(keys)}
    for _, ka, kb in sorted(plus, reverse=True)[:MAX_PLUS_ONE]:
        add("plus_one", ka, kb, float(vecs[index[ka]] @ vecs[index[kb]]))

    old = pd.read_csv(REVIEW_CSV, dtype=str).fillna("") if os.path.exists(REVIEW_CSV) else pd.DataFrame(columns=COLUMNS)
    have = {frozenset((r.a.lower(), r.b.lower())) for r in old.itertuples()}
    new = [r for r in rows if frozenset((r["a"].lower(), r["b"].lower())) not in have]
    df = pd.concat([old, pd.DataFrame(new, columns=COLUMNS)], ignore_index=True)
    df = df.sort_values(["kind", "live_jobs"], ascending=[True, False], key=lambda s: s if s.name == "kind" else s.astype(int))
    df.to_csv(REVIEW_CSV, index=False, encoding="utf-8")
    kinds = Counter(r["kind"] for r in new)
    print(f"{len(new)} new pairs ({kinds['disputed']} disputed, {kinds['near']} near, {kinds['plus_one']} plus one "
          f"word); {len(df)} in {REVIEW_CSV}. Next: --judge")


# ── The two judges ───────────────────────────────────────────────────────────────────────────────────────

def ask_groq(model: str, user: str, reasoning: bool) -> str:
    from groq import Groq
    from app.config import settings
    client = Groq(api_key=settings.groq_api_key)
    extra = {"reasoning_effort": "medium"} if reasoning else {}
    r = client.chat.completions.create(
        model=model, temperature=0, response_format={"type": "json_object"}, max_completion_tokens=8192,
        messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}], **extra)
    return r.choices[0].message.content or ""


ASK = {"gpt_oss": lambda u: ask_groq(GROQ_MODEL, u, True),
       "qwen": lambda u: ask_groq(os.getenv("QWEN_JUDGE_MODEL") or QWEN_MODEL, u, False)}


def parse(text: str, ids: set[int]) -> dict[int, str]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return {}
    out = {}
    for item in data.get("labels", []) if isinstance(data, dict) else []:
        try:
            i, label = int(item.get("id")), str(item.get("label", "")).strip().lower()
        except (AttributeError, TypeError, ValueError):
            continue
        if i in ids and label in ("same", "different"):
            out[i] = label
    return out


def judge(ask=None, pause=2.0):
    ask = ask or ASK
    df = pd.read_csv(REVIEW_CSV, dtype=str).fillna("")
    for name in ("gpt_oss", "qwen"):
        todo = list(df.index[df[name] == ""])
        print(f"{name}: {len(todo)} pairs to label")
        while todo:
            batch = todo[:BATCH]
            user = EXAMPLES + "\nPairs:\n" + "\n".join(f'{i}. "{df.at[i, "a"]}" | "{df.at[i, "b"]}"' for i in batch)
            try:
                got = parse(ask[name](user), set(batch))
            except Exception as e:                       # noqa: BLE001  (the Groq SDK raises several types)
                msg = str(e).lower().replace(" ", "")
                if "perday" in msg:
                    print(f"{name}: daily limit reached; run --judge again tomorrow (answers so far are saved)")
                    break
                if any(w in msg for w in ("429", "ratelimit", "503", "overloaded", "unavailable")):
                    time.sleep(20)
                    continue
                raise
            for i, label in got.items():
                df.at[i, name] = label
            df.to_csv(REVIEW_CSV, index=False, encoding="utf-8")          # saved after every batch: safe to stop
            todo = [i for i in todo if df.at[i, name] == ""]
            if not got:                                   # nothing usable: skip this batch for now, ask again later
                todo = todo[len(batch):]
            time.sleep(pause)
    report(df)


# ── Decision, blind sample, apply ────────────────────────────────────────────────────────────────────────

def merged(df: pd.DataFrame) -> pd.Series:
    """Merge = the author said same, or (no author decision and) both judges said same."""
    return (df.decision == "same") | ((df.decision == "") & (df.gpt_oss == "same") & (df.qwen == "same"))


def report(df):
    m = merged(df)
    both = (df.gpt_oss != "") & (df.qwen != "")
    print(f"\nLabelled by both: {both.sum()} of {len(df)}. To merge: {m.sum()} "
          f"(disputed {(m & (df.kind == 'disputed')).sum()}, near {(m & (df.kind == 'near')).sum()}, "
          f"plus one word {(m & (df.kind == 'plus_one')).sum()}); "
          f"judges disagreed on {(both & (df.gpt_oss != df.qwen)).sum()}")


def sample(n):
    df = pd.read_csv(REVIEW_CSV, dtype=str).fillna("")
    pool = df[merged(df)]
    out = pool.sample(n=min(n, len(pool)), random_state=42)[["a", "b"]].copy()
    out["author_check"] = ""
    out.to_csv(SAMPLE_CSV, index=False, encoding="utf-8")
    print(f"Wrote {len(out)} of {len(pool)} pairs to {SAMPLE_CSV} (no judge answers shown). "
          "Fill author_check: agree / disagree / unsure (agree = the same skill).")


def apply():
    df = pd.read_csv(REVIEW_CSV, dtype=str).fillna("")
    if os.path.exists(SAMPLE_CSV):                        # a pair the author disagreed with is never merged
        s = pd.read_csv(SAMPLE_CSV, dtype=str).fillna("")
        for r in s[s.author_check.str.lower().str.startswith("dis")].itertuples():
            df.loc[(df.a == r.a) & (df.b == r.b), "decision"] = "different"
        df.to_csv(REVIEW_CSV, index=False, encoding="utf-8")
    data = json.load(open(OVERRIDES, encoding="utf-8"))
    added = Counter()
    for decision, rows in (("same", df[merged(df)]), ("different", df[df.decision == "different"])):
        have = {tuple(sorted((a.lower(), b.lower()))) for a, b in data.get(decision, [])}
        for r in rows.itertuples():
            pair = tuple(sorted((r.a.lower(), r.b.lower())))
            if pair not in have:
                data.setdefault(decision, []).append([r.a, r.b])
                have.add(pair)
                added[decision] += 1
    with open(OVERRIDES, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
    print(f"Added to {OVERRIDES}: {added['same']} same, {added['different']} different. "
          "Restart uvicorn so the app reloads the merges.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--judge", action="store_true", help="gpt-oss and Qwen label the pairs (Groq)")
    ap.add_argument("--sample", type=int, metavar="N", help="blind sample of N pairs to merge, for the author")
    ap.add_argument("--apply", action="store_true", help="write the merged pairs into the merge overrides")
    a = ap.parse_args()
    judge() if a.judge else sample(a.sample) if a.sample else apply() if a.apply else propose()
