"""
Re-extract module skills from each module's NAME + DESCRIPTION (roadmap A11).

Why: the original extraction sent Groq only the module name, so it guessed skills
from the title and padded towards 12 (e.g. NumPy, Pandas and Web scraping for an
intro Python module whose description teaches none of them). That inflated every
student's skill profile and gave false matches.

What it does:
  1. First real run only: copies module_skills to module_skills_name_only (backup,
     kept for the report's before/after comparison in E1).
  2. For each module in modules.json: asks Groq for 3-10 skills grounded in the
     description, then replaces that module's rows in module_skills.
  3. Resumable: modules already re-extracted are skipped. If Groq returns nothing
     (usually the daily token limit), it stops; rerun later to continue.

Nothing else needs rebuilding: profiles are built live (A1) and new skill names are
embedded on first use (embedding cache).

Usage (from backend/, venv active):
  python scripts/pipeline/reextract_module_skills.py --dry-run --module SE-L1-005   # 1 Groq call, prints old vs new
  python scripts/pipeline/reextract_module_skills.py --dry-run                       # all modules, no DB writes
  python scripts/pipeline/reextract_module_skills.py                                 # real run
"""
import json
import sys
import time

sys.path.append(".")

from sqlalchemy import inspect, text

from app.database import SessionLocal, engine
from app.models.module import Module, ModuleSkill
from app.nlp.skill_extractor import MODULE_EXTRACTED_BY as LABEL, SkillExtractor

BACKUP_TABLE = "module_skills_name_only"


def dedupe(skills: list[str]) -> list[str]:
    seen, out = set(), []
    for s in skills:
        s = s.strip()
        if s and s.lower() not in seen:
            seen.add(s.lower())
            out.append(s)
    return out


def main():
    dry_run = "--dry-run" in sys.argv
    only = sys.argv[sys.argv.index("--module") + 1] if "--module" in sys.argv else None

    with open("data/modules.json", encoding="utf-8") as f:
        catalogue = {m["code"]: m for m in json.load(f)}

    if not dry_run and not inspect(engine).has_table(BACKUP_TABLE):
        with engine.begin() as conn:
            conn.execute(text(f"CREATE TABLE {BACKUP_TABLE} AS TABLE module_skills"))
        print(f"Backed up module_skills → {BACKUP_TABLE}")

    extractor = SkillExtractor()
    db = SessionLocal()
    old_total = new_total = done = skipped = 0
    try:
        modules = db.query(Module).order_by(Module.code).all()
        if only:
            modules = [m for m in modules if m.code == only]
            if not modules:
                print(f"No module {only} in the database")
                return

        for i, mod in enumerate(modules, 1):
            rows = db.query(ModuleSkill).filter(ModuleSkill.module_id == mod.id).all()
            if rows and all(r.extracted_by == LABEL for r in rows) and not dry_run:
                skipped += 1
                continue
            info = catalogue.get(mod.code)
            if not info or not info.get("description"):
                print(f"[{i}/{len(modules)}] {mod.code} {mod.name}: no description in modules.json, kept as is")
                continue

            skills = dedupe(extractor.extract_from_module(info)["extracted_skills"])
            if not skills:
                print(f"\nGroq returned no skills for {mod.code} (usually the daily token limit).")
                print("Stopped. Rerun later: finished modules are skipped.")
                break

            old = [r.skill_name for r in rows]
            print(f"\n[{i}/{len(modules)}] {mod.code} {mod.name}: {len(old)} → {len(skills)}")
            print(f"   description: {info['description']}")
            print(f"   old: {'; '.join(old)}")
            print(f"   new: {'; '.join(skills)}")
            old_total += len(old)
            new_total += len(skills)

            if not dry_run:
                db.query(ModuleSkill).filter(ModuleSkill.module_id == mod.id).delete()
                for name in skills:
                    db.add(ModuleSkill(module_id=mod.id, module_code=mod.code,
                                       skill_name=name, extracted_by=LABEL))
                db.commit()   # one module at a time, so a stop never leaves a module half-done
            done += 1
            if i < len(modules):
                time.sleep(2)

        print(f"\n{'DRY RUN (nothing saved)' if dry_run else 'Saved'}: {done} modules, "
              f"{old_total} → {new_total} skills" + (f"; {skipped} already done, skipped" if skipped else ""))
    finally:
        db.close()


if __name__ == "__main__":
    main()
