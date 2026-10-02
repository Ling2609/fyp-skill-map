"""
Abbreviation dictionary for skill names (A8 add-on): "RAG" = "Retrieval-Augmented Generation", so one ad listing both
counts one skill, and a student with one of them has the other. Method and sources: references.md, "Abbreviation
dictionary". No pair is merged on one opinion; the steps follow how ADAM and Allie built theirs:

  1. find   "long form (SHORT)" in every job ad in the database: word initials first ("SQL Server Reporting
            Services (SSRS)"), else the Schwartz & Hearst (2003) letter walk (95-96% precision reported); plus ESCO
            v1.2.1 alternative labels of digital skills when the letters account for the whole label.
  2. group  spelling variants of a long form ("life cycle" / "lifecycle", hyphens, plurals) into one meaning;
            only meanings where the short or the long form is a SkillMap skill are kept (others change nothing).
  3. auto   a short form with ONE meaning, defined in at least 2 ads, is proposed automatically (frequency filter).
  4. judge  every other meaning goes to gpt-oss-120b: is this the usual meaning in ICT job ads? (strict prompt,
            competing meanings shown together). At most one meaning per short form can be merged, else merges chain.
  5. check  every proposed pair is checked independently by Qwen; merged only if both models say same.
  6. human  the author blind-checks a random sample of the merged pairs (precision for the report).

Files: data/abbreviations_review.csv (one row per meaning, with every step's answer; a `decision` column the author
may fill to overrule: same / different) and data/abbreviations_sample.csv (the blind sample). --apply writes the
merged pairs into data/skill_merge_overrides.json, which wins over the LLM merges (app/services/skill_names.py).

Usage (from backend/, venv active):
  python scripts/pipeline/find_abbreviations.py              # steps 1-3 -> data/abbreviations_review.csv
  python scripts/pipeline/find_abbreviations.py --judge      # steps 4-5 (Groq; resumes after a rate limit)
  python scripts/pipeline/find_abbreviations.py --sample 20  # step 6: blind sample to check
  python scripts/pipeline/find_abbreviations.py --apply      # write the merges into the overrides
"""
import argparse
import json
import os
import random
import re
import sys
import time
from collections import Counter, defaultdict

import pandas as pd

sys.path.append(".")
sys.path.append("scripts/skill_relations")

REVIEW_CSV = "data/abbreviations_review.csv"
SAMPLE_CSV = "data/abbreviations_sample.csv"
OVERRIDES = "data/skill_merge_overrides.json"
ESCO_DIR = "data/external/esco"
SHORT = re.compile(r"^[A-Za-z][A-Za-z0-9+#/.&\-]{1,9}$")      # 2-10 characters, starts with a letter
PAREN = re.compile(r"\(([^()]{2,12})\)")
MIN_ADS = 2              # step 3: a single-meaning short form must be defined in at least this many ads
BATCH = 25


def best_long_form(short: str, long: str) -> str | None:
    """Schwartz & Hearst (2003): match the short form's letters right to left inside the candidate long form; the
    first short-form character must start a word. Returns the long form (from that word on) or None."""
    s, l = short.lower(), long.lower()
    si, li = len(s) - 1, len(l) - 1
    while si >= 0:
        c = s[si]
        if not c.isalnum():
            si -= 1
            continue
        while li >= 0 and (l[li] != c or (si == 0 and li > 0 and l[li - 1].isalnum())):
            li -= 1
        if li < 0:
            return None
        si -= 1
        li -= 1
    start = l.rfind(" ", 0, li + 1) + 1
    result = long[start:].strip(" ,;:-")
    return result if len(result) > len(short) and " " in result or len(result) > len(short) + 3 else None


FILLER = {"of", "and", "as", "for", "the", "to", "in", "on", "a", "an", "&"}


def initials_long_form(short: str, words: list[str]) -> str | None:
    """Prefer the plain reading first: the last words whose initials spell the short form ("SQL Server Reporting
    Services" for SSRS), skipping filler words such as "as" in "Infrastructure as Code". None if no such window."""
    letters = [c.lower() for c in short if c.isalpha()]
    for start in range(len(words) - 1, -1, -1):
        initials = [w[0].lower() for w in words[start:] if w.lower() not in FILLER]
        if initials == letters and words[start].lower() not in FILLER:
            return " ".join(words[start:])
        if len(initials) > len(letters):
            return None
    return None


