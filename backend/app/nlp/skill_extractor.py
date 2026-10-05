"""
Skill Extractor
===============
- Skill extraction (modules, jobs): gpt-oss-120b via the Groq API. Every skill used for
  matching comes from this ONE model, so module and job skills are worded consistently.
- Job description formatting (display only): Gemini, to keep Groq's daily token limit for
  skill extraction. If Gemini is unavailable, jobs.py falls back to rule-based formatting.
"""

import json
import os
import re
import time
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Gemini is used ONLY for formatting job descriptions (see module docstring)
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
_gemini_client = None


def _gemini():
    """Create the Gemini client on first use; None if no key is configured."""
    global _gemini_client
    if _gemini_client is None:
        key = os.getenv("GEMINI_API_KEY")
        if not key:
            return None
        from google import genai
        _gemini_client = genai.Client(api_key=key)
    return _gemini_client

# Module skills are extracted from the module DESCRIPTOR (name + description), not the
# name alone. Name-only extraction guessed skills from the title and padded towards the
# maximum (e.g. NumPy / Pandas for an intro Python module that teaches neither).
MODULE_EXTRACTED_BY = "gpt-oss-120b:descriptor-v1"   # stored in module_skills.extracted_by

MODULE_SYSTEM = "You are an academic skill analyser. Given a university module descriptor, list the technical and professional skills the module actually teaches, based only on its description. Never add tools, frameworks or topics the description does not mention or directly imply. Return ONLY a valid JSON array of skill strings, no explanation, no markdown."

MODULE_PROMPT = """Module: {module_name}
Description: {description}

List between 3 and 10 skills this module teaches. Fewer is better than guessing. Each skill must:
- Come from the description (stated, or directly implied by a stated topic)
- Keep the level the description states: an introductory or "basic" topic stays basic (e.g. "basic object-oriented programming", not "object-oriented design"; "algorithmic thinking", not "algorithm design")
- Prefer the description's own terms, in industry wording employers recognise (e.g. "SQL querying", "database normalisation")
- Be concise (1-4 words)
- Not repeat another skill in different words

Return ONLY a JSON array, example: ["SQL querying", "entity-relationship modelling", "database normalisation"]"""

JOB_SKILLS_SYSTEM = "You are a job requirements analyser. Extract specific technical and professional skills from job descriptions. Return ONLY a valid JSON array of skill strings, no explanation, no markdown. Extract between 5 and 15 skills depending on the job complexity."

JOB_SKILLS_PROMPT = """Job Title: {title}

Job Description:
{description}

Extract between 5 and 15 skills. Each skill should be:
- Specific and concise (2-4 words maximum)
- A real technical or professional skill
- Industry-standard terminology

Return ONLY a JSON array, example: ["Python", "REST API", "SQL", "Docker", "Agile"]"""

# ── Job skills with evidence (fix plan, Stage 1) ─────────────────────────────────────────────────
# Every skill must quote the ad; app/services/evidence.py checks the quote is really there, so skills
# with no supporting words are rejected. Level and type are tagged from the quote's context.
JOB_EVIDENCE_VERSION = "gpt-oss-120b:evidence-v8"   # stored in job_skills.extracted_by
# v2 (1 Oct dry run on 10 live ads): v1 returned ~2x the old count, with duties ("Escalation", "Research"),
# work conditions ("Willingness to travel"), generic parents ("Programming language" next to Python) and
# quotes joined with "...". v2 adds rules for each. v3 (Nokia ad): team / track names listed as skills
# ("Customer Engineering", "Service Delivery"), personality traits ("Curiosity", "Self-driven"), one idea
# listed twice ("Automation" + "Network automation"), programme curriculum not marked "trained". v4 (20 ads, seeds 42 + 7): "C#, Python, or equivalent", "OSCP or
# CREST CRT" listed as separate skills, so a student with one of them got a false gap for the other ->
# alternative_group: alternatives share one label; Stage 3 counts the group once, met by any member.
# v5 (same 10 ads): recall fell (NEXTDC 22 -> 5 skills; Nokia's programme content dropped) because v2 had
# removed v1's "list every skill the advert asks for or will teach", leaving only "do not list" rules.
# Restored, with named tools / products / certifications / standards called out.
# v6 (NEXTDC x3 on v5: 14, 8, 31 hard skills, Jaccard 0.43): same prompt + a second "what did you miss" pass.
# v7 (NEXTDC x3 on v6: 39, 24, 12, Jaccard 0.44 - no better): the first pass stops part-way through the ad at
# random, and asking "what did you miss" repeats the same randomness. Now the ad goes in as numbered sentences
# (each with its section heading) and the model must return an entry for EVERY sentence; code checks the
# numbers and re-asks only for sentences it skipped. Completeness becomes checkable instead of hoped for.
# v8 (NEXTDC x3 on v7: 2 / 34 / 3 hard skills; the two bad runs were exactly the ones with "Failed to validate
# JSON" errors and answered 8 and 9 of 34 sentences, the good run 34 of 34). Cause: gpt-oss is a reasoning
# model and its hidden reasoning shares the output budget (Groq: the default "may be too low for complex
# reasoning"), so long reasoning cuts the JSON short. Fix: max_completion_tokens 16384, reasoning_effort low,
# and every call reports finish_reason / tokens so a cut-off answer is visible.
EVIDENCE_MAX_TOKENS = 16384
EVIDENCE_REASONING = "low"

