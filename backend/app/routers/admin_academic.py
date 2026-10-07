"""
Admin > Academic structure (7 Oct, batch 2; layout A = list + details, references.md "Admin Academic structure layout").
The career office keeps the module descriptors and checks the skills extracted from them (IR Objective 1: academic
skill extraction, with a human review step), and keeps the programme's intakes (students pick one at setup).

Modules
  - the description is the text skills are extracted from; editing it marks the module "to review" again
  - skills: remove one, add one (stored with extracted_by = "admin"), or extract again from the description (Groq,
    the same prompt as scripts/pipeline/reextract_module_skills.py; skills an admin added are kept)
  - "Mark as reviewed" sets skills_reviewed_at; the dashboard's to-do and the sidebar badge count the rest
Student profiles are built live from module_skills, so a change shows in every student's matches straight away.
"""
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.module import Module, ModuleSkill
from app.models.programme import Intake, Programme, ProgrammeModule
from app.models.user import User
from app.models.user_module import UserModule
from app.routers.admin import _gaps_cache, require_admin

router = APIRouter(prefix="/admin", tags=["admin"])

ADDED_BY_ADMIN = "admin"
TYPES = {"common": "Common", "specialised": "Specialised", "elective": "Elective"}


def _programme(db: Session) -> Programme:
    prog = db.query(Programme).order_by(Programme.id).first()
    if not prog:
        raise HTTPException(status_code=404, detail="No programme yet: run migrations/migrate_admin_structure.py.")
    return prog


def _module(db: Session, module_id: int) -> Module:
    mod = db.get(Module, module_id)
    if not mod:
        raise HTTPException(status_code=404, detail="Module not found.")
    return mod


def _skills(db: Session, mod: Module) -> list[dict]:
    rows = db.query(ModuleSkill).filter(ModuleSkill.module_id == mod.id).order_by(ModuleSkill.id).all()
    return [{"name": r.skill_name, "added_by_admin": r.extracted_by == ADDED_BY_ADMIN} for r in rows]


def _detail(db: Session, mod: Module) -> dict:
    students = db.query(func.count(func.distinct(UserModule.user_id))).filter(UserModule.module_code == mod.code).scalar()
    return {"id": mod.id, "code": mod.code, "name": mod.name, "year": mod.level, "type": TYPES.get(mod.type, mod.type),
            "description": mod.description or "", "skills": _skills(db, mod),
            "reviewed_at": mod.skills_reviewed_at, "students": students}


def _changed(db: Session, mod: Module, unreview: bool = False):
    if unreview:
        mod.skills_reviewed_at = None
    db.commit()
    _gaps_cache["value"] = None     # the dashboard's skill-gap panel is worked out again


