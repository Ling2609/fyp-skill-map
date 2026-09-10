"""
Skill Extractor using Groq (GPT-OSS-120B)
==========================================
Uses Groq's free API to extract skills from text.
Applies to both module titles and job descriptions.

Usage:
    from app.nlp.skill_extractor import SkillExtractor
    extractor = SkillExtractor()
    skills = extractor.extract_from_module(module)
    skills = extractor.extract_from_job(job)
"""

import json
import os
import re
import time
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

MODULE_SYSTEM = "You are an academic skill analyser. Given a university module name, extract the specific technical and professional skills that students would learn in this module. Return ONLY a valid JSON array of skill strings, no explanation, no markdown. Extract between 5 and 15 skills depending on the module scope."

MODULE_PROMPT = """Module: {module_name}

Extract between 5 and 15 skills students would learn, depending on the module scope. Each skill should be:
- Specific (e.g. "Python programming" not just "programming")
- Industry-relevant (terms employers would recognise)
- Concise (2-4 words maximum)

Return ONLY a JSON array, example: ["Python programming", "SQL", "data modelling"]"""

JOB_SYSTEM = "You are a job requirements analyser. Extract specific technical and professional skills from job descriptions. Return ONLY a valid JSON array of skill strings, no explanation, no markdown. Extract between 5 and 15 skills depending on the job complexity."

JOB_PROMPT = """Job Title: {title}

Job Description:
{description}

Extract between 5 and 15 skills depending on the job complexity. Each skill should be:
- Specific and concise (2-4 words maximum)
- A real technical or professional skill
- Industry-standard terminology

Return ONLY a JSON array, example: ["Python", "REST API", "SQL", "Docker", "Agile"]"""


def extract_json_array(text: str) -> list:
    """Try multiple strategies to extract a JSON array from text."""
    # Strategy 1: direct parse
    try:
        result = json.loads(text)
        if isinstance(result, list):
            return result
    except json.JSONDecodeError:
        pass

    # Strategy 2: strip markdown code blocks
    clean = text
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

    # Strategy 3: find [...] pattern in text
    match = re.search(r'\[.*?\]', text, re.DOTALL)
    if match:
        try:
            result = json.loads(match.group())
            if isinstance(result, list):
                return result
        except json.JSONDecodeError:
            pass

    # Strategy 4: truncated JSON — try to recover
    # Find opening bracket and grab everything up to last complete string
    if '[' in text:
        start = text.index('[')
        fragment = text[start:]
        # Find all quoted strings
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
        """Call Groq API and parse JSON response."""
        for attempt in range(retries):
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0,
                    max_tokens=1024,
                )
                text = response.choices[0].message.content.strip()
                skills = extract_json_array(text)
                if skills:
                    return [str(s).strip() for s in skills if s]
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
        prompt = MODULE_PROMPT.format(module_name=name)
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

        prompt = JOB_PROMPT.format(title=title, description=description)
        skills = self._call_groq(JOB_SYSTEM, prompt)

        return {
            "job_id": job.get("job_id"),
            "job_title": title,
            "company": job.get("company"),
            "extracted_skills": skills,
            "skill_count": len(skills),
        }