def candidates(text: str):
    """(short, long) for every "long form (SHORT)" in a text, as Schwartz & Hearst define the candidate window."""
    for m in PAREN.finditer(text or ""):
        short = m.group(1).strip()
        if not SHORT.match(short) or not any(ch.isupper() for ch in short) or short.lower() in {"etc", "eg", "ie"}:
            continue
        words = re.findall(r"[\w+#.&/\-]+", text[:m.start()])
        window = words[-min(len(short) + 5, len(short) * 2):]       # at most min(|SF| + 5, 2|SF|) words back
        found = initials_long_form(short, window) or best_long_form(short, " ".join(window))
        if found:
            yield short, found


def short_key(short: str) -> str:
    """"LLMs" and "LLM" are one short form: drop a plural s after capitals."""
    return (short[:-1] if len(short) > 2 and short.endswith("s") and short[:-1].isupper() else short).lower()


def sense_key(long: str) -> str:
    """Spelling variants of one long form get one key (ADAM / Allie group these): case, hyphens and slashes,
    "life cycle" / "lifecycle", plural s."""
    t = re.sub(r"[-/]", " ", long.lower()).replace("lifecycle", "life cycle")
    return " ".join(w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w for w in t.split())


def propose():
    from app.database import SessionLocal
    from app.models.job import Job, JobSkill
    from app.models.module import ModuleSkill
    from app.services.skill_names import canonical_key

    db = SessionLocal()
    try:
        texts = [d for (d,) in db.query(Job.description) if d]
        names = {n for (n,) in db.query(JobSkill.skill_name)} | {n for (n,) in db.query(ModuleSkill.skill_name)}
    finally:
        db.close()
    skill_keys = {canonical_key(n) for n in names}

    ads = Counter()                                   # (short key, sense key) -> number of ads defining it
    shorts, longs = defaultdict(Counter), defaultdict(Counter)   # most common spellings, for display and merging
    for t in texts:
        for key in {(short_key(s), sense_key(l)) for s, l in candidates(t)}:   # once per ad
            ads[key] += 1
        for s, l in candidates(t):
            shorts[short_key(s)][s] += 1
            longs[(short_key(s), sense_key(l))][l] += 1
    esco = set()
    skills_csv = os.path.join(ESCO_DIR, "skills_en.csv")
    if os.path.exists(skills_csv):
        s = pd.read_csv(skills_csv)
        digital = set(pd.read_csv(os.path.join(ESCO_DIR, "digitalSkillsCollection_en.csv")).conceptUri)
        for uri, label, alts in zip(s.conceptUri, s.preferredLabel, s.altLabels):
            if uri not in digital or not isinstance(alts, str):
                continue
            for alt in alts.split("\n"):
                alt = alt.strip()
                match = best_long_form(alt, label) if SHORT.match(alt) and alt.upper() == alt else None
                if match and match.lower() == label.lower():   # the letters account for the whole label
                    key = (short_key(alt), sense_key(label))
                    esco.add(key)
                    shorts[key[0]][alt] += 1
                    longs[key][label] += 1
    else:
        print(f"{skills_csv} not found: ESCO source skipped")

    rows = []
    for key in set(ads) | esco:
        sk, _ = key
        short, long = shorts[sk].most_common(1)[0][0], longs[key].most_common(1)[0][0]
        if re.search(rf"(?<!\w){re.escape(sk)}s?(?!\w)", long.lower()):
            continue                                  # "RAGE (digital game creation systems)": not an expansion
        short_skill = any(canonical_key(x) in skill_keys for x in shorts[sk])
        long_skill = any(canonical_key(x) in skill_keys for x in longs[key])
        if not (short_skill or long_skill):
            continue                                  # neither name is a SkillMap skill: merging changes nothing
        rows.append({"short": short, "long": long, "short_key": sk, "sense_key": key[1],
                     "source": "+".join(x for x, ok in (("ads", key in ads), ("esco", key in esco)) if ok),
                     "ads_count": ads.get(key, 0), "short_is_skill": short_skill, "long_is_skill": long_skill,
                     "already_merged": canonical_key(short) == canonical_key(long)})
    df = pd.DataFrame(rows)
    df["meanings"] = df.groupby("short_key").short_key.transform("size")
    df["step"] = ["auto" if m == 1 and n >= MIN_ADS else "judge" for m, n in zip(df.meanings, df.ads_count)]
    for col in ("gpt_oss", "qwen", "decision"):
        df[col] = ""
    if os.path.exists(REVIEW_CSV):                    # keep answers and decisions already made
        old = pd.read_csv(REVIEW_CSV, dtype=str).fillna("")
        if "sense_key" in old:
            prev = {(r.short_key, r.sense_key): r for r in old.itertuples()}
            for col in ("gpt_oss", "qwen", "decision"):
                df[col] = [getattr(prev[(a, b)], col, "") if (a, b) in prev else "" for a, b in zip(df.short_key, df.sense_key)]
    df = df.sort_values(["already_merged", "step", "ads_count"], ascending=[True, True, False])
    df.to_csv(REVIEW_CSV, index=False, encoding="utf-8")
    print(f"Job ads read: {len(texts)}; meanings kept (a SkillMap skill uses one of the names): {len(df)}")
    print(f"  auto (one meaning, defined in >= {MIN_ADS} ads): {(df.step == 'auto').sum()}; "
          f"to the judge: {(df.step == 'judge').sum()} "
          f"({(df.meanings > 1).sum()} rows belong to short forms with several meanings)")
    print(f"Wrote {REVIEW_CSV}. Next: --judge")


