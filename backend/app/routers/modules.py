"""
Module catalogue with extracted skills.
GET /modules/ (10 Oct): a student sees their own programme's modules, with the year and kind (common / specialised /
elective) the module has in that programme; anyone else, or a student before setup, sees the whole catalogue.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.module import Module, ModuleSkill
from app.models.programme import ProgrammeModule
from app.models.user import User
from app.routers.auth import get_current_user

router = APIRouter(prefix="/modules", tags=["modules"])


def _skills_by_module(db: Session) -> dict[int, list[str]]:
    out: dict[int, list[str]] = {}
    for mid, name in db.query(ModuleSkill.module_id, ModuleSkill.skill_name).order_by(ModuleSkill.id):
        out.setdefault(mid, []).append(name)
    return out


def _row(mod: Module, skills: list[str], level: int, kind: str) -> dict:
    return {"id": mod.id, "code": mod.code, "name": mod.name, "level": level, "type": kind,
            "institution": mod.institution, "skills": skills, "skill_count": len(skills)}


@router.get("/")
def get_modules(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Modules with their extracted skills: the student's programme only, once they have picked one."""
    skills = _skills_by_module(db)
    if user.role == "student" and user.programme_id:
        rows = (db.query(Module, ProgrammeModule.year, ProgrammeModule.kind)
                .join(ProgrammeModule, ProgrammeModule.module_id == Module.id)
                .filter(ProgrammeModule.programme_id == user.programme_id)
                .order_by(ProgrammeModule.year, ProgrammeModule.id).all())   # brochure order
        return [_row(m, skills.get(m.id, []), year, kind) for m, year, kind in rows]
    mods = db.query(Module).order_by(Module.level, Module.code).all()
    return [_row(m, skills.get(m.id, []), m.level, m.type) for m in mods]


@router.get("/{code}")
def get_module(code: str, db: Session = Depends(get_db)):
    """Get a single module by code with its skills."""
    mod = db.query(Module).filter(Module.code == code).first()
    if not mod:
        raise HTTPException(status_code=404, detail="Module not found")
    skills = [s.skill_name for s in db.query(ModuleSkill).filter(ModuleSkill.module_id == mod.id).all()]
    return _row(mod, skills, mod.level, mod.type)
