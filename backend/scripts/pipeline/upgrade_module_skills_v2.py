"""
Module skills with prompt v2 (15 Oct). Prompt v2 passed its test on 30 new modules (F1 0.581 -> 0.746, paired 95% CI
of the gain +0.048 to +0.283; docs/evidence/module_prompt_v2/scores.txt), so the app now extracts with v2. This
brings the modules that already have skills up to v2 WITHOUT undoing the career office's work:

  - modules NOT reviewed yet: the AI's skills are replaced by v2's; skills the career office added are kept. They
    stay "To review" in Admin > Academic structure
  - modules ALREADY reviewed: nothing is changed. The skills v2 finds that the module doesn't have yet are listed in
    data/module_v2_suggestions.csv with the description sentence that names each one. The career office types yes
    in the "add" column for the right ones, and --apply adds those (review decisions stay human; 15 Oct: 159 of her
    198 modules are reviewed, too many to add one by one in Admin)
  - modules already on v2: skipped, so the script can be run again after a stop (Groq's daily limit)

Usage (from backend/, venv active):
  python scripts/pipeline/upgrade_module_skills_v2.py --dry-run    # counts only, no Groq calls, no changes
  python scripts/pipeline/upgrade_module_skills_v2.py              # one Groq call per module still on v1
  python scripts/pipeline/upgrade_module_skills_v2.py --apply      # adds the suggestions marked yes (no Groq calls)
"""
import csv
import json
import os
import sys
import time

sys.path.append(".")

from app.database import SessionLocal
from app.models.module import Module, ModuleSkill
from app.nlp.skill_extractor import MODULE_EXTRACTED_BY, SkillExtractor
from app.services.extraction_records import record
from app.services.skill_names import canonical_key

sys.path.append("scripts/evaluation")
from evaluate_job_skill_extraction import where_in_ad      # noqa: E402  (the sentence naming a skill; plain search)

ADDED_BY_ADMIN = "admin"                                   # app/routers/admin_academic.py
SUGGESTIONS_CSV = "data/module_v2_suggestions.csv"
SUGGESTIONS_DONE = "data/module_v2_suggestions.json"       # reviewed modules already asked (resume)


def dedupe(skills) -> list[str]:
    seen, out = set(), []
    for s in skills:
        s = " ".join(str(s).split())
        if s and s.lower() not in seen:
            seen.add(s.lower())
            out.append(s)
    return out


def plan(db) -> dict[str, list]:
    """Which modules get replaced, which get suggestions, which are done."""
    done_reviewed = set(json.load(open(SUGGESTIONS_DONE, encoding="utf-8"))) if os.path.exists(SUGGESTIONS_DONE) else set()
    out = {"replace": [], "suggest": [], "done": []}
    for m in db.query(Module).order_by(Module.code):
        if not (m.description or "").strip():
            continue
        ai = [s for s in db.query(ModuleSkill).filter(ModuleSkill.module_id == m.id) if s.extracted_by != ADDED_BY_ADMIN]
        if m.skills_reviewed_at:
            out["done" if m.code in done_reviewed else "suggest"].append(m)
        elif ai and all(s.extracted_by == MODULE_EXTRACTED_BY for s in ai):
            out["done"].append(m)
        else:
            out["replace"].append(m)
    return out