PROMPT = """You check abbreviation dictionary entries for a skills database built from ICT job ads.
For each entry "id. SHORT = long form", decide if, in ICT job ads, SHORT normally means that long form, so that a skill
written as SHORT and one written as the long form are the same skill. Answer "same" only if it is clearly the usual
meaning in ICT job ads. Answer "different" if SHORT usually means something else in ICT job ads, if it is ambiguous,
or if the long form is wrong or incomplete. When several meanings of one SHORT are listed, at most one can be "same".
Answer with JSON only: {"answers": [{"id": <id>, "answer": "same" | "different"}, ...]}, one per id."""


def ask_model(name: str, rows: pd.DataFrame) -> dict[int, str]:
    from judge_reference_pairs import ask_gpt_oss, ask_qwen
    ask = ask_gpt_oss if name == "gpt_oss" else ask_qwen
    user = "\n".join(f"{i}. {s} = {l}" for i, s, l in zip(rows.index, rows.short, rows.long))
    data = json.loads(ask(PROMPT, user) or "{}")
    out = {}
    for item in data.get("answers", []) if isinstance(data, dict) else []:
        try:
            i, a = int(item["id"]), str(item["answer"]).strip().lower()
        except (KeyError, TypeError, ValueError):
            continue
        if i in rows.index and a in ("same", "different"):
            out[i] = a
    return out


def judge():
    from dotenv import load_dotenv
    from judge_reference_pairs import is_busy, is_daily_limit
    load_dotenv()
    df = pd.read_csv(REVIEW_CSV, dtype=str).fillna("")
    df = df.reset_index(drop=True)
    for name, wanted in (("gpt_oss", lambda d: d.step == "judge"),
                         ("qwen", lambda d: (d.step == "auto") | (d.gpt_oss == "same"))):
        todo = df[wanted(df) & (df[name] == "")]
        print(f"{name}: {len(todo)} to ask")
        # keep every meaning of one short form in the same batch, so the model sees the competing meanings
        groups = [g for _, g in todo.groupby("short_key", sort=False)]
        batch, waits = [], 0
        while groups or batch:
            while groups and len(pd.concat(batch + [groups[0]])) <= BATCH:
                batch.append(groups.pop(0))
            if not batch:                             # one short form with more meanings than a batch
                batch.append(groups.pop(0))
            rows = pd.concat(batch)
            try:
                got = ask_model(name, rows)
            except Exception as e:
                if is_daily_limit(e):
                    print(f"Daily limit reached: run --judge again later; it continues.\n{e}")
                    df.to_csv(REVIEW_CSV, index=False, encoding="utf-8")
                    return
                if is_busy(e) and waits < 10:
                    waits += 1
                    print("  busy: waiting 60 s")
                    time.sleep(60)
                    continue
                print(f"  error: {e}")
                got = {}
            waits = 0
            for i, a in got.items():
                df.at[i, name] = a
            df.to_csv(REVIEW_CSV, index=False, encoding="utf-8")   # saved after every batch
            print(f"  answered {len(got)} of {len(rows)}")
            batch = []
            time.sleep(2)
    report(df)


