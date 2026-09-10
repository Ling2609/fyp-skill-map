from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.module import Module, ModuleSkill

router = APIRouter(prefix="/modules", tags=["modules"])

@router.get("/")
def get_modules(db: Session = Depends(get_db)):
    """Get all modules with their extracted skills."""
    modules = db.query(Module).order_by(Module.level, Module.code).all()
    result = []
    for mod in modules:
        skills = db.query(ModuleSkill).filter(
            ModuleSkill.module_id == mod.id
        ).all()
        result.append({
            "id": mod.id,
            "code": mod.code,
            "name": mod.name,
            "level": mod.level,
            "type": mod.type,
            "institution": mod.institution,
            "skills": [s.skill_name for s in skills],
            "skill_count": len(skills),
        })
    return result

@router.get("/{code}")
def get_module(code: str, db: Session = Depends(get_db)):
    """Get a single module by code with its skills."""
    mod = db.query(Module).filter(Module.code == code).first()
    if not mod:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Module not found")
    
    skills = db.query(ModuleSkill).filter(
        ModuleSkill.module_id == mod.id
    ).all()
    
    return {
        "id": mod.id,
        "code": mod.code,
        "name": mod.name,
        "level": mod.level,
        "type": mod.type,
        "institution": mod.institution,
        "skills": [s.skill_name for s in skills],
        "skill_count": len(skills),
    }