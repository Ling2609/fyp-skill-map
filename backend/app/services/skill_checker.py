"""
Skill checker: a second model reviews the extractor's job skills (11 Oct, her idea after the E1b result).

The extractor (gpt-oss) already has one outside check: every skill's quote must be in the ad (evidence.check_quote).
That stops invented skills but not real words that are not skills ("Mandarin", "Speed", "Travel"), nor names that
join or blur skills ("PP/QM", "C# .NET"). The checker reads the ad and the extracted list against the labelling
guide and answers, per skill: keep, drop (with a reason) or rename (split or name it as the ad does).

Why another model with a code check after it: a model asked to correct itself without outside feedback often
does not improve and can get worse (Huang et al., ICLR 2024); checking with outside feedback does help (CRITIC,
Gou et al., ICLR 2024). So the checker is another model family, and its renames are checked by code again (every
new name must share a word with the ad's quote; otherwise the original name stays). It is told to keep a skill
when unsure: one wrongly dropped skill is a false gap removed from every student, so the bar for dropping is high.
"""
import json
import os
import re
import time

from app.services.evidence import normalise_text

# Which model checks (11 Oct). It must not be a labeller of the answer key (Claude / Qwen / Gemini), or the test
# favours it, and should not be the extractor's family (gpt-oss), or they may share blind spots. Tried: Llama on Groq
# (404, not open to her free account), Mistral Medium (free tier: 429 on the very first call). Chosen: Cohere's
# Command A Plus (another company and model family; trial key: 20 chat calls a minute, 1,000 a month, we need ~60).
# Options in backend/.env: CHECKER_PROVIDER=groq (gpt-oss-20b, same family as the extractor) or mistral; CHECKER_MODEL.
CHECKER_PROVIDER = "cohere"
CHECKER_MODELS = {"cohere": "command-a-plus-05-2026", "groq": "openai/gpt-oss-20b", "mistral": "mistral-medium-latest"}
COHERE_URL = "https://api.cohere.com/v2/chat"
RATE_WAITS = (20, 40, 60)                   # on a per-minute limit (429): wait and try again
MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions"


def provider() -> str:
    return (os.getenv("CHECKER_PROVIDER") or CHECKER_PROVIDER).strip().lower()


def model() -> str:
    return os.getenv("CHECKER_MODEL") or CHECKER_MODELS[provider()]
MAX_NEW_NAMES = 5

RULES = """A technical skill is a programming language, framework, library, tool, software product, platform, database,
protocol, standard or certification, or a technical method or domain (e.g. "Network security", "Machine learning",
"Agile").

NOT technical skills:
- soft skills and personal qualities (communication, teamwork, analytical, problem solving)
- tasks that name no skill ("prepare reports", "support users")
- degrees, years of experience, spoken languages (English, Mandarin, Japanese), work conditions, benefits
- qualities of a system rather than a skill (speed, correctness, scalability, reliability, latency)
- business areas, products or customers of the company (travel, rewards, accounts, onboarding), job titles
- team, department or product names of the company, unless the ad asks for skill in them
- a general word next to its specific items ("Programming languages" when the ad says "Python or Java")

Names: a short standard name (1-4 words). Separate technologies stay separate ("BGP, OSPF" -> "BGP", "OSPF";
"PP/QM" in an SAP ad -> "SAP PP", "SAP QM"). Name a skill as specifically as the ad does ("Object detection", not
"Detection", when the ad means object detection)."""

PROMPT = """You check skills that another model extracted from a job ad. For each numbered skill decide:
- "keep": it is a technical skill the ad asks for, prefers, will teach, or names as used in the work
- "drop": it is clearly NOT a technical skill by the rules below (give a short reason)
- "rename": it is a technical skill but badly named or several skills joined; give the right name(s)

When unsure, keep. Never add skills that are not in the list.

{rules}

Return only JSON: {{"decisions": [{{"id": 1, "action": "keep|drop|rename", "names": ["..."], "reason": "..."}}]}}
("names" only for rename.)

Job title: {title}

Ad:
{text}

Extracted skills (id. name -- quote from the ad):
{skills}"""


def ask(prompt: str) -> dict:
    return {"cohere": ask_cohere, "mistral": ask_mistral, "groq": ask_groq}[provider()](prompt)


