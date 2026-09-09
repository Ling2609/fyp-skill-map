"""
Test SkillExtractor with Gemini.
Run from backend/ folder:
    python data/scripts/test_extractor.py
"""
import sys
import json
import pandas as pd
sys.path.append(".")

from app.nlp.skill_extractor import SkillExtractor

extractor = SkillExtractor()

# Test 1: Module extraction
print("\n── Test 1: Module extraction ──")
with open("data/modules.json", encoding="utf-8") as f:
    modules = json.load(f)

# Test first 5 modules
for module in modules[:5]:
    result = extractor.extract_from_module(module)
    print(f"\n  {result['module_name']} (Level {result['level']})")
    print(f"  Skills: {result['extracted_skills']}")

# Test 2: Job extraction
print("\n── Test 2: Job extraction ──")
df = pd.read_csv("data/jobstreet_clean.csv")

# Test first 3 jobs
for _, job in df.head(3).iterrows():
    result = extractor.extract_from_job(job.to_dict())
    print(f"\n  {result['job_title']} @ {result['company']}")
    print(f"  Skills: {result['extracted_skills']}")