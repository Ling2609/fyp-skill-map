"""
Module Skill Extraction Pipeline
=================================
Runs Gemini skill extraction on all modules and stores results in PostgreSQL.
Run once — results are stored and reused from DB.

Usage:
  cd backend
  python data/scripts/extract_module_skills.py
"""

import sys
import json
import time
sys.path.append(".")

from app.database import SessionLocal
from app.models.module import Module, ModuleSkill
from app.nlp.skill_extractor import SkillExtractor

def run():
    print("=" * 60)
    print("Module Skill Extraction Pipeline")
    print("=" * 60)

    # Load modules
    with open("data/modules.json", encoding="utf-8") as f:
        modules = json.load(f)
    print(f"\nModules to process: {len(modules)}")

    extractor = SkillExtractor()
    db = SessionLocal()

    try:
        total_skills = 0

        for i, mod in enumerate(modules, 1):
            print(f"\n[{i}/{len(modules)}] {mod['name']}")

            # Check if already processed WITH skills
            existing = db.query(Module).filter(
                Module.code == mod["code"]
            ).first()

            if existing:
                skill_count = db.query(ModuleSkill).filter(
                    ModuleSkill.module_id == existing.id
                ).count()
                if skill_count > 0:
                    print(f"  Already processed ({skill_count} skills) — skipping")
                    total_skills += skill_count
                    continue
                else:
                    # Has DB entry but no skills — delete and retry
                    db.query(ModuleSkill).filter(ModuleSkill.module_id == existing.id).delete()
                    db.delete(existing)
                    db.commit()
                    print(f"  Found empty entry — reprocessing")

            # Insert module
            db_module = Module(
                code=mod["code"],
                name=mod["name"],
                level=mod["level"],
                type=mod["type"],
            )
            db.add(db_module)
            db.commit()
            db.refresh(db_module)

            # Extract skills via Gemini
            result = extractor.extract_from_module(mod)
            skills = result["extracted_skills"]
            print(f"  Extracted {len(skills)} skills: {skills}")

            # Store skills
            for skill_name in skills:
                db_skill = ModuleSkill(
                    module_id=db_module.id,
                    module_code=mod["code"],
                    skill_name=skill_name,
                )
                db.add(db_skill)

            db.commit()
            total_skills += len(skills)

            # Rate limit — free tier is 15 RPM
            if i < len(modules):
                time.sleep(5)

        print("\n" + "=" * 60)
        print("EXTRACTION COMPLETE")
        print("=" * 60)
        print(f"Modules processed: {len(modules)}")
        print(f"Total skills stored: {total_skills}")

    finally:
        db.close()

if __name__ == "__main__":
    run()