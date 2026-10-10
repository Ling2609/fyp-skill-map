"""
Admin > Academic structure (7 Oct, batch 2; layout A = list + details, references.md "Admin Academic structure layout").
The career office keeps the module descriptors and checks the skills extracted from them (IR Objective 1: academic
skill extraction, with a human review step), and keeps the programme's intakes (students pick one at setup).

Programmes (10 Oct): all 17 computing programmes of APU's July 2026 brochure. The admin picks a programme; a module
shared by several programmes is ONE module (one descriptor, one skill list, one review), with its own year and kind
(common / specialised / elective) in each programme (programme_modules). Removing a module takes it out of the
programme picked; the module itself is deleted only when no programme teaches it any more.

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


def _programme(db: Session, programme_id: int | None = None) -> Programme:
    """The programme asked for, or the first one (the SE programme of the original prototype)."""
    prog = (db.get(Programme, programme_id) if programme_id is not None
            else db.query(Programme).order_by(Programme.id).first())
    if not prog:
        raise HTTPException(status_code=404, detail="Programme not found. If there is none yet, run "
                                                    "migrations/migrate_admin_structure.py and migrate_all_programmes.py.")
    return prog


def _link(db: Session, prog: Programme, mod: Module) -> ProgrammeModule:
    link = db.query(ProgrammeModule).filter(ProgrammeModule.programme_id == prog.id,
                                            ProgrammeModule.module_id == mod.id).first()
    if not link:
        raise HTTPException(status_code=404, detail=f"{mod.code} isn't in {prog.code}.")
    return link


def _module(db: Session, module_id: int) -> Module:
    mod = db.get(Module, module_id)
    if not mod:
        raise HTTPException(status_code=404, detail="Module not found.")
    return mod


def _skills(db: Session, mod: Module) -> list[dict]:
    rows = db.query(ModuleSkill).filter(ModuleSkill.module_id == mod.id).order_by(ModuleSkill.id).all()
    return [{"name": r.skill_name, "added_by_admin": r.extracted_by == ADDED_BY_ADMIN} for r in rows]


def _detail(db: Session, mod: Module) -> dict:
    """One module. Year and type differ per programme, so they come per programme in "programmes" (the page shows
    the one picked); "year"/"type" are the module's own, for a module no programme teaches."""
    students = db.query(func.count(func.distinct(UserModule.user_id))).filter(UserModule.module_code == mod.code).scalar()
    links = (db.query(Programme, ProgrammeModule).join(ProgrammeModule, ProgrammeModule.programme_id == Programme.id)
             .filter(ProgrammeModule.module_id == mod.id).order_by(Programme.code).all())
    return {"id": mod.id, "code": mod.code, "name": mod.name, "year": mod.level, "type": TYPES.get(mod.type, mod.type),
            "description": mod.description or "", "skills": _skills(db, mod),
            "reviewed_at": mod.skills_reviewed_at, "students": students,
            "programmes": [{"id": p.id, "code": p.code, "year": pm.year, "type": TYPES.get(pm.kind, pm.kind)}
                           for p, pm in links]}


def _changed(db: Session, mod: Module, unreview: bool = False):
    if unreview:
        mod.skills_reviewed_at = None
    db.commit()
    _gaps_cache["value"] = None     # the dashboard's skill-gap panel is worked out again