JOB_EVIDENCE_SYSTEM = (
    "You extract skills from job adverts. A skill is something a person can learn and show: a tool, "
    "technology, programming language, method, standard, area of technical knowledge, or an interpersonal "
    "ability. List EVERY skill the advert asks for, prefers, or says the role will teach; never skip a named "
    "tool, product, platform, certification or standard. For each one, copy the exact words from the advert that mention it (evidence_quote: one "
    "continuous verbatim span, never reworded, never shortened with '...', never invented). If no words in "
    "the advert mention a skill, do not list it."
)

JOB_EVIDENCE_PROMPT = """Rules for each skill:
- skill: a short, standard name (1-4 words), e.g. "REST APIs", "Python", "Stakeholder communication";
  never a copied phrase ("AV systems deployment and troubleshooting" -> "AV systems")
- evidence_quote: one continuous span copied word for word from the advert (5-15 words is ideal). Never
  join two places with "..."; if the words are far apart, quote the part that names the skill.
- type: "hard" for technical or domain skills; "soft" for interpersonal or personal skills
- level: "required" (the candidate must already have it: requirements, qualifications, must, need),
  "preferred" (preferred, nice to have, advantage, a plus), "trained" (the role will teach it: you will
  learn, training, learning phase, what a graduate or training programme covers), "unspecified" (only
  mentioned as part of the job's duties, or no clue either way)

Do NOT list:
- duties or tasks that are not skills ("Escalation", "Research", "Benchmarking", "Documentation of
  incidents", "Mechanical setup support") - list the skill behind the task only if the advert names one
- names of teams, departments, business units or programme tracks the person may join ("Customer
  Engineering", "Service Delivery", "Network Transformation Programs")
- personality traits and attitudes ("Curiosity", "Passion for technology", "Self-driven", "Proactive");
  soft skills that can be learned and shown stay ("Communication", "Teamwork", "Problem-solving")
- work conditions or personal circumstances ("Willingness to travel", "Shift work", "Flexible delivery",
  "Driving licence")
- degrees, years of experience, languages spoken, benefits, or the company's own products unless the
  advert asks for skill in them
- a generic parent next to its specific items: if the advert says "Python or Java", list Python and Java,
  not also "Programming languages"; a bare category word ("Networks", "Storage", "Operating systems") only
  when the advert names nothing more specific for it
One skill per idea: if two names in the advert mean the same thing, list it once with the more specific
name ("network automation" and "automation" -> "Network automation"; "computer networking" and "network
fundamentals" -> "Computer networking").
Group sensibly: modules or editions of one product are one skill ("F5 LTM, GTM, APM" -> "F5 BIG-IP");
separate technologies stay separate ("BGP, OSPF" -> "BGP", "OSPF").
- alternative_group: when the advert accepts ANY ONE of several options ("C#, Python, or equivalent",
  "OSCP or CREST CRT", "tools such as Power BI or Tableau"), list each option and give them the same short
  label (e.g. "BI tool"); otherwise "". Items that are all wanted ("SQL and Python") get "".

Example advert: "Requirements: Bachelor in IT. Strong SQL and Python skills. Experience with Power BI or Tableau is a plus.
You will learn our ETL tooling during onboarding. Good communication skills."
Example output: {{"skills": [
 {{"skill": "SQL", "evidence_quote": "Strong SQL and Python skills", "type": "hard", "level": "required", "alternative_group": ""}},
 {{"skill": "Python", "evidence_quote": "Strong SQL and Python skills", "type": "hard", "level": "required", "alternative_group": ""}},
 {{"skill": "Power BI", "evidence_quote": "Experience with Power BI or Tableau is a plus", "type": "hard", "level": "preferred", "alternative_group": "BI tool"}},
 {{"skill": "Tableau", "evidence_quote": "Experience with Power BI or Tableau is a plus", "type": "hard", "level": "preferred", "alternative_group": "BI tool"}},
 {{"skill": "ETL", "evidence_quote": "You will learn our ETL tooling", "type": "hard", "level": "trained", "alternative_group": ""}},
 {{"skill": "Communication", "evidence_quote": "Good communication skills", "type": "soft", "level": "required", "alternative_group": ""}}]}}

Return only JSON in the example's shape: {{"skills": [...]}}

Job Title: {title}

Advert:
{description}"""

