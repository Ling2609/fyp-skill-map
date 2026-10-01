"""
LLM judge for the reference set (Stage 2B): label every pair in reference_pairs_v1.csv with one of the five labels
of docs/skill_relation_label_guide.md, using one LLM. Run once per judge:
  gemini   Gemini (GEMINI_API_KEY in .env; model GEMINI_JUDGE_MODEL, else GEMINI_MODEL)
  gpt_oss  gpt-oss-120b via Groq (GROQ_API_KEY in .env; shares the daily token limit with extraction)
  qwen     Qwen via Groq (same key; Groq lists a separate daily limit per model; QWEN_JUDGE_MODEL to override)
The third judge, Claude, labels the same pairs in the chat (label_claude.csv).

Blind: the judge gets only the two skill names (no cosine, no band), the guide's question, rules and worked
examples, and the pairs in the CSV's (already shuffled) order. Temperature 0.

Saves after every batch to data/skill_relations/reference_labels/label_<judge>.csv and skips pairs already labelled,
so a run stopped by a rate limit just continues next time.

Usage (from backend/, venv active):
  python scripts/skill_relations/judge_reference_pairs.py --judge gemini --limit 20     # small test first
  python scripts/skill_relations/judge_reference_pairs.py --judge gemini                # all 400
  python scripts/skill_relations/judge_reference_pairs.py --judge gpt_oss
  python scripts/skill_relations/judge_reference_pairs.py --judge qwen --limit 20
"""
import argparse
import json
import os
import sys
import time

import pandas as pd
from dotenv import load_dotenv

PAIRS_CSV = "data/skill_relations/reference_pairs_v1.csv"
OUT_DIR = "data/skill_relations/reference_labels"
GUIDE = "../docs/skill_relation_label_guide.md"
LABELS = ["SAME", "NARROWER", "BROADER", "RELATED", "DIFFERENT"]
BATCH = 20               # pairs per call
GROQ_MODEL = "openai/gpt-oss-120b"
QWEN_MODEL = "qwen/qwen3.8-27b"     # Alibaba's Qwen on Groq: a different model family from Anthropic, OpenAI, Google

INSTRUCTIONS = """You are one of three independent judges labelling skill pairs for a research evaluation.
Follow the label guide below exactly. Judge only the two skill names, never a job title or context.
Each pair is written "A -> B": A is the student's skill, B is the job's skill. The direction matters.
Answer with JSON only: {"labels": [{"id": <id>, "label": "<SAME|NARROWER|BROADER|RELATED|DIFFERENT>"}, ...]},
one entry for every id you are given, no explanations.

LABEL GUIDE
"""


def guide_text() -> str:
    """The guide's question, rules and worked examples; not the last section (how the labels are used)."""
    text = open(GUIDE, encoding="utf-8").read()
    return text.split("## How the guide is used")[0].strip()


def ask_gemini(system: str, user: str) -> str:
    from google import genai
    from google.genai import types
    model = os.getenv("GEMINI_JUDGE_MODEL") or os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    response = client.models.generate_content(
        model=model, contents=user,
        config=types.GenerateContentConfig(
            system_instruction=system, temperature=0, response_mime_type="application/json",
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True)))
    return response.text or ""


def ask_groq(model: str, system: str, user: str, reasoning: bool) -> str:
    from groq import Groq
    client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    extra = {"reasoning_effort": "medium"} if reasoning else {}
    response = client.chat.completions.create(
        model=model, temperature=0, response_format={"type": "json_object"}, max_completion_tokens=8192,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}], **extra)
    return response.choices[0].message.content or ""


def ask_gpt_oss(system: str, user: str) -> str:
    return ask_groq(GROQ_MODEL, system, user, reasoning=True)


def ask_qwen(system: str, user: str) -> str:
    return ask_groq(os.getenv("QWEN_JUDGE_MODEL") or QWEN_MODEL, system, user, reasoning=False)


ASK = {"gemini": ask_gemini, "gpt_oss": ask_gpt_oss, "qwen": ask_qwen}


def model_name(judge: str) -> str:
    if judge == "gemini":
        return os.getenv("GEMINI_JUDGE_MODEL") or os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
    if judge == "qwen":
        return os.getenv("QWEN_JUDGE_MODEL") or QWEN_MODEL
    return GROQ_MODEL