@router.get("/academic")
def academic(programme_id: int | None = None, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Every programme (for the picker, with its module and to-review counts), and the picked programme's modules
    (for the list) and intakes."""
    prog = _programme(db, programme_id)
    counts = dict(db.query(ModuleSkill.module_id, func.count(ModuleSkill.id)).group_by(ModuleSkill.module_id).all())
    shared = dict(db.query(ProgrammeModule.module_id, func.count(ProgrammeModule.id))
                  .group_by(ProgrammeModule.module_id).all())
    rows = (db.query(Module, ProgrammeModule).join(ProgrammeModule, ProgrammeModule.module_id == Module.id)
            .filter(ProgrammeModule.programme_id == prog.id).order_by(ProgrammeModule.year, ProgrammeModule.id).all())
    per_prog = (db.query(ProgrammeModule.programme_id, func.count(ProgrammeModule.id),
                         func.count(ProgrammeModule.id).filter(Module.skills_reviewed_at.is_(None)))
                .join(Module, Module.id == ProgrammeModule.module_id).group_by(ProgrammeModule.programme_id).all())
    per_prog = {pid: (n, todo) for pid, n, todo in per_prog}
    programmes = db.query(Programme).order_by(Programme.code).all()
    return {"programme": {"id": prog.id, "code": prog.code, "name": prog.name},
            "programmes": [{"id": p.id, "code": p.code, "name": p.name, "modules": per_prog.get(p.id, (0, 0))[0],
                            "to_review": per_prog.get(p.id, (0, 0))[1]} for p in programmes],
            "modules": [{"id": m.id, "code": m.code, "name": m.name, "year": pm.year,
                         "type": TYPES.get(pm.kind, pm.kind), "shared": shared.get(m.id, 1),
                         "reviewed": m.skills_reviewed_at is not None, "skills": counts.get(m.id, 0)}
                        for m, pm in rows],
            "intakes": _intakes(db, prog)}


class ModuleFields(BaseModel):
    programme_id: int | None = None       # the programme the year and type are for (None = the first programme)
    name: str = Field(max_length=120)
    year: int = Field(ge=1, le=4)
    type: str


class NewModule(ModuleFields):
    code: str = Field(max_length=20)
    description: str = Field(max_length=4000)


def _check_fields(body: ModuleFields) -> str:
    name = " ".join(body.name.split())
    if len(name) < 3:
        raise HTTPException(status_code=400, detail="Please type the module name.")
    if body.type not in TYPES:
        raise HTTPException(status_code=400, detail="Type must be common, specialised or elective.")
    return name


def _extract_into(db: Session, mod: Module) -> bool:
    """Skills from the description (one Groq call); admin-added skills kept. False if the AI gave nothing."""
    from app.nlp.skill_extractor import MODULE_EXTRACTED_BY, SkillExtractor
    found = SkillExtractor().extract_from_module(
        {"code": mod.code, "name": mod.name, "level": mod.level, "type": mod.type, "description": mod.description})
    seen, skills = set(), []
    for s in found["extracted_skills"]:
        s = " ".join(s.split())
        if s and s.lower() not in seen:
            seen.add(s.lower())
            skills.append(s)
    if not skills:
        return False
    kept = {s["name"].lower() for s in _skills(db, mod) if s["added_by_admin"]}
    db.query(ModuleSkill).filter(ModuleSkill.module_id == mod.id,
                                 ModuleSkill.extracted_by != ADDED_BY_ADMIN).delete(synchronize_session=False)
    for name in skills:
        if name.lower() not in kept:
            db.add(ModuleSkill(module_id=mod.id, module_code=mod.code, skill_name=name, extracted_by=MODULE_EXTRACTED_BY))
    return True


AI_DOWN = ("The AI service didn't answer (often its daily limit). The skills were left as they were; "
           "use Find skills again later.")


@router.post("/modules")
def add_module(body: NewModule, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """A new module in the programme: saved, then its skills are found in the description (it starts "To review").
    If the AI doesn't answer, the module is still saved, with no skills, and the reply says so."""
    prog = _programme(db, body.programme_id)
    name = _check_fields(body)
    code = "".join(body.code.split()).upper()
    if len(code) < 3:
        raise HTTPException(status_code=400, detail="Please type the module code, e.g. SE-L2-014.")
    if db.query(Module).filter(func.upper(Module.code) == code).first():
        raise HTTPException(status_code=400, detail=f"A module with code {code} already exists.")
    text = " ".join(body.description.split())
    if len(text) < 20:
        raise HTTPException(status_code=400, detail="Please write at least a sentence: skills are found in this text.")
    mod = Module(code=code, name=name, level=body.year, type=body.type, description=text,
                 institution="Representative APU Computing programmes")
    db.add(mod)
    db.flush()
    db.add(ProgrammeModule(programme_id=prog.id, module_id=mod.id, year=body.year, kind=body.type))
    db.commit()
    found = _extract_into(db, mod)
    _changed(db, mod, unreview=True)
    return {**_detail(db, mod), "warning": None if found else (
        "The module is saved, but the AI service didn't answer (often its daily limit), so it has no skills yet. "
        "Use Find skills again later.")}


@router.put("/modules/{module_id}")
def edit_module(module_id: int, body: ModuleFields, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Name (every programme), and year and type in the programme picked (the code stays: students' grades are
    stored under it)."""
    mod = _module(db, module_id)
    link = _link(db, _programme(db, body.programme_id), mod)
    mod.name = _check_fields(body)
    link.year, link.kind = body.year, body.type
    if db.query(ProgrammeModule).filter(ProgrammeModule.module_id == mod.id).count() == 1:
        mod.level, mod.type = body.year, body.type      # only one programme: the module's own values follow it
    _changed(db, mod)
    return _detail(db, mod)


@router.delete("/modules/{module_id}")
def remove_module(module_id: int, programme_id: int | None = None, db: Session = Depends(get_db),
                  admin: User = Depends(require_admin)):
    """Takes a module out of a programme that no longer teaches it. Refused once a student of that programme has
    entered a grade for it, so no student's profile loses skills they have evidence for. When no programme teaches
    the module any more (and nobody has a grade for it), the module and its skills are deleted too."""
    mod = _module(db, module_id)
    prog = _programme(db, programme_id)
    link = _link(db, prog, mod)
    students = (db.query(func.count(func.distinct(UserModule.user_id))).join(User, User.id == UserModule.user_id)
                .filter(UserModule.module_code == mod.code, User.programme_id == prog.id).scalar())
    if students:
        raise HTTPException(status_code=400, detail=f"{students} student{'s have' if students > 1 else ' has'} entered "
                                                    "a grade for this module, so it can't be removed.")
    db.delete(link)
    db.flush()
    left = db.query(ProgrammeModule).filter(ProgrammeModule.module_id == mod.id).count()
    graded = db.query(UserModule).filter(UserModule.module_code == mod.code).count()
    deleted = not left and not graded
    if deleted:
        db.query(ModuleSkill).filter(ModuleSkill.module_id == mod.id).delete(synchronize_session=False)
        db.delete(mod)
    db.commit()
    _gaps_cache["value"] = None
    return {"removed": mod.code, "deleted": deleted, "still_in": left}


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
    mod = _module(db, module_id)
    if not (mod.description or "").strip():
        raise HTTPException(status_code=400, detail="Add a description first: skills are found in it.")
    if not _extract_into(db, mod):
        raise HTTPException(status_code=503, detail=AI_DOWN)
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
    programme_id: int | None = None
    code: str = Field(max_length=30)
    start_date: date


@router.post("/intakes")
def add_intake(body: NewIntake, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    prog = _programme(db, body.programme_id)
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
