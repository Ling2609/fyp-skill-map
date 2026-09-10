"""
Skill Extractor using Google Gemini
=====================================
Uses Gemini 3.6 Flash (Interactions API) to extract skills from text.
Applies to both module titles and job descriptions.

Usage:
    from app.nlp.skill_extractor import SkillExtractor
    extractor = SkillExtractor()
    skills = extractor.extract_from_module(module)
    skills = extractor.extract_from_job(job)
"""

import json
import os
import time
from google import genai
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

MODULE_SYSTEM = "You are an academic skill analyser. Given a university module name, extract the specific technical and professional skills that students would learn in this module. Return ONLY a valid JSON array of skill strings, no explanation, no markdown."

MODULE_PROMPT = """Module: {module_name}

Extract the skills students would learn. Each skill should be:
- Specific (e.g. "Python programming" not just "programming")
- Industry-relevant (terms employers would recognise)
- Concise (2-4 words maximum)

Return ONLY a JSON array, example: ["Python programming", "SQL", "data modelling"]"""

JOB_SYSTEM = "You are a job requirements analyser. Extract specific technical and professional skills from job descriptions. Return ONLY a valid JSON array of skill strings, no explanation, no markdown, maximum 15 skills."

JOB_PROMPT = """Job Title: {title}

Job Description:
{description}

Extract the required skills. Each skill should be:
- Specific and concise (2-4 words maximum)
- A real technical or professional skill
- Industry-standard terminology

Return ONLY a JSON array, example: ["Python", "REST API", "SQL", "Docker", "Agile"]"""


class SkillExtractor:
    def __init__(self):
        self.client = client
        self.model = "gemini-3.6-flash"
        print(f"SkillExtractor initialised with {self.model}")

    def _call_gemini(self, system: str, prompt: str, retries: int = 3) -> list[str]:
        """Call Gemini Interactions API and parse JSON response."""
        for attempt in range(retries):
            try:
                interaction = self.client.interactions.create(
                    model=self.model,
                    system_instruction=system,
                    input=prompt,
                    extra_body={"generation_config": {"temperature": 0}},
                )
                text = interaction.output_text.strip()

                # Strip markdown code blocks if present
                if text.startswith("```"):
                    text = text.split("```")[1]
                    if text.startswith("json"):
                        text = text[4:]
                    text = text.strip()

                skills = json.loads(text)
                if isinstance(skills, list):
                    return [str(s).strip() for s in skills if s]
                return []

            except json.JSONDecodeError:
                print(f"  JSON parse error on attempt {attempt + 1}, response: {text[:100]}")
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
        skills = self._call_gemini(MODULE_SYSTEM, prompt)

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

        # Truncate long descriptions to avoid token limits
        if len(description) > 2000:
            description = description[:2000]

        prompt = JOB_PROMPT.format(title=title, description=description)
        skills = self._call_gemini(JOB_SYSTEM, prompt)

        return {
            "job_id": job.get("job_id"),
            "job_title": title,
            "company": job.get("company"),
            "extracted_skills": skills,
            "skill_count": len(skills),
        }