@router.get("/academic")
def academic(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """The programme, its modules (for the list) and its intakes."""
    prog = _programme(db)
    counts = dict(db.query(ModuleSkill.module_id, func.count(ModuleSkill.id)).group_by(ModuleSkill.module_id).all())
    mods = (db.query(Module).join(ProgrammeModule, ProgrammeModule.module_id == Module.id)
            .filter(ProgrammeModule.programme_id == prog.id).order_by(Module.level, Module.code).all())
    return {"programme": {"id": prog.id, "code": prog.code, "name": prog.name},
            "modules": [{"id": m.id, "code": m.code, "name": m.name, "year": m.level,
                         "reviewed": m.skills_reviewed_at is not None, "skills": counts.get(m.id, 0)} for m in mods],
            "intakes": _intakes(db, prog)}


@router.get("/modules/{module_id}")
def module_detail(module_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return _detail(db, _module(db, module_id))


class Description(BaseModel):
    description: str = Field(max_length=4000)


@router.put("/modules/{module_id}/description")
def save_description(module_id: int, body: Description, db: Session = Depends(get_db),
                     admin: User = Depends(require_admin)):
    """A changed description may teach different skills, so the module goes back to "to review"."""
    mod = _module(db, module_id)
    text = " ".join(body.description.split())
    if len(text) < 20:
        raise HTTPException(status_code=400, detail="Please write at least a sentence: skills are found in this text.")
    if text != (mod.description or ""):
        mod.description = text
        _changed(db, mod, unreview=True)
    return _detail(db, mod)


class SkillName(BaseModel):
    name: str = Field(max_length=80)


def _clean(name: str) -> str:
    name = " ".join(name.split())
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Please type a skill name.")
    return name


@router.post("/modules/{module_id}/skills")
def add_skill(module_id: int, body: SkillName, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    mod = _module(db, module_id)
    name = _clean(body.name)
    if any(s["name"].lower() == name.lower() for s in _skills(db, mod)):
        raise HTTPException(status_code=400, detail=f"{name} is already listed.")
    db.add(ModuleSkill(module_id=mod.id, module_code=mod.code, skill_name=name, extracted_by=ADDED_BY_ADMIN))
    _changed(db, mod)
    return _detail(db, mod)


@router.post("/modules/{module_id}/skills/remove")
def remove_skill(module_id: int, body: SkillName, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    mod = _module(db, module_id)
    removed = (db.query(ModuleSkill).filter(ModuleSkill.module_id == mod.id,
                                            func.lower(ModuleSkill.skill_name) == body.name.strip().lower())
               .delete(synchronize_session=False))
    if not removed:
        raise HTTPException(status_code=404, detail="That skill isn't listed for this module.")
    _changed(db, mod)
    return _detail(db, mod)


@router.post("/modules/{module_id}/extract")
def extract_again(module_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Find the skills again from the saved description (one Groq call). Skills an admin added are kept; the module
    goes back to "to review"."""
    from app.nlp.skill_extractor import MODULE_EXTRACTED_BY, SkillExtractor
    mod = _module(db, module_id)
    if not (mod.description or "").strip():
        raise HTTPException(status_code=400, detail="Add a description first: skills are found in it.")
    found = SkillExtractor().extract_from_module(
        {"code": mod.code, "name": mod.name, "level": mod.level, "type": mod.type, "description": mod.description})
    seen, skills = set(), []
    for s in found["extracted_skills"]:
        s = " ".join(s.split())
        if s and s.lower() not in seen:
            seen.add(s.lower())
            skills.append(s)
    if not skills:
        raise HTTPException(status_code=503, detail="The AI service didn't answer (often its daily limit). "
                                                    "The skills were left as they were; try again later.")
    kept = {s["name"].lower() for s in _skills(db, mod) if s["added_by_admin"]}
    db.query(ModuleSkill).filter(ModuleSkill.module_id == mod.id,
                                 ModuleSkill.extracted_by != ADDED_BY_ADMIN).delete(synchronize_session=False)
    for name in skills:
        if name.lower() not in kept:
            db.add(ModuleSkill(module_id=mod.id, module_code=mod.code, skill_name=name, extracted_by=MODULE_EXTRACTED_BY))
    _changed(db, mod, unreview=True)
    return _detail(db, mod)


class Reviewed(BaseModel):
    reviewed: bool = True


@router.post("/modules/{module_id}/review")
def set_reviewed(module_id: int, body: Reviewed, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    mod = _module(db, module_id)
    if body.reviewed and not _skills(db, mod):
        raise HTTPException(status_code=400, detail="This module has no skills yet: add some or find them again first.")
    mod.skills_reviewed_at = datetime.now(timezone.utc) if body.reviewed else None
    db.commit()
    return _detail(db, mod)


# ── Intakes ────────────────────────────────────────────────────────────────────────────────────────────────────────

def _intakes(db: Session, prog: Programme) -> list[dict]:
    used = dict(db.query(User.intake_id, func.count(User.id)).filter(User.intake_id.isnot(None))
                .group_by(User.intake_id).all())
    rows = db.query(Intake).filter(Intake.programme_id == prog.id).order_by(Intake.start_date.desc().nulls_last(),
                                                                              Intake.code).all()
    return [{"id": i.id, "code": i.code, "start_date": i.start_date, "students": used.get(i.id, 0)} for i in rows]


class NewIntake(BaseModel):
    code: str = Field(max_length=30)
    start_date: date


@router.post("/intakes")
def add_intake(body: NewIntake, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    prog = _programme(db)
    code = "".join(body.code.split()).upper()
    if len(code) < 3:
        raise HTTPException(status_code=400, detail="Please type the intake code, e.g. APD3F2409SE.")
    if db.query(Intake).filter(func.upper(Intake.code) == code).first():
        raise HTTPException(status_code=400, detail=f"Intake {code} already exists.")
    db.add(Intake(programme_id=prog.id, code=code, start_date=body.start_date))
    db.commit()
    return _intakes(db, prog)


@router.delete("/intakes/{intake_id}")
def delete_intake(intake_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Only an intake no student has picked can be deleted (a typo); otherwise their profile would lose it."""
    intake = db.get(Intake, intake_id)
    if not intake:
        raise HTTPException(status_code=404, detail="Intake not found.")
    if db.query(User).filter(User.intake_id == intake.id).count():
        raise HTTPException(status_code=400, detail="Students have picked this intake, so it can't be deleted.")
    prog = db.get(Programme, intake.programme_id)
    db.delete(intake)
    db.commit()
    return _intakes(db, prog)