def _post_json(url: str, key: str, body: dict, name: str) -> dict:
    """POST with waits on a per-minute limit (429); the response JSON, or an error naming the provider."""
    import httpx
    for wait in (*RATE_WAITS, None):
        r = httpx.post(url, timeout=120, headers={"Authorization": f"Bearer {key}"}, json=body)
        if r.status_code != 429 or wait is None:
            break
        print(f"  {name} rate limit: waiting {wait} s")
        time.sleep(wait)
    if r.status_code != 200:
        raise RuntimeError(f"{name} {r.status_code}: {r.text[:300]}")
    return r.json()


def ask_cohere(prompt: str) -> dict:
    from app.config import settings
    if not settings.cohere_api_key:
        raise RuntimeError("COHERE_API_KEY is not set in backend/.env")
    data = _post_json(COHERE_URL, settings.cohere_api_key, {
        "model": model(), "temperature": 0, "max_tokens": 4096, "response_format": {"type": "json_object"},
        "messages": [{"role": "user", "content": prompt}]}, "Cohere")
    parts = (data.get("message") or {}).get("content") or []
    return json.loads(next((p.get("text") for p in parts if p.get("type", "text") == "text"), "") or "{}")


def ask_groq(prompt: str) -> dict:
    from groq import Groq
    from app.config import settings
    r = Groq(api_key=settings.groq_api_key).chat.completions.create(
        model=model(), temperature=0, max_completion_tokens=8192,
        response_format={"type": "json_object"}, messages=[{"role": "user", "content": prompt}])
    return json.loads(r.choices[0].message.content or "{}")


def ask_mistral(prompt: str) -> dict:
    from app.config import settings
    if not settings.mistral_api_key:
        raise RuntimeError("MISTRAL_API_KEY is not set in backend/.env")
    data = _post_json(MISTRAL_URL, settings.mistral_api_key, {
        "model": model(), "temperature": 0, "max_tokens": 4096, "response_format": {"type": "json_object"},
        "messages": [{"role": "user", "content": prompt}]}, "Mistral")
    return json.loads(data["choices"][0]["message"]["content"] or "{}")


def _words(text: str) -> set[str]:
    return {w for w in re.split(r"[\s/,()]+", normalise_text(text)) if len(w) >= 2}


def check_skills(title: str, ad_text: str, skills: list[dict], ask=ask) -> tuple[list[str], list[dict]]:
    """skills: [{"skill", "quote"}]. Returns (names after the check, log of every drop / rename / refused rename).
    A skill the checker gives no valid answer for is kept (safe default)."""
    if not skills:
        return [], []
    listed = "\n".join(f"{i}. {s['skill']} -- \"{(s.get('quote') or '').strip()}\"" for i, s in enumerate(skills, 1))
    answer = ask(PROMPT.format(rules=RULES, title=title, text=ad_text, skills=listed))
    by_id = {}
    for d in answer.get("decisions", []) if isinstance(answer, dict) else []:
        try:
            by_id[int(d.get("id"))] = d
        except (TypeError, ValueError):
            continue
    out, log = [], []
    for i, s in enumerate(skills, 1):
        d = by_id.get(i) or {}
        action = str(d.get("action", "keep")).strip().lower()
        reason = " ".join(str(d.get("reason") or "").split())
        if action == "drop":
            log.append({"skill": s["skill"], "action": "drop", "new": "", "reason": reason})
            continue
        if action == "rename":
            names = [" ".join(str(n).split()) for n in (d.get("names") or []) if str(n).strip()][:MAX_NEW_NAMES]
            evidence = _words(s.get("quote") or "") | _words(s["skill"])
            ok = [n for n in names if _words(n) & evidence]
            if ok and [n.lower() for n in ok] != [s["skill"].lower()]:
                out += ok
                log.append({"skill": s["skill"], "action": "rename", "new": "; ".join(ok), "reason": reason})
                continue
            if names:     # every new name failed the code check: keep the original, report it
                log.append({"skill": s["skill"], "action": "rename refused", "new": "; ".join(names), "reason": reason})
        out.append(s["skill"])
    seen, names = set(), []
    for n in out:                                         # a rename can repeat a skill already in the list
        if n.lower() not in seen:
            seen.add(n.lower())
            names.append(n)
    return names, log
