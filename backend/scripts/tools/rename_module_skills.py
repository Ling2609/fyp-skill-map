"""
Rename a few module skills the AI worded oddly (10 Oct review of the investigations modules).
A renamed skill is stored as added by an admin, the same as removing it in Admin > Academics and typing the new name,
so a later "Find skills again" keeps it. Running it twice changes nothing.

Usage (from backend/, venv active):
  python scripts/tools/rename_module_skills.py --dry-run
  python scripts/tools/rename_module_skills.py
"""
import sys

sys.path.append(".")

from sqlalchemy import func

from app.database import SessionLocal
from app.models.module import ModuleSkill

ADDED_BY_ADMIN = "admin"

# (module code, old name, new name): old name matched without regard to case
RENAMES = [
    ("CY-L3-003", "Permission rule setting", "Security testing authorisation"),
    ("CY-L3-003", "Scope definition", "Project scoping"),
    ("GD-L3-001", "Scope definition", "Project scoping"),
    ("IT-L3-024", "Investigation reporting", "Technical report writing"),
]


def main():
    dry_run = "--dry-run" in sys.argv
    db = SessionLocal()
    try:
        for code, old, new in RENAMES:
            row = (db.query(ModuleSkill).filter(ModuleSkill.module_code == code,
                                                func.lower(ModuleSkill.skill_name) == old.lower()).first())
            if not row:
                print(f"{code}: \"{old}\" not found (already renamed or removed), skipped")
                continue
            twin = (db.query(ModuleSkill).filter(ModuleSkill.module_code == code,
                                                 func.lower(ModuleSkill.skill_name) == new.lower()).first())
            print(f"{code}: \"{old}\" -> \"{new}\"" + (" (already listed: old one removed)" if twin else ""))
            if dry_run:
                continue
            if twin:
                db.delete(row)
            else:
                row.skill_name, row.extracted_by = new, ADDED_BY_ADMIN
        if not dry_run:
            db.commit()
        print("Dry run: nothing saved." if dry_run else "Saved.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