def parse(text: str, ids: set[int]) -> dict[int, str]:
    """{id: label} for the ids we asked about with a valid label; anything else is ignored (asked again later)."""
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return {}
    out = {}
    for item in data.get("labels", []) if isinstance(data, dict) else []:
        if not isinstance(item, dict):
            continue
        try:
            i = int(item.get("id"))
        except (TypeError, ValueError):
            continue
        label = str(item.get("label", "")).strip().upper()
        if i in ids and label in LABELS:
            out[i] = label
    return out


def is_daily_limit(err: Exception) -> bool:
    """Groq: "tokens per day (TPD)"; Gemini: "...PerDay..." quota. A per-minute limit is not daily: wait and retry."""
    msg = str(err).lower().replace(" ", "")
    return "perday" in msg


def is_busy(err: Exception) -> bool:
    """Per-minute limit (429) or the model temporarily overloaded (503): wait and try the same batch again."""
    msg = str(err).lower()
    return any(w in msg for w in ("429", "rate limit", "resource_exhausted", "503", "unavailable", "overloaded"))


def run(judge: str, limit: int | None, ask=None, pairs_csv=PAIRS_CSV, out_dir=OUT_DIR, pause=2.0):
    ask = ask or ASK[judge]
    pairs = pd.read_csv(pairs_csv)[["id", "a", "b"]]
    if limit:
        pairs = pairs.head(limit)
    out = os.path.join(out_dir, f"label_{judge}.csv")
    column = f"label_{judge}"
    done = pd.read_csv(out) if os.path.exists(out) else pd.DataFrame(columns=["id", "a", "b", column, "model"])
    todo = pairs[~pairs.id.isin(done.id)]
    print(f"Judge {judge} ({model_name(judge)}): {len(done)} already labelled, {len(todo)} to do")
    if todo.empty:
        return done
    system = INSTRUCTIONS + guide_text()
    os.makedirs(out_dir, exist_ok=True)

    failures, waits = 0, 0
    while not todo.empty and failures < 3 and waits < 10:
        batch = todo.head(BATCH)
        user = "\n".join(f"{i}. {a} -> {b}" for i, a, b in zip(batch.id, batch.a, batch.b))
        try:
            got = parse(ask(system, user), set(int(i) for i in batch.id))
        except Exception as e:
            if is_daily_limit(e):
                print(f"Daily limit reached: {e}\nRun the same command again after the limit resets; it continues.")
                break
            if is_busy(e):
                waits += 1
                print(f"  busy or per-minute limit ({str(e)[:60]}...): waiting 60 s ({waits}/10)")
                time.sleep(60)
                continue
            print(f"  error: {e}")
            got = {}
        if not got:
            failures += 1
            print(f"  no usable answer for ids {batch.id.iloc[0]}..{batch.id.iloc[-1]} (attempt {failures})")
            time.sleep(pause * 5)
            continue
        failures, waits = 0, 0
        new = batch[batch.id.isin(got)].assign(**{column: lambda d: d.id.map(got), "model": model_name(judge)})
        done = pd.concat([done, new], ignore_index=True)
        done.to_csv(out, index=False, encoding="utf-8")          # saved after every batch
        todo = todo[~todo.id.isin(done.id)]
        print(f"  labelled {len(done)} / {len(pairs)}")
        time.sleep(pause)                                        # stay under the per-minute limits

    if waits >= 10:
        print("Model still busy after 10 waits: run the same command again later; it continues.")
    print(f"\nSaved {len(done)} labels to {out}")
    print(done[column].value_counts().to_string())
    return done


def main():
    load_dotenv()
    ap = argparse.ArgumentParser()
    ap.add_argument("--judge", required=True, choices=sorted(ASK))
    ap.add_argument("--limit", type=int, help="only the first N pairs (a test run)")
    args = ap.parse_args()
    key = "GEMINI_API_KEY" if args.judge == "gemini" else "GROQ_API_KEY"
    if not os.getenv(key):
        sys.exit(f"{key} is not set in backend/.env")
    run(args.judge, args.limit)


if __name__ == "__main__":
    main()