JOB_SENTENCES_PROMPT = JOB_EVIDENCE_PROMPT.split("Example advert:")[0] + """The advert is given as numbered sentences; the section heading each sentence sits under is in brackets.
Go through EVERY sentence in order. Return one entry per sentence number, with the skills that sentence mentions
(an empty list if it mentions none). The evidence_quote must be words from that same sentence.

Example input:
[1] (Requirements) Strong SQL and Python skills.
[2] (Requirements) Experience with Power BI or Tableau is a plus.
[3] (About us) We are a fast-growing bank.
[4] (What you will learn) You will learn our ETL tooling during onboarding.
Example output: {{"sentences": [
 {{"id": 1, "skills": [
   {{"skill": "SQL", "evidence_quote": "Strong SQL and Python skills", "type": "hard", "level": "required", "alternative_group": ""}},
   {{"skill": "Python", "evidence_quote": "Strong SQL and Python skills", "type": "hard", "level": "required", "alternative_group": ""}}]}},
 {{"id": 2, "skills": [
   {{"skill": "Power BI", "evidence_quote": "Experience with Power BI or Tableau is a plus", "type": "hard", "level": "preferred", "alternative_group": "BI tool"}},
   {{"skill": "Tableau", "evidence_quote": "Experience with Power BI or Tableau is a plus", "type": "hard", "level": "preferred", "alternative_group": "BI tool"}}]}},
 {{"id": 3, "skills": []}},
 {{"id": 4, "skills": [
   {{"skill": "ETL", "evidence_quote": "You will learn our ETL tooling", "type": "hard", "level": "trained", "alternative_group": ""}}]}}]}}

Return only JSON in the example's shape, one entry for each of the {n} sentences.

Job Title: {title}

Advert sentences:
{sentences}"""

_SKILL_ITEM = {
    "type": "object",
    "properties": {
        "skill": {"type": "string"},
        "evidence_quote": {"type": "string"},
        "type": {"type": "string", "enum": ["hard", "soft"]},
        "level": {"type": "string", "enum": ["required", "preferred", "trained", "unspecified"]},
        "alternative_group": {"type": "string"},
    },
    "required": ["skill", "evidence_quote", "type", "level", "alternative_group"],
    "additionalProperties": False,
}
JOB_EVIDENCE_SCHEMA = {
    "type": "object",
    "properties": {"sentences": {"type": "array", "items": {
        "type": "object",
        "properties": {"id": {"type": "integer"}, "skills": {"type": "array", "items": _SKILL_ITEM}},
        "required": ["id", "skills"],
        "additionalProperties": False,
    }}},
    "required": ["sentences"],
    "additionalProperties": False,
}
SENTENCES_PER_CALL = 45     # long ads go in batches, so no single answer gets too long

JOB_FORMAT_SYSTEM = """You are a professional job description writer. Your task is to read, understand, and rewrite a raw job description into clean structured bullet points.

IMPORTANT: You are REWRITING, not copying. Read the full content, understand what it means, then write it properly.

RULES:
1. REWRITE each point in clear, professional English — do not copy broken or run-together text
2. Fix ALL spacing errors, broken words, and formatting issues
3. Keep ALL the original information and meaning — nothing important should be lost
4. Organise into sections with ## headers:
   - ## Responsibilities
   - ## Requirements
   - ## Nice to have
   - ## Benefits
   - ## Work Conditions
   Only include sections that exist in the original. Keep every item in the section the advert puts it in, in
   the same order; only the heading wording may change. Use ## Nice to have only for a section the advert itself
   heads "Preferred Qualifications", "Good to Have", "Bonus", "Advantage" or similar, never under ## Requirements.
   Do not move a single item out of its section because it mentions "a plus" or "valued".
   (5 Oct: Meta's "Preferred Qualifications" were merged into Requirements; then Motorola's "Understanding of
   vector databases" was moved out of its Requirements, so the page and the skill gap seemed to disagree.)
5. Each bullet is one clear, complete sentence
6. Remove company promotional text and duplicate points
7. Do NOT add dashes or bullet characters before items — just write the text
8. Return ONLY a JSON array of strings, no markdown outside the array"""

