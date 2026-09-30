"""
A8 layer 2: ask the LLM whether close skill names are the same skill, and save the answers.

Layer 1 (rules, app/services/skill_names.py) already merged obvious spellings. What is left are
pairs SBERT finds close (similarity >= MIN_SIMILARITY) but that may or may not be the same skill:
  "SQL Server" ~ "MS SQL Server"                        same
  "Stakeholder Management" ~ "Stakeholder Communication" different
The LLM (gpt-oss-120b via Groq, the same model as all skill extraction) answers each pair with a
conservative rule: merge only when clearly the same skill; broader/narrower or related = different.

Answers are saved in data/skill_merges.json, keyed by the rule keys of both names, so each pair is
asked only once, the run can be stopped and resumed, and results never change between runs.
It stops at once when Groq's daily token limit is reached; run it again the next day.

Usage (from backend/, venv active):
  python scripts/pipeline/decide_skill_merges.py --dry-run        # how many pairs, and the first prompt; no Groq
  python scripts/pipeline/decide_skill_merges.py --limit 200      # ask about 200 pairs (a first test)
  python scripts/pipeline/decide_skill_merges.py                  # all remaining pairs
  python scripts/pipeline/decide_skill_merges.py --verify         # second, stricter check of the "same" pairs
"""
import argparse
import json
import os
import sys
import time
from collections import Counter, defaultdict
from datetime import date

import numpy as np

sys.path.append(".")   # run from backend/

from app.database import SessionLocal
from app.nlp.embedder import get_embedder
from app.services.skill_names import skill_key
from app.services.skill_profile import normalise_rows
from scripts.tools.check_skill_mapping import database_skills

MERGES_FILE = "data/skill_merges.json"
MIN_SIMILARITY = 0.85      # below this, pairs were rarely the same skill in the 30 Sep analysis
BATCH = 20                 # pairs per LLM call

SYSTEM = (
    "You compare names of skills taken from IT job adverts and university modules. "
    "For each pair, answer \"same\" only if both names clearly mean the same skill, so a person who has one "
    "has the other. Different wording, abbreviations and vendor names are fine. Answer \"different\" if one "
    "is broader or narrower than the other, if they are related but distinct skills, or if you are not sure. "
    "Return only a JSON array of strings, one per pair, in order."
)
EXAMPLES = (
    "Examples:\n"
    '"SQL Server" | "MS SQL Server" -> "same"\n'
    '"Bash scripting" | "Shell scripting" -> "same"\n'
    '"REST API" | "RESTful API" -> "same"\n'
    '"Stakeholder Management" | "Stakeholder Communication" -> "different" (related, distinct)\n'
    '"CSS" | "HTML/CSS" -> "different" (one is broader)\n'
    '"Server Administration" | "Windows Server Administration" -> "different" (one is narrower)\n'
    '"Docker" | "Kubernetes" -> "different"\n'
)

# Second, stricter check (--verify) of every pair the first pass called "same". A pair is merged only if
# both passes say "same". Added 30 Sep after a blind test of the first pass: 41 of 50 "same" answers were
# right (82%); the 9 wrong ones fell into the patterns listed here (Chain-of-Verification, Dhuliawala et al. 2024).
VERIFY_SYSTEM = (
    "You double-check proposed merges of IT skill names. A merge is only correct if the two names are "
    "interchangeable: anyone who has one skill has exactly the other, with nothing added or removed. "
    "Answer \"different\" if ANY of these apply: one name adds a platform, product, framework, tool or scope "
    "(narrower); one names a version or edition; the words look alike but mean different things; the activity "
    "differs (design vs engineering, computing vs architecture); or you have any doubt. "
    "Answer \"same\" only for spelling, word order, abbreviation, typo or vendor-name differences. "
    "Return only a JSON array of strings, one per pair, in order."
)
VERIFY_EXAMPLES = (
    "Examples:\n"
    '"SQL Server" | "MS SQL Server" -> "same" (vendor name)\n'
    '"Data Modeling" | "Data Modelling" -> "same" (spelling)\n'
    '"Tricent Tosca" | "Tricentis Tosca" -> "same" (typo)\n'
    '"Spring Java" | "Java Spring" -> "same" (word order)\n'
    '"Dart" | "Flutter Dart" -> "different" (adds a framework)\n'
    '"Endpoint Management" | "Linux endpoint management" -> "different" (narrower)\n'
    '"HTML markup" | "HTML5 markup" -> "different" (version)\n'
    '"Flow Control" | "Control Flow" -> "different" (different meaning)\n'
    '"Electronic circuit analysis" | "Electrical circuit analysis" -> "different" (different field)\n'
    '"LAN/WAN design" | "WAN/LAN engineering" -> "different" (different activity)\n'
)


