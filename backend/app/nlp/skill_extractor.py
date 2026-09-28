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

JOB_FORMAT_SYSTEM = """You are a professional job description writer. Your task is to read, understand, and rewrite a raw job description into clean structured bullet points.

IMPORTANT: You are REWRITING, not copying. Read the full content, understand what it means, then write it properly.

RULES:
1. REWRITE each point in clear, professional English — do not copy broken or run-together text
2. Fix ALL spacing errors, broken words, and formatting issues
3. Keep ALL the original information and meaning — nothing important should be lost
4. Organise into sections with ## headers:
   - ## Responsibilities
   - ## Requirements  
   - ## Benefits
   - ## Work Conditions
   Only include sections that exist in the original.
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
                    config=types.GenerateContentConfig(system_instruction=system),
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