"""
Run once for the Admin + Employer flows (7 Oct). Running it again changes nothing, and keeps the career office's
changes to the SE module list (14 Oct fix).
  - new tables: programmes, intakes, programme_modules
  - modules: description (filled from data/modules.json where empty), skills_reviewed_at
  - users: programme_id, intake_id (students), company_name, employer_status (employers)
  - jobs: posted_by_user_id (employer posts), hidden_by_admin_at
  - the one programme of the prototype (representative APU BSc Software Engineering) with its modules by year
  - employers who signed up before approvals existed are marked approved, so nobody is locked out
Usage (from backend/): python migrations/migrate_admin_structure.py
"""
import json
import sys

sys.path.append(".")

from sqlalchemy import text

from app.database import Base, engine
from app.models import job, module, user  # noqa: F401  (tables the new foreign keys point to)
from app.models.programme import Intake, Programme, ProgrammeModule

PROGRAMME_CODE = "SE"
PROGRAMME_NAME = "BSc (Hons) Software Engineering"

Base.metadata.create_all(bind=engine, tables=[Programme.__table__, Intake.__table__, ProgrammeModule.__table__])

STATEMENTS = [
    "ALTER TABLE modules ADD COLUMN IF NOT EXISTS description TEXT",
    "ALTER TABLE modules ADD COLUMN IF NOT EXISTS skills_reviewed_at TIMESTAMPTZ",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS programme_id INTEGER REFERENCES programmes(id) ON DELETE SET NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS intake_id INTEGER REFERENCES intakes(id) ON DELETE SET NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name VARCHAR(120)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS employer_status VARCHAR(10)",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS posted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS hidden_by_admin_at TIMESTAMPTZ",
]

with engine.connect() as conn:
    for sql in STATEMENTS:
        conn.execute(text(sql))

    # Module descriptions: the descriptor text skills were extracted from, so Admin can see and edit it
    with open("data/modules.json", encoding="utf-8") as f:
        catalogue = json.load(f)
    filled = 0
    for m in catalogue:
        if m.get("description"):
            filled += conn.execute(text("UPDATE modules SET description = :d WHERE code = :c AND description IS NULL"),
                                   {"d": m["description"], "c": m["code"]}).rowcount

    # The prototype's one programme, and its modules by year (module level = year of study)
    prog_id = conn.execute(text("SELECT id FROM programmes WHERE code = :c"), {"c": PROGRAMME_CODE}).scalar()
    if prog_id is None:
        prog_id = conn.execute(text("INSERT INTO programmes (code, name) VALUES (:c, :n) RETURNING id"),
                               {"c": PROGRAMME_CODE, "n": PROGRAMME_NAME}).scalar()
    # Only when the programme has no modules yet (14 Oct fix, found by rerunning every migration on a full
    # database): a rerun used to link EVERY module in the database to SE (all 198 once the other programmes were
    # loaded) and put back modules the career office had taken out of the list
    linked = 0
    if not conn.execute(text("SELECT 1 FROM programme_modules WHERE programme_id = :p"), {"p": prog_id}).scalar():
        linked = conn.execute(text(
            "INSERT INTO programme_modules (programme_id, module_id, year) "
            "SELECT :p, m.id, m.level FROM modules m"), {"p": prog_id}).rowcount

    approved = conn.execute(text(
        "UPDATE users SET employer_status = 'approved' WHERE role = 'employer' AND employer_status IS NULL")).rowcount
    conn.commit()

print(f"Migration complete: programme {PROGRAMME_CODE} (id {prog_id}); {linked} module(s) linked to it; "
      f"{filled} module description(s) filled; {approved} existing employer(s) marked approved.")