def pair_id(a: str, b: str) -> str:
    return " || ".join(sorted([skill_key(a), skill_key(b)]))


def load_merges() -> dict:
    if os.path.exists(MERGES_FILE):
        with open(MERGES_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {"method": "", "pairs": {}}


def save_merges(merges: dict):
    merges["method"] = (f"gpt-oss-120b via Groq, temperature 0; pairs of layer-1 skill groups with SBERT "
                        f"similarity >= {MIN_SIMILARITY}; 'same' only if clearly the same skill; 'verified' = "
                        f"second, stricter check of every 'same' pair. Merge only if same and verified.")
    tmp = MERGES_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(merges, f, indent=1, ensure_ascii=False, sort_keys=True)
    os.replace(tmp, MERGES_FILE)     # never leaves a half-written file


def close_pairs() -> list[tuple[float, str, str]]:
    """Pairs of different layer-1 skills with SBERT similarity >= MIN_SIMILARITY, most similar first."""
    db = SessionLocal()
    try:
        counts = database_skills(db)
    finally:
        db.close()
    groups = defaultdict(Counter)
    for name, n in counts.items():
        groups[skill_key(name)][name] += n
    names = [g.most_common(1)[0][0] for g in groups.values()]
    vecs = normalise_rows(get_embedder().embed_cached(names)).astype(np.float32)
    pairs = []
    for start in range(0, len(names), 1000):
        sims = vecs[start:start + 1000] @ vecs.T
        for i, j in zip(*np.nonzero(sims >= MIN_SIMILARITY)):
            if start + i < j:
                pairs.append((float(sims[i, j]), names[start + i], names[j]))
    return sorted(pairs, reverse=True)


def build_prompt(batch, examples=EXAMPLES) -> str:
    lines = [f'{n}. "{a}" | "{b}"' for n, (_, a, b) in enumerate(batch, 1)]
    return examples + f"\nPairs ({len(batch)}):\n" + "\n".join(lines) + \
        f'\n\nReturn a JSON array of {len(batch)} strings, each "same" or "different".'


class DailyLimitReached(Exception):
    pass


def ask(client, model, batch, system=SYSTEM, examples=EXAMPLES) -> list[str] | None:
    """The LLM's answers for one batch, or None if the answer can't be used."""
    from app.nlp.skill_extractor import extract_json_array
    for attempt in range(3):
        try:
            response = client.chat.completions.create(
                model=model, temperature=0,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": build_prompt(batch, examples)}],
            )
        except Exception as e:
            if "tokens per day" in str(e).lower() or "tpd" in str(e).lower():
                raise DailyLimitReached(str(e)[:200])
            print(f"  API error (attempt {attempt + 1}): {str(e)[:120]}")
            time.sleep(10)
            continue
        answers = [str(a).strip().lower() for a in (extract_json_array(response.choices[0].message.content) or [])]
        if len(answers) == len(batch) and all(a in ("same", "different") for a in answers):
            return answers
        print(f"  unusable answer (attempt {attempt + 1}), asking again")
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="count pairs and show the first prompt; no Groq")
    parser.add_argument("--limit", type=int, default=0, help="ask about at most this many pairs")
    parser.add_argument("--verify", action="store_true", help="second, stricter check of the pairs judged 'same'")
    args = parser.parse_args()

    merges = load_merges()
    if args.verify:
        return verify(merges, args)
    pairs = close_pairs()
    todo = [p for p in pairs if pair_id(p[1], p[2]) not in merges["pairs"]]
    decided = len(pairs) - len(todo)
    if args.limit:
        todo = todo[:args.limit]
    print(f"{len(pairs)} close pairs (similarity >= {MIN_SIMILARITY}); {decided} already decided; "
          f"asking about {len(todo)} now in batches of {BATCH}")
    if args.dry_run:
        print("\n--- first prompt ---\n" + SYSTEM + "\n\n" + build_prompt(todo[:BATCH]) if todo else "Nothing to ask.")
        return

    from app.nlp.skill_extractor import SkillExtractor
    extractor = SkillExtractor()
    asked = same = 0
    try:
        for start in range(0, len(todo), BATCH):
            batch = todo[start:start + BATCH]
            answers = ask(extractor.client, extractor.model, batch)
            if answers is None:
                print(f"  skipped {len(batch)} pairs (will be asked again next run)")
                continue
            for (sim, a, b), answer in zip(batch, answers):
                merges["pairs"][pair_id(a, b)] = {"a": a, "b": b, "similarity": round(sim, 3),
                                                  "same": answer == "same", "checked": date.today().isoformat()}
                same += answer == "same"
            asked += len(batch)
            save_merges(merges)                 # after every batch, so Ctrl+C loses nothing
            print(f"  {asked}/{len(todo)} asked, {same} judged the same")
            time.sleep(2)                       # stay under Groq's per-minute limit
    except DailyLimitReached as e:
        print(f"\nGroq daily token limit reached, stopping ({e}). Run again tomorrow; answers so far are saved.")
    except KeyboardInterrupt:
        print("\nStopped. Answers so far are saved.")
    print(f"\nDone this run: {asked} pairs asked, {same} same. {len(merges['pairs'])} pairs decided in total "
          f"({MERGES_FILE}).")