JOB_FORMAT_PROMPT = """Read and rewrite this job description professionally.

Job Title: {title}

Raw Description (may contain formatting errors, run-together words, broken text):
{description}

Rewrite it as clean bullet points. Fix any broken text. Keep all important information.
Return a JSON array of strings with ## section headers."""


def extract_json_array(text: str) -> list:
    """Try multiple strategies to extract a JSON array from text."""
    try:
        result = json.loads(text)
        if isinstance(result, list):
            return result
    except json.JSONDecodeError:
        pass

    if "```" in text:
        parts = text.split("```")
        for part in parts:
            part = part.strip()
            if part.startswith("json"):
                part = part[4:].strip()
            try:
                result = json.loads(part)
                if isinstance(result, list):
                    return result
            except json.JSONDecodeError:
                continue

    match = re.search(r'\[.*?\]', text, re.DOTALL)
    if match:
        try:
            result = json.loads(match.group())
            if isinstance(result, list):
                return result
        except json.JSONDecodeError:
            pass

    if '[' in text:
        start = text.index('[')
        fragment = text[start:]
        items = re.findall(r'"([^"]+)"', fragment)
        if items:
            return items

    return []


class SkillExtractor:
    def __init__(self):
        self.client = client
        self.model = "openai/gpt-oss-120b"
        # Strict JSON schema first; dropped (for this run) if Groq refuses it
        self._evidence_format = [{"type": "json_schema",
                                  "json_schema": {"name": "job_skills", "strict": True, "schema": JOB_EVIDENCE_SCHEMA}},
                                 {"type": "json_object"}]
        self._reasoning_ok = True     # reasoning_effort accepted (dropped if Groq refuses it)
        self.last_calls = []
        print(f"SkillExtractor initialised with {self.model} via Groq")

    def _call_groq(self, system: str, prompt: str, retries: int = 3) -> list[str]:
        """Call Groq API and parse JSON array response."""
        for attempt in range(retries):
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0,
                )
                text = response.choices[0].message.content.strip()
                result = extract_json_array(text)
                if result:
                    return [str(s).strip() for s in result if s]
                print(f"  Could not parse response on attempt {attempt + 1}: {text[:100]}")
                if attempt < retries - 1:
                    time.sleep(2)
            except Exception as e:
                print(f"  API error on attempt {attempt + 1}: {e}")
                if attempt < retries - 1:
                    time.sleep(5)
        return []

    def extract_from_module(self, module: dict) -> dict:
        """Extract skills from a module dict."""
        name = module.get("name", "")
        description = (module.get("description") or "").strip()
        if not description:
            raise ValueError(f"Module {module.get('code')} has no description: skills must come from the descriptor")
        prompt = MODULE_PROMPT.format(module_name=name, description=description)
        skills = self._call_groq(MODULE_SYSTEM, prompt)

        return {
            "module_code": module.get("code"),
            "module_name": name,
            "level": module.get("level"),
            "type": module.get("type"),
            "extracted_skills": skills,
            "skill_count": len(skills),
        }

    def extract_from_job(self, job: dict) -> dict:
        """Extract skills from a job posting dict."""
        description = job.get("descriptions", "")
        title = job.get("job_title", "")

        prompt = JOB_SKILLS_PROMPT.format(title=title, description=description)
        skills = self._call_groq(JOB_SKILLS_SYSTEM, prompt)

        return {
            "job_id": job.get("job_id"),
            "job_title": title,
            "company": job.get("company"),
            "extracted_skills": skills,
            "formatted_bullets": [],
            "skill_count": len(skills),
        }

    def extract_job_skills_with_evidence(self, title: str, description: str, retries: int = 3,
                                         glean: bool = True) -> list[dict]:
        """Skill mentions with evidence quotes, type, level and alternative_group, unchecked and not yet one
        per skill: run app.services.job_skill_store.check_job_skills next. The ad goes in as numbered sentences with their section
        headings; the model must answer for every sentence. glean: re-ask once for any sentence numbers the
        answer skipped (each item records "pass": 1 or 2 and its "sentence_id")."""
        from app.services.evidence import _segments
        segs = _segments(description, include_headings=True) or [("", line.strip()) for line in description.splitlines() if line.strip()]
        lines = {i + 1: (f"[{i + 1}] ({h.rstrip(':')}) {t}" if h else f"[{i + 1}] {t}") for i, (h, t) in enumerate(segs)}
        items, answered = [], set()
        self.last_calls = []          # (finish_reason, completion tokens) per call, for the dry-run report
        ids = list(lines)
        for start in range(0, len(ids), SENTENCES_PER_CALL):
            batch = ids[start:start + SENTENCES_PER_CALL]
            got = self._ask_sentences(title, [lines[i] for i in batch], retries)
            items += [{**sk, "pass": 1, "sentence_id": sid} for sid, sks in got.items() if sid in batch for sk in sks]
            answered |= set(got) & set(batch)
        missing = [i for i in ids if i not in answered]
        if glean and missing:
            for start in range(0, len(missing), SENTENCES_PER_CALL):
                batch = missing[start:start + SENTENCES_PER_CALL]
                got = self._ask_sentences(title, [lines[i] for i in batch], retries)
                items += [{**sk, "pass": 2, "sentence_id": sid} for sid, sks in got.items() if sid in batch for sk in sks]
                answered |= set(got) & set(batch)
        self.last_coverage = (len(answered), len(ids))     # sentences answered / sentences in the ad
        # Every mention is returned (the same skill can appear in several sentences, e.g. duties AND
        # requirements). One entry per skill is chosen only after the quote and group checks
        # (app.services.job_skill_store.check_job_skills), so the strongest level wins (F25).
        return items

    def _ask_sentences(self, title: str, numbered: list[str], retries: int) -> dict[int, list[dict]]:
        """One schema-checked call for a batch of numbered sentences -> {sentence id: skills}. Empty on failure.
        Re-raises Groq's daily token limit."""
        messages = [{"role": "system", "content": JOB_EVIDENCE_SYSTEM},
                    {"role": "user", "content": JOB_SENTENCES_PROMPT.format(
                        title=title, n=len(numbered), sentences="\n".join(numbered))}]
        for attempt in range(retries):
            try:
                extra = {"max_completion_tokens": EVIDENCE_MAX_TOKENS}
                if self._reasoning_ok:
                    extra["reasoning_effort"] = EVIDENCE_REASONING
                response = self.client.chat.completions.create(
                    model=self.model, messages=messages, temperature=0, response_format=self._evidence_format[0], **extra)
                choice = response.choices[0]
                usage = getattr(response, "usage", None)
                self.last_calls.append((getattr(choice, "finish_reason", None), getattr(usage, "completion_tokens", None)))
                if getattr(choice, "finish_reason", None) == "length":
                    print(f"  answer cut off at the token limit ({getattr(usage, 'completion_tokens', '?')} tokens)")
                data = json.loads(choice.message.content)
                out = {}
                for entry in data.get("sentences", []):
                    if isinstance(entry, dict) and isinstance(entry.get("id"), int):
                        out[entry["id"]] = [sk for sk in entry.get("skills", []) if isinstance(sk, dict) and sk.get("skill")]
                return out
            except Exception as e:
                text = str(e).lower()
                if "tokens per day" in text or "tpd" in text:
                    raise
                if "json_schema" in text and len(self._evidence_format) > 1:
                    print("  strict JSON schema refused, using JSON mode")
                    self._evidence_format.pop(0)
                    continue
                if "reasoning_effort" in text and self._reasoning_ok:
                    print("  reasoning_effort refused, using the default")
                    self._reasoning_ok = False
                    continue
                self.last_calls.append(("error", None))
                print(f"  attempt {attempt + 1} failed: {str(e)[:120]}")
                time.sleep(5)
        return {}

    def format_job_description(self, title: str, description: str) -> list[str]:
        """
        Format job description into structured bullet points.
        Handles both well-structured and poorly-formatted descriptions.
        Keeps exact original wording.
        """
        if not description:
            return []
        prompt = JOB_FORMAT_PROMPT.format(title=title, description=description)
        return self._call_gemini(JOB_FORMAT_SYSTEM, prompt)

    def _call_gemini(self, system: str, prompt: str, retries: int = 2) -> list[str]:
        """Call Gemini and parse a JSON array. Returns [] on failure (caller falls back)."""
        gemini = _gemini()
        if gemini is None:
            print("  GEMINI_API_KEY not set: using rule-based formatting")
            return []
        from google.genai import types
        for attempt in range(retries):
            try:
                response = gemini.models.generate_content(
                    model=GEMINI_MODEL,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=system,
                        # no tools are passed; turning AFC off also silences its warning
                        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                    ),
                )
                result = extract_json_array((response.text or "").strip())
                if result:
                    return [str(s).strip() for s in result if s]
                print(f"  Gemini: could not parse response on attempt {attempt + 1}")
            except Exception as e:
                print(f"  Gemini error on attempt {attempt + 1}: {e}")
            if attempt < retries - 1:
                time.sleep(3)
        return []