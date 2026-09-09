"""
Quick test for SkillExtractor.
Run from backend/ folder:
    python data/scripts/test_extractor.py
"""
import sys
sys.path.append(".")

from app.nlp.skill_extractor import SkillExtractor
import json

extractor = SkillExtractor()

# Test 1: raw text
print("\n── Test 1: Raw text extraction ──")
text = "Experience with Python programming, SQL databases, Docker, REST API design and Agile development methodology."
skills = extractor.extract(text)
for s in skills:
    print(f"  [{s['category']}] {s['name']} (freq: {s['jobstreet_frequency']})")

# Test 2: module extraction
print("\n── Test 2: Module extraction ──")
with open("data/modules.json", encoding="utf-8") as f:
    modules = json.load(f)

for module in modules[:5]:
    result = extractor.extract_from_module(module)
    print(f"\n  {result['module_name']} (Level {result['level']})")
    if result['extracted_skills']:
        for s in result['extracted_skills']:
            print(f"    → {s['name']} [{s['category']}]")
    else:
        print(f"    → No skills matched")