def verify(merges: dict, args):
    """Ask again, more strictly, about every pair the first pass judged 'same' (and not verified yet)."""
    todo = [(v["similarity"], v["a"], v["b"]) for v in merges["pairs"].values()
            if v["same"] and "verified" not in v]
    if args.limit:
        todo = todo[:args.limit]
    print(f"{sum(v['same'] for v in merges['pairs'].values())} pairs judged 'same' by the first pass; "
          f"verifying {len(todo)} now in batches of {BATCH}")
    if args.dry_run:
        print("\n--- first prompt ---\n" + VERIFY_SYSTEM + "\n\n" + build_prompt(todo[:BATCH], VERIFY_EXAMPLES)
              if todo else "Nothing to verify.")
        return
    from app.nlp.skill_extractor import SkillExtractor
    extractor = SkillExtractor()
    done = kept = 0
    try:
        for start in range(0, len(todo), BATCH):
            batch = todo[start:start + BATCH]
            answers = ask(extractor.client, extractor.model, batch, VERIFY_SYSTEM, VERIFY_EXAMPLES)
            if answers is None:
                print(f"  skipped {len(batch)} pairs (will be asked again next run)")
                continue
            for (_, a, b), answer in zip(batch, answers):
                merges["pairs"][pair_id(a, b)]["verified"] = answer == "same"
                kept += answer == "same"
            done += len(batch)
            save_merges(merges)
            print(f"  {done}/{len(todo)} verified, {kept} still 'same'")
            time.sleep(2)
    except DailyLimitReached as e:
        print(f"\nGroq daily token limit reached, stopping ({e}). Run again tomorrow; answers so far are saved.")
    except KeyboardInterrupt:
        print("\nStopped. Answers so far are saved.")
    final = sum(bool(v["same"] and v.get("verified")) for v in merges["pairs"].values())
    print(f"\nDone this run: {done} verified, {kept} still 'same'. Pairs to merge (both checks 'same'): {final}")


if __name__ == "__main__":
    main()
