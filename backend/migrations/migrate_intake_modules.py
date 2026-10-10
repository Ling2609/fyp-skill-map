"""
Run once for module lists per intake (10 Oct). Running it twice changes nothing.
  - new table intake_modules (each intake's own module list) and intakes.other_codes (the group's later yearly codes)
  - every programme without intakes gets demo intakes for March, July and September 2023, 2024 and 2025, coded the
    APU way for Year 1 (APU1F2409CS(DA) = Year 1, full-time, September 2024, CS with a Data Analytics specialism).
    These are SkillMap's demo codes, not APU's real list; the admin can add or delete intakes
  - every intake without a module list gets a copy of its programme's list (programme_modules)
Usage (from backend/): python migrations/migrate_intake_modules.py
"""
import sys
from datetime import date

sys.path.append(".")

from sqlalchemy import text

from app.database import Base, engine
from app.models import module, user  # noqa: F401  (tables the foreign keys point to)
from app.models.programme import IntakeModule

MONTHS = (3, 7, 9)
YEARS = (2023, 2024, 2025)


def suffix(programme_code: str) -> str:
    """SE -> SE, CS-DA -> CS(DA), IT-ISS -> IT(ISS), CS-CY-DF -> CS(CY-DF)"""
    head, _, rest = programme_code.partition("-")
    return f"{head}({rest})" if rest else head


Base.metadata.create_all(bind=engine, tables=[IntakeModule.__table__])

with engine.connect() as conn:
    conn.execute(text("ALTER TABLE intakes ADD COLUMN IF NOT EXISTS other_codes VARCHAR(200)"))

    seeded = 0
    for pid, pcode in conn.execute(text("SELECT id, code FROM programmes ORDER BY id")).all():
        if conn.execute(text("SELECT 1 FROM intakes WHERE programme_id = :p"), {"p": pid}).scalar():
            continue
        for y in YEARS:
            for m in MONTHS:
                code = f"APU1F{y % 100:02d}{m:02d}{suffix(pcode)}"
                if conn.execute(text("SELECT 1 FROM intakes WHERE code = :c"), {"c": code}).scalar():
                    continue
                conn.execute(text("INSERT INTO intakes (programme_id, code, start_date) VALUES (:p, :c, :d)"),
                             {"p": pid, "c": code, "d": date(y, m, 1)})
                seeded += 1

    copied = conn.execute(text(
        "INSERT INTO intake_modules (intake_id, module_id, year, kind) "
        "SELECT i.id, pm.module_id, pm.year, pm.kind FROM intakes i "
        "JOIN programme_modules pm ON pm.programme_id = i.programme_id "
        "WHERE NOT EXISTS (SELECT 1 FROM intake_modules im WHERE im.intake_id = i.id)")).rowcount
    conn.commit()

print(f"Migration complete: {seeded} demo intake(s) added; {copied} intake module row(s) copied from the programme lists.")