def merged(df: pd.DataFrame) -> pd.Series:
    """Merged = the author said same, or (no author decision and) both models agree (auto pairs need Qwen only).
    At most one meaning per short form: if several qualify, the one defined in most ads wins."""
    ok = (df.decision == "same") | ((df.decision == "") & (((df.step == "auto") | (df.gpt_oss == "same"))
                                                           & (df.qwen == "same")))
    ok &= df.already_merged.astype(str) != "True"
    first = df[ok].assign(n=df.ads_count.astype(int)).sort_values("n", ascending=False).drop_duplicates("short_key")
    return df.index.isin(first.index)


def report(df):
    m = merged(df)
    print(f"\nMerged so far: {m.sum()} (auto + Qwen: {(m & (df.step == 'auto')).sum()}, "
          f"gpt-oss + Qwen: {(m & (df.step == 'judge')).sum()}); "
          f"models disagreed on {((df.gpt_oss == 'same') & (df.qwen == 'different')).sum()} judged pairs, "
          f"Qwen rejected {((df.step == 'auto') & (df.qwen == 'different')).sum()} auto pairs")


def sample(n):
    df = pd.read_csv(REVIEW_CSV, dtype=str).fillna("")
    pool = df[merged(df)]
    pick = pool.sample(n=min(n, len(pool)), random_state=42)
    out = pick[["short", "long"]].copy()             # matched back by name, so a later re-run cannot shift rows
    out["author_check"] = ""
    out.to_csv(SAMPLE_CSV, index=False, encoding="utf-8")
    print(f"Wrote {len(out)} of {len(pool)} merged pairs to {SAMPLE_CSV} (no model answers shown). "
          "Fill author_check: agree / disagree / unsure.")


def apply():
    df = pd.read_csv(REVIEW_CSV, dtype=str).fillna("")
    if os.path.exists(SAMPLE_CSV):                    # a pair the author disagreed with is never merged
        s = pd.read_csv(SAMPLE_CSV, dtype=str).fillna("")
        for r in s[s.author_check.str.lower().str.startswith("dis")].itertuples():
            df.loc[(df.short == r.short) & (df.long == r.long), "decision"] = "different"
        df.to_csv(REVIEW_CSV, index=False, encoding="utf-8")
    data = json.load(open(OVERRIDES, encoding="utf-8"))
    added = Counter()
    for decision, rows in (("same", df[merged(df)]), ("different", df[df.decision == "different"])):
        have = {tuple(sorted((a.lower(), b.lower()))) for a, b in data.get(decision, [])}
        for r in rows.itertuples():
            pair = tuple(sorted((r.short.lower(), r.long.lower())))
            if pair not in have:
                data.setdefault(decision, []).append([r.short, r.long])
                have.add(pair)
                added[decision] += 1
    json.dump(data, open(OVERRIDES, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print(f"Added to {OVERRIDES}: {added['same']} same, {added['different']} different. "
          "Restart uvicorn so the app reloads the merges.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--judge", action="store_true", help="steps 4-5: gpt-oss judges, Qwen checks (Groq)")
    ap.add_argument("--sample", type=int, metavar="N", help="step 6: blind sample of N merged pairs")
    ap.add_argument("--apply", action="store_true", help="write the merged pairs into the merge overrides")
    a = ap.parse_args()
    judge() if a.judge else sample(a.sample) if a.sample else apply() if a.apply else propose()
