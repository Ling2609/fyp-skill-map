"""
Run once to load all computing programmes (10 Oct). Running it again changes nothing: a programme that already
has modules is left as the career office keeps it (14 Oct fix).
  - programme_modules.kind: a module's kind (common / specialised / elective) now belongs to the programme, since the
    same module can be common in one programme and specialised or elective in another
  - modules missing from the database are added from data/modules.json (with their descriptions, "To review")
  - the 17 programmes of APU's July 2026 Computing brochure are added from data/programmes.json, with each module's
    year and kind in that programme. Only programmes with no modules yet are filled; nothing is deleted
Skills for the new modules are found afterwards with: python scripts/pipeline/extract_module_skills.py
Usage (from backend/): python migrations/migrate_all_programmes.py
"""
import json
import sys

sys.path.append(".")

from sqlalchemy import text

from app.database import engine

INSTITUTION = "Representative APU Computing programmes"

with open("data/modules.json", encoding="utf-8") as f:
    catalogue = json.load(f)
with open("data/programmes.json", encoding="utf-8") as f:
    programmes = json.load(f)

with engine.connect() as conn:
    conn.execute(text("ALTER TABLE programme_modules ADD COLUMN IF NOT EXISTS kind VARCHAR(12)"))
    # Links made before this migration (the SE programme): their kind was the module's own type
    conn.execute(text("UPDATE programme_modules pm SET kind = m.type FROM modules m "
                      "WHERE pm.module_id = m.id AND pm.kind IS NULL"))
    conn.execute(text("ALTER TABLE programme_modules ALTER COLUMN kind SET DEFAULT 'common'"))
    conn.execute(text("ALTER TABLE programme_modules ALTER COLUMN kind SET NOT NULL"))

    # One catalogue for all programmes now (the label was "Representative SE Programme")
    conn.execute(text("UPDATE modules SET institution = :i WHERE institution IS NULL "
                      "OR institution = 'Representative SE Programme'"), {"i": INSTITUTION})

    # 14 Oct fix (found by rerunning every migration on a full database): a programme's list is filled only when it
    # has no modules yet (first install, or a programme new in data/programmes.json). A rerun used to put back every
    # module and link the career office had removed. Modules are added only when a list being filled needs them.
    def has_modules(prog_id):
        return prog_id is not None and conn.execute(text(
            "SELECT 1 FROM programme_modules WHERE programme_id = :p"), {"p": prog_id}).scalar()
    to_fill = [p for p in programmes if not has_modules(conn.execute(text(
        "SELECT id FROM programmes WHERE code = :c"), {"c": p["code"]}).scalar())]
    needed = {pm["code"] for p in to_fill for pm in p["modules"]}

    added = 0
    for m in catalogue:
        if m["code"] not in needed or conn.execute(text("SELECT 1 FROM modules WHERE code = :c"), {"c": m["code"]}).scalar():
            continue
        conn.execute(text("INSERT INTO modules (code, name, level, type, institution, description) "
                          "VALUES (:c, :n, :l, :t, :i, :d)"),
                     {"c": m["code"], "n": m["name"], "l": m["level"], "t": m["type"], "i": INSTITUTION,
                      "d": m["description"]})
        added += 1

    new_progs = linked = 0
    for p in to_fill:
        prog_id = conn.execute(text("SELECT id FROM programmes WHERE code = :c"), {"c": p["code"]}).scalar()
        if prog_id is None:
            prog_id = conn.execute(text("INSERT INTO programmes (code, name) VALUES (:c, :n) RETURNING id"),
                                   {"c": p["code"], "n": p["name"]}).scalar()
            new_progs += 1
        for pm in p["modules"]:
            mod_id = conn.execute(text("SELECT id FROM modules WHERE code = :c"), {"c": pm["code"]}).scalar()
            linked += conn.execute(text(
                "INSERT INTO programme_modules (programme_id, module_id, year, kind) VALUES (:p, :m, :y, :k) "
                "ON CONFLICT ON CONSTRAINT uq_programme_module DO NOTHING"),
                {"p": prog_id, "m": mod_id, "y": pm["year"], "k": pm["kind"]}).rowcount
    conn.commit()

print(f"Migration complete: {added} module(s) added, {new_progs} programme(s) added, {linked} programme module link(s) "
      "added. Next: python scripts/pipeline/extract_module_skills.py (finds skills for modules that have none).")
