"""
Admin > Academic structure (7 Oct, batch 2; layout A = list + details, references.md "Admin Academic structure layout").
The career office keeps the module descriptors and checks the skills extracted from them (IR Objective 1: academic
skill extraction, with a human review step), and keeps the programme's intakes (students pick one at setup).

Programmes (10 Oct): all 17 computing programmes of APU's July 2026 brochure. The admin picks a programme; a module
shared by several programmes is ONE module (one descriptor, one skill list, one review), with its own year and kind
(common / specialised / elective) in each programme (programme_modules). Removing a module takes it out of the
programme picked; the module itself is deleted only when no programme teaches it any more.

Intakes (10 Oct, her design; references.md "Module lists per intake"): every intake has its own module list. The page
shows the list of the intake picked (the latest by default); a new intake copies the latest intake's list, then only
what is new is changed; changing one intake never changes another, so a student's list can't change after they start.
Membership, year and type belong to the intake; description, skills and review belong to the module (one per module).

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
from app.models.programme import Intake, IntakeModule, Programme, ProgrammeModule
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


# ── Module lists per intake (10 Oct; references.md "Module lists per intake") ───────────────────────────────────────
# The list being looked at is either an intake's own list (intake_modules) or, for a programme with no intakes yet,
# the programme's starting list (programme_modules). A new intake copies the latest intake's list ("rollover").

def _intake_order(q):
    return q.order_by(Intake.start_date.desc().nulls_last(), Intake.id.desc())


def _latest_intake(db: Session, prog: Programme) -> Intake | None:
    return _intake_order(db.query(Intake).filter(Intake.programme_id == prog.id)).first()


def _scope(db: Session, programme_id: int | None, intake_id: int | None) -> tuple[Programme, Intake | None]:
    """The programme and the intake whose list is meant: the intake asked for, else the programme's latest intake,
    else None (the programme's starting list)."""
    if intake_id is not None:
        intake = db.get(Intake, intake_id)
        if not intake:
            raise HTTPException(status_code=404, detail="Intake not found.")
        return db.get(Programme, intake.programme_id), intake
    prog = _programme(db, programme_id)
    return prog, _latest_intake(db, prog)


def _list_query(db: Session, prog: Programme, intake: Intake | None):
    if intake is not None:
        return db.query(IntakeModule).filter(IntakeModule.intake_id == intake.id)
    return db.query(ProgrammeModule).filter(ProgrammeModule.programme_id == prog.id)


def _list_rows(db: Session, prog: Programme, intake: Intake | None) -> list:
    model = IntakeModule if intake is not None else ProgrammeModule
    return _list_query(db, prog, intake).order_by(model.year, model.id).all()


def _link(db: Session, prog: Programme, intake: Intake | None, mod: Module):
    model = IntakeModule if intake is not None else ProgrammeModule
    link = _list_query(db, prog, intake).filter(model.module_id == mod.id).first()
    if not link:
        raise HTTPException(status_code=404, detail=f"{mod.code} isn't in {intake.code if intake else prog.code}.")
    return link


def _previous(db: Session, intake: Intake) -> Intake | None:
    """The intake before this one in the same programme (by start date)."""
    q = db.query(Intake).filter(Intake.programme_id == intake.programme_id, Intake.id != intake.id)
    if intake.start_date is not None:
        q = q.filter(Intake.start_date < intake.start_date)
    return _intake_order(q).first()


def _base(db: Session, prog: Programme, intake: Intake | None) -> tuple[str | None, dict]:
    """What this intake's list is compared with: the intake before it, else the programme's starting list.
    {module_id: (year, kind)}; no comparison for the starting list itself."""
    if intake is None:
        return None, {}
    prev = _previous(db, intake)
    rows = _list_rows(db, prog, prev) if prev else _list_rows(db, prog, None)
    return (prev.code if prev else None), {r.module_id: (r.year, r.kind) for r in rows}


def _changes(rows: list, base: dict) -> int:
    here = {r.module_id: (r.year, r.kind) for r in rows}
    return (sum(1 for m, v in here.items() if base.get(m) != v)
            + sum(1 for m in base if m not in here))


def _current_list(db: Session, prog: Programme) -> list:
    """The list a programme teaches now: its latest intake's, else its starting list."""
    return _list_rows(db, prog, _latest_intake(db, prog))


def _current_map(db: Session) -> dict[int, list[dict]]:
    """{module_id: the programmes whose current list has it, with its year and type there}"""
    out: dict[int, list[dict]] = {}
    for prog in db.query(Programme).order_by(Programme.code).all():
        for r in _current_list(db, prog):
            out.setdefault(r.module_id, []).append(
                {"id": prog.id, "code": prog.code, "year": r.year, "type": TYPES.get(r.kind, r.kind)})
    return out


def _programmes_of(db: Session, mod: Module) -> list[dict]:
    return _current_map(db).get(mod.id, [])


def _in_any_list(db: Session, mod: Module) -> bool:
    return bool(db.query(ProgrammeModule).filter(ProgrammeModule.module_id == mod.id).first()
                or db.query(IntakeModule).filter(IntakeModule.module_id == mod.id).first())


def _students_with_grade(db: Session, mod: Module, prog: Programme, intake: Intake | None) -> int:
    q = (db.query(func.count(func.distinct(UserModule.user_id))).join(User, User.id == UserModule.user_id)
         .filter(UserModule.module_code == mod.code))
    q = q.filter(User.intake_id == intake.id) if intake is not None else q.filter(User.programme_id == prog.id)
    return q.scalar()


def _module(db: Session, module_id: int) -> Module:
    mod = db.get(Module, module_id)
    if not mod:
        raise HTTPException(status_code=404, detail="Module not found.")
    return mod


def _skills(db: Session, mod: Module) -> list[dict]:
    rows = db.query(ModuleSkill).filter(ModuleSkill.module_id == mod.id).order_by(ModuleSkill.id).all()
    return [{"name": r.skill_name, "added_by_admin": r.extracted_by == ADDED_BY_ADMIN} for r in rows]


def _detail(db: Session, mod: Module) -> dict:
    """One module: its own content (description, skills, review), and the programmes whose current list has it
    ("Shared by N programmes"). Year and type in the list being looked at come with that list (GET /academic)."""
    students = db.query(func.count(func.distinct(UserModule.user_id))).filter(UserModule.module_code == mod.code).scalar()
    return {"id": mod.id, "code": mod.code, "name": mod.name, "year": mod.level, "type": TYPES.get(mod.type, mod.type),
            "description": mod.description or "", "skills": _skills(db, mod),
            "reviewed_at": mod.skills_reviewed_at, "students": students,
            "programmes": _programmes_of(db, mod)}


def _changed(db: Session, mod: Module, unreview: bool = False):
    if unreview:
        mod.skills_reviewed_at = None
    db.commit()
    _gaps_cache["value"] = None     # the dashboard's skill-gap panel is worked out again


@router.get("/academic")
def academic(programme_id: int | None = None, intake_id: int | None = None, db: Session = Depends(get_db),
             admin: User = Depends(require_admin)):
    """Every programme (for the picker, with module and to-review counts of its current list), the programme's
    intakes, and the module list of the intake picked (default: the latest intake), each module marked "new" or
    "changed" against the intake before it, plus the modules that intake dropped ("removed")."""
    prog, intake = _scope(db, programme_id, intake_id)
    counts = dict(db.query(ModuleSkill.module_id, func.count(ModuleSkill.id)).group_by(ModuleSkill.module_id).all())
    reviewed = {m.id: m.skills_reviewed_at is not None for m in db.query(Module).all()}
    mods = {m.id: m for m in db.query(Module).all()}
    rows = _list_rows(db, prog, intake)
    base_code, base = _base(db, prog, intake)

    shared = {mid: len(ps) for mid, ps in _current_map(db).items()}
    programmes = []
    for p in db.query(Programme).order_by(Programme.code).all():
        cur = _current_list(db, p)
        programmes.append({"id": p.id, "code": p.code, "name": p.name, "modules": len(cur),
                           "to_review": sum(1 for r in cur if not reviewed.get(r.module_id))})

    def status(r):
        if not base:
            return None
        if r.module_id not in base:
            return "new"
        return "changed" if base[r.module_id] != (r.year, r.kind) else None

    in_list = {r.module_id for r in rows}
    removed = [{"id": mid, "code": mods[mid].code, "name": mods[mid].name, "year": y, "type": TYPES.get(k, k)}
               for mid, (y, k) in base.items() if mid not in in_list and mid in mods]
    return {"programme": {"id": prog.id, "code": prog.code, "name": prog.name},
            "programmes": programmes,
            "intake": None if intake is None else {
                "id": intake.id, "code": intake.code, "start_date": intake.start_date,
                "latest": intake.id == _latest_intake(db, prog).id, "compared_with": base_code},
            "modules": [{"id": r.module_id, "code": mods[r.module_id].code, "name": mods[r.module_id].name,
                         "year": r.year, "type": TYPES.get(r.kind, r.kind), "kind": r.kind,
                         "shared": shared.get(r.module_id, 1), "status": status(r),
                         "reviewed": reviewed.get(r.module_id, False), "skills": counts.get(r.module_id, 0)}
                        for r in rows],
            "removed": sorted(removed, key=lambda m: (m["year"], m["name"])),
            "intakes": _intakes(db, prog)}


class ModuleFields(BaseModel):
    programme_id: int | None = None       # the list the year and type are for: the intake's, else the programme's
    intake_id: int | None = None
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
    """A new module in the list being looked at (the intake's, else the programme's): saved, then its skills are
    found in the description (it starts "To review"). If the AI doesn't answer, the module is still saved, with no
    skills, and the reply says so."""
    prog, intake = _scope(db, body.programme_id, body.intake_id)
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
    if intake is not None:
        db.add(IntakeModule(intake_id=intake.id, module_id=mod.id, year=body.year, kind=body.type))
    else:
        db.add(ProgrammeModule(programme_id=prog.id, module_id=mod.id, year=body.year, kind=body.type))
    db.commit()
    found = _extract_into(db, mod)
    _changed(db, mod, unreview=True)
    return {**_detail(db, mod), "warning": None if found else (
        "The module is saved, but the AI service didn't answer (often its daily limit), so it has no skills yet. "
        "Use Find skills again later.")}


@router.put("/modules/{module_id}")
def edit_module(module_id: int, body: ModuleFields, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Name (everywhere), and year and type in the list being looked at only (the code stays: students' grades are
    stored under it)."""
    mod = _module(db, module_id)
    prog, intake = _scope(db, body.programme_id, body.intake_id)
    link = _link(db, prog, intake, mod)
    mod.name = _check_fields(body)
    link.year, link.kind = body.year, body.type
    _changed(db, mod)
    return _detail(db, mod)


@router.delete("/modules/{module_id}")
def remove_module(module_id: int, programme_id: int | None = None, intake_id: int | None = None,
                  db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Takes a module out of the list being looked at (one intake's, or a programme's starting list). Refused once a
    student of that intake has entered a grade for it, so no student's profile loses skills they have evidence for.
    Other intakes keep it. When no list has the module any more (and nobody has a grade for it), the module and its
    skills are deleted too."""
    mod = _module(db, module_id)
    prog, intake = _scope(db, programme_id, intake_id)
    link = _link(db, prog, intake, mod)
    students = _students_with_grade(db, mod, prog, intake)
    if students:
        raise HTTPException(status_code=400, detail=f"{students} student{'s have' if students > 1 else ' has'} entered "
                                                    "a grade for this module, so it can't be removed.")
    db.delete(link)
    db.flush()
    graded = db.query(UserModule).filter(UserModule.module_code == mod.code).count()
    deleted = not _in_any_list(db, mod) and not graded
    if deleted:
        db.query(ModuleSkill).filter(ModuleSkill.module_id == mod.id).delete(synchronize_session=False)
        db.delete(mod)
    db.commit()
    _gaps_cache["value"] = None
    return {"removed": mod.code, "deleted": deleted}


class ListAdd(BaseModel):
    programme_id: int | None = None
    intake_id: int | None = None
    module_id: int
    year: int = Field(ge=1, le=4)
    type: str


@router.post("/list/modules")
def add_to_list(body: ListAdd, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Adds a module that already exists (from the catalogue, or "Put back" one the intake before had) to the list
    being looked at. It keeps its description, skills and review."""
    mod = _module(db, body.module_id)
    if body.type not in TYPES:
        raise HTTPException(status_code=400, detail="Type must be common, specialised or elective.")
    prog, intake = _scope(db, body.programme_id, body.intake_id)
    model = IntakeModule if intake is not None else ProgrammeModule
    if _list_query(db, prog, intake).filter(model.module_id == mod.id).first():
        raise HTTPException(status_code=400, detail=f"{mod.name} is already in this list.")
    if intake is not None:
        db.add(IntakeModule(intake_id=intake.id, module_id=mod.id, year=body.year, kind=body.type))
    else:
        db.add(ProgrammeModule(programme_id=prog.id, module_id=mod.id, year=body.year, kind=body.type))
    db.commit()
    _gaps_cache["value"] = None
    return {"added": mod.code}


@router.get("/catalogue")
def catalogue(q: str = "", programme_id: int | None = None, intake_id: int | None = None,
              db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Modules matching a search (name or code), for "Add a module": each with its skill count, review state, how
    many programmes teach it, and whether the list being looked at has it already. Up to 30."""
    prog, intake = _scope(db, programme_id, intake_id)
    words = " ".join(q.split()).lower()
    if len(words) < 2:
        return []
    model = IntakeModule if intake is not None else ProgrammeModule
    here = {mid for (mid,) in _list_query(db, prog, intake).with_entities(model.module_id)}
    counts = dict(db.query(ModuleSkill.module_id, func.count(ModuleSkill.id)).group_by(ModuleSkill.module_id).all())
    current = _current_map(db)
    found = (db.query(Module).filter(func.lower(Module.name).contains(words) | func.lower(Module.code).contains(words))
             .order_by(Module.name).limit(30).all())
    return [{"id": m.id, "code": m.code, "name": m.name, "year": m.level, "type": m.type,
             "skills": counts.get(m.id, 0), "reviewed": m.skills_reviewed_at is not None,
             "programmes": len(current.get(m.id, [])), "in_list": m.id in here} for m in found]


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
    """The programme's intakes, newest first, each with its module count and how many changes it has against the
    intake before it."""
    used = dict(db.query(User.intake_id, func.count(User.id)).filter(User.intake_id.isnot(None))
                .group_by(User.intake_id).all())
    rows = _intake_order(db.query(Intake).filter(Intake.programme_id == prog.id)).all()
    out = []
    for i in rows:
        lst = _list_rows(db, prog, i)
        base_code, base = _base(db, prog, i)
        out.append({"id": i.id, "code": i.code, "start_date": i.start_date, "other_codes": i.other_codes or "",
                    "students": used.get(i.id, 0), "modules": len(lst), "changes": _changes(lst, base),
                    "compared_with": base_code, "latest": bool(rows) and i.id == rows[0].id})
    return out


def _clean_code(raw: str) -> str:
    return "".join(raw.split()).upper()


class NewIntake(BaseModel):
    programme_id: int | None = None
    code: str = Field(max_length=30)
    start_date: date
    other_codes: str = Field(default="", max_length=200)
    copy_from: int | None = None          # an intake of the same programme; None = the latest (else the starting list)


@router.post("/intakes")
def add_intake(body: NewIntake, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """A new intake whose module list starts as a copy of another intake's (by default the latest: a "rollover"),
    or of the programme's starting list when there is no intake yet. Edit it afterwards; other intakes are not
    affected."""
    prog = _programme(db, body.programme_id)
    code = _clean_code(body.code)
    if len(code) < 3:
        raise HTTPException(status_code=400, detail="Please type the intake code, e.g. APU1F2609CS(DA).")
    if db.query(Intake).filter(func.upper(Intake.code) == code).first():
        raise HTTPException(status_code=400, detail=f"Intake {code} already exists.")
    source = None
    if body.copy_from is not None:
        source = db.get(Intake, body.copy_from)
        if not source or source.programme_id != prog.id:
            raise HTTPException(status_code=400, detail="Copy the list from an intake of the same programme.")
    else:
        source = _latest_intake(db, prog)
    others = ", ".join(c for c in (_clean_code(x) for x in body.other_codes.split(",")) if c)
    intake = Intake(programme_id=prog.id, code=code, start_date=body.start_date, other_codes=others or None)
    db.add(intake)
    db.flush()
    for r in _list_rows(db, prog, source):
        db.add(IntakeModule(intake_id=intake.id, module_id=r.module_id, year=r.year, kind=r.kind))
    db.commit()
    return {"intakes": _intakes(db, prog), "added": intake.id}


class IntakeCodes(BaseModel):
    other_codes: str = Field(default="", max_length=200)


@router.put("/intakes/{intake_id}")
def edit_intake_codes(intake_id: int, body: IntakeCodes, db: Session = Depends(get_db),
                      admin: User = Depends(require_admin)):
    """The group's later yearly codes (APU2F…, APU3F…), so students can find the intake by today's code."""
    intake = db.get(Intake, intake_id)
    if not intake:
        raise HTTPException(status_code=404, detail="Intake not found.")
    intake.other_codes = ", ".join(c for c in (_clean_code(x) for x in body.other_codes.split(",")) if c) or None
    db.commit()
    return _intakes(db, db.get(Programme, intake.programme_id))


@router.delete("/intakes/{intake_id}")
def delete_intake(intake_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Only an intake no student has picked can be deleted (a typo); otherwise their profile would lose it. Its
    module list goes with it."""
    intake = db.get(Intake, intake_id)
    if not intake:
        raise HTTPException(status_code=404, detail="Intake not found.")
    if db.query(User).filter(User.intake_id == intake.id).count():
        raise HTTPException(status_code=400, detail="Students have picked this intake, so it can't be deleted.")
    prog = db.get(Programme, intake.programme_id)
    db.query(IntakeModule).filter(IntakeModule.intake_id == intake.id).delete(synchronize_session=False)
    db.delete(intake)
    db.commit()
    return _intakes(db, prog)