def apply():
    """Add the suggestions marked yes to their (reviewed) modules. Safe to run again: a skill already there is skipped."""
    if not os.path.exists(SUGGESTIONS_CSV):
        sys.exit(f"No {SUGGESTIONS_CSV} yet: run the script without --apply first.")
    with open(SUGGESTIONS_CSV, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if "add" not in (reader.fieldnames or []):
            # 15 Oct: a file started by an older version of this script has a 4-column header over 7-column rows
            sys.exit(f"{SUGGESTIONS_CSV} has no 'add' column in its first line. Its header is: {reader.fieldnames}")
        rows = [r for r in reader if (r.get("add") or "").strip().lower() in ("yes", "y")]
    db = SessionLocal()
    added = 0
    try:
        for r in rows:
            m = db.query(Module).filter(Module.code == r["code"]).first()
            name = " ".join(r["suggested skill (prompt v2)"].split())
            if not m or not name:
                continue
            have = {canonical_key(s.skill_name) for s in db.query(ModuleSkill).filter(ModuleSkill.module_id == m.id)}
            if canonical_key(name) in have:
                continue
            db.add(ModuleSkill(module_id=m.id, module_code=m.code, skill_name=name, extracted_by=MODULE_EXTRACTED_BY))
            added += 1
        db.commit()
    finally:
        db.close()
    print(f"{len(rows)} suggestion(s) marked yes; {added} added (the rest were already there). The modules stay reviewed.")


def main():
    if "--apply" in sys.argv:
        return apply()
    dry = "--dry-run" in sys.argv
    db = SessionLocal()
    try:
        todo = plan(db)
        print(f"Prompt v2 ({MODULE_EXTRACTED_BY}): {len(todo['replace'])} unreviewed module(s) to update, "
              f"{len(todo['suggest'])} reviewed module(s) to get suggestions for, {len(todo['done'])} done already.")
        if dry:
            return
        ex = SkillExtractor()
        done_reviewed = json.load(open(SUGGESTIONS_DONE, encoding="utf-8")) if os.path.exists(SUGGESTIONS_DONE) else []
        new_file = not os.path.exists(SUGGESTIONS_CSV)
        with open(SUGGESTIONS_CSV, "a", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            if new_file:
                w.writerow(["code", "module", "suggested skill (prompt v2)", "in description", "description sentence",
                            "already has", "add"])
            for i, m in enumerate(todo["replace"] + todo["suggest"], 1):
                found = ex.extract_from_module({"code": m.code, "name": m.name, "level": m.level, "type": m.type,
                                                "description": m.description})
                skills = dedupe(found["extracted_skills"])
                if not skills:
                    print(f"\nGroq returned no skills for {m.code} (usually the daily limit). Stopped; run again later.")
                    break
                rows = db.query(ModuleSkill).filter(ModuleSkill.module_id == m.id).all()
                if m.skills_reviewed_at:                       # reviewed: suggest, never change
                    have = {canonical_key(s.skill_name) for s in rows}
                    new = [s for s in skills if canonical_key(s) not in have]
                    for s in new:
                        found_in, sentence = where_in_ad(s, m.description)
                        w.writerow([m.code, m.name, s, found_in, sentence, "; ".join(r.skill_name for r in rows), ""])
                    f.flush()
                    done_reviewed.append(m.code)
                    with open(SUGGESTIONS_DONE, "w", encoding="utf-8") as d:
                        json.dump(done_reviewed, d)
                    record("module", source=m.code, model=ex.model, prompt_version=MODULE_EXTRACTED_BY,
                           proposed=found["extracted_skills"], kept=skills, outcome="suggested")
                    print(f"[{i}] {m.code} reviewed: {len(new)} suggestion(s)")
                else:                                          # not reviewed: v2 replaces the AI's skills
                    admin = {s.skill_name.lower() for s in rows if s.extracted_by == ADDED_BY_ADMIN}
                    db.query(ModuleSkill).filter(ModuleSkill.module_id == m.id,
                                                 ModuleSkill.extracted_by != ADDED_BY_ADMIN).delete(synchronize_session=False)
                    for s in skills:
                        if s.lower() not in admin:
                            db.add(ModuleSkill(module_id=m.id, module_code=m.code, skill_name=s, extracted_by=MODULE_EXTRACTED_BY))
                    db.commit()                                # one module at a time: a stop never leaves one half-done
                    record("module", source=m.code, model=ex.model, prompt_version=MODULE_EXTRACTED_BY,
                           proposed=found["extracted_skills"], kept=skills, outcome="saved")
                    print(f"[{i}] {m.code} {m.name}: {'; '.join(skills)}")
                time.sleep(2)
        left = plan(db)
        print(f"\nLeft: {len(left['replace'])} to update, {len(left['suggest'])} to suggest for. Suggestions for reviewed "
              f"modules: {SUGGESTIONS_CSV}: type yes in the add column for the right ones, then run with --apply.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
