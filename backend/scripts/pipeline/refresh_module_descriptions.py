"""
Refresh module descriptions from data/modules.json and find their skills again
==============================================================================
For when descriptions in data/modules.json are improved after the modules are already in the database (10 Oct: the
project, investigations and a few introductory modules gave padded skills such as "AI solution design / development /
evaluation" or "team role awareness", so their descriptions were rewritten to name concrete content).

Only the modules listed in REFRESH are touched (or the codes given with --codes), so a description an admin edited on
another module is never overwritten. For each of them whose description in the database differs from modules.json:
  - a module an admin already marked "Reviewed" is SKIPPED (the admin may have edited its text or skills on purpose);
    to refresh one of those, use "Find skills again" in Admin > Academics instead
  - otherwise: the description is replaced, the AI's skills are found again (same prompt and label as Admin "Find
    skills again"), skills an admin added are kept, and the module stays "To review"
If Groq returns nothing (usually its daily limit) it stops; the description of that module is left unchanged, so
running it again later carries on.

Usage (from backend/, venv active):
  python scripts/pipeline/refresh_module_descriptions.py --dry-run   # lists what would change, no Groq calls
  python scripts/pipeline/refresh_module_descriptions.py
  python scripts/pipeline/refresh_module_descriptions.py --codes IT-L3-006,CY-L3-006   # only these
"""
import json
import sys
import time

sys.path.append(".")

from app.database import SessionLocal
from app.models.module import Module, ModuleSkill
from app.nlp.skill_extractor import MODULE_EXTRACTED_BY, SkillExtractor

ADDED_BY_ADMIN = "admin"

# Rewritten on 10 Oct: 15 Investigations modules, 15 project modules, 4 introductory modules
REFRESH = {
    "IT-L3-005", "IT-L3-013", "IT-L3-018", "IT-L3-021", "IT-L3-024", "IT-L3-028", "IT-L3-033", "CS-L3-001",
    "QC-L3-003", "DA-L3-001", "AI-L3-001", "CY-L3-003", "CY-L3-010", "MM-L3-005", "GD-L3-001",
    "IT-L3-006", "IT-L3-014", "IT-L3-019", "IT-L3-022", "IT-L3-025", "IT-L3-029", "IT-L3-034", "CS-L3-003",
    "QC-L3-004", "DA-L3-004", "AI-L3-003", "CY-L3-006", "CY-L3-012", "MM-L3-006", "GD-L3-002",
    "IT-L1-001", "IT-L1-003", "GD-L1-004", "MM-L1-002",
    "SE-L3-003", "MM-L3-007", "MM-L2-009",
}


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
    codes = (set(sys.argv[sys.argv.index("--codes") + 1].upper().split(",")) if "--codes" in sys.argv else REFRESH)
    with open("data/modules.json", encoding="utf-8") as f:
        catalogue = {m["code"]: m for m in json.load(f)}

    db = SessionLocal()
    try:
        changed, skipped, renamed = [], [], []
        for mod in db.query(Module).filter(Module.code.in_(codes)).order_by(Module.code).all():
            name = " ".join((catalogue.get(mod.code, {}).get("name") or "").split())
            if name and name != mod.name:
                renamed.append((mod.code, mod.name, name))
                if not dry_run:
                    mod.name = name
            new = " ".join((catalogue.get(mod.code, {}).get("description") or "").split())
            if not new or new == " ".join((mod.description or "").split()):
                continue
            (skipped if mod.skills_reviewed_at is not None else changed).append((mod, new))

        if renamed and not dry_run:
            db.commit()
        for code, old_name, name in renamed:
            print(f"{'would rename' if dry_run else 'renamed'}: {code} {old_name} -> {name}")
        print(f"{len(changed)} module(s) to refresh" + (f"; {len(skipped)} skipped (already reviewed)" if skipped else ""))
        for mod, _ in skipped:
            print(f"  skipped (reviewed): {mod.code} {mod.name}")
        if dry_run:
            for mod, new in changed:
                old = [s.skill_name for s in db.query(ModuleSkill).filter(ModuleSkill.module_id == mod.id)]
                print(f"\n{mod.code} {mod.name}\n   old skills: {'; '.join(old)}\n   new text:   {new}")
            return

        extractor = SkillExtractor()
        done = 0
        for i, (mod, new) in enumerate(changed, 1):
            found = extractor.extract_from_module(
                {"code": mod.code, "name": mod.name, "level": mod.level, "type": mod.type, "description": new})
            skills = dedupe(found["extracted_skills"])
            if not skills:
                print(f"\nGroq returned no skills for {mod.code} (usually the daily token limit).")
                print("Stopped; this module is unchanged. Run again later to carry on.")
                break
            rows = db.query(ModuleSkill).filter(ModuleSkill.module_id == mod.id).all()
            old = [r.skill_name for r in rows if r.extracted_by != ADDED_BY_ADMIN]
            kept = {r.skill_name.lower() for r in rows if r.extracted_by == ADDED_BY_ADMIN}
            db.query(ModuleSkill).filter(ModuleSkill.module_id == mod.id,
                                         ModuleSkill.extracted_by != ADDED_BY_ADMIN).delete(synchronize_session=False)
            for name in skills:
                if name.lower() not in kept:
                    db.add(ModuleSkill(module_id=mod.id, module_code=mod.code, skill_name=name,
                                       extracted_by=MODULE_EXTRACTED_BY))
            mod.description = new
            mod.skills_reviewed_at = None
            db.commit()     # one module at a time
            done += 1
            print(f"[{i}/{len(changed)}] {mod.code} {mod.name}\n   old: {'; '.join(old)}\n   new: {'; '.join(skills)}")
            if i < len(changed):
                time.sleep(2)
        print(f"\nRefreshed {done} module(s). They show as \"To review\" in Admin > Academics.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
