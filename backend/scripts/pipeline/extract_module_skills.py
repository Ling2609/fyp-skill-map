"""
Module Skill Extraction
=======================
Finds skills for every module in the database that has a description but no skills yet (e.g. the modules added by
migrations/migrate_all_programmes.py). Same Groq prompt and label as Admin > Academic structure "Find skills again",
so the result is the same as if an admin had added the module by hand. Each module starts "To review".

Never touches a module that already has skills, so admin reviews and admin-added skills are safe. Resumable: if Groq
returns nothing (usually its daily token limit) it stops; run it again later to continue.

(Until 10 Oct this script read data/modules.json and re-created modules; with programmes and admin review in the
database, modules are now created by the migration or by Admin, and this script only fills in skills.)

Usage (from backend/, venv active):
  python scripts/pipeline/extract_module_skills.py --dry-run   # lists the modules it would do, no Groq calls
  python scripts/pipeline/extract_module_skills.py
"""
import sys
import time

sys.path.append(".")

from sqlalchemy import func

from app.database import SessionLocal
from app.models.module import Module, ModuleSkill
from app.nlp.skill_extractor import MODULE_EXTRACTED_BY, SkillExtractor


def dedupe(skills: list[str]) -> list[str]:
    seen, out = set(), []
    for s in skills:
        s = " ".join(str(s).split())
        if s and s.lower() not in seen:
            seen.add(s.lower())
            out.append(s)
    return out


def main():
    dry_run = "--dry-run" in sys.argv
    db = SessionLocal()
    try:
        with_skills = {mid for (mid,) in db.query(ModuleSkill.module_id).distinct()}
        todo = [m for m in db.query(Module).order_by(Module.code).all()
                if m.id not in with_skills and (m.description or "").strip()]
        no_text = db.query(func.count(Module.id)).filter((Module.description.is_(None)) | (Module.description == "")).scalar()
        print(f"{len(todo)} module(s) without skills" + (f"; {no_text} without a description (skipped)" if no_text else ""))
        if dry_run:
            for m in todo:
                print(f"  {m.code}  {m.name}")
            return

        extractor = SkillExtractor()
        done = total = 0
        for i, mod in enumerate(todo, 1):
            found = extractor.extract_from_module(
                {"code": mod.code, "name": mod.name, "level": mod.level, "type": mod.type,
                 "description": mod.description})
            skills = dedupe(found["extracted_skills"])
            if not skills:
                print(f"\nGroq returned no skills for {mod.code} (usually the daily token limit).")
                print("Stopped. Run again later: modules that have skills are skipped.")
                break
            for name in skills:
                db.add(ModuleSkill(module_id=mod.id, module_code=mod.code, skill_name=name,
                                   extracted_by=MODULE_EXTRACTED_BY))
            mod.skills_reviewed_at = None
            db.commit()     # one module at a time, so a stop never leaves a module half-done
            done += 1
            total += len(skills)
            print(f"[{i}/{len(todo)}] {mod.code} {mod.name}: {'; '.join(skills)}")
            if i < len(todo):
                time.sleep(2)
        print(f"\nSaved: {done} module(s), {total} skill(s). They show as \"To review\" in Admin > Academic structure.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
