"""
Admin = the university's career office (7 Oct; roadmap "Admin + Employer: COMPLETE flows"). Batch 1: the
dashboard (layout D: to-do first, then counts and two panels) and user management. Every endpoint is admin-only.

Dashboard panels (references.md, "Admin layout"): only totals, never one student's data.
  - to-do: employers waiting for approval, modules whose extracted skills nobody has reviewed yet
  - most common skill gaps: for each student with a profile, their own "skills to learn next" (the same
    recommend_jobs call the Dashboard uses), counted over students. Cached for a few minutes: it runs the
    matching once per student
  - student profiles: grades entered, a project or certificate added, visible to employers

Admin accounts are made with scripts/tools/create_admin.py (admin can't be chosen at sign-up).
"""
import time
from collections import Counter
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, inspect, or_
from sqlalchemy.orm import Session

from app.database import engine, get_db
from app.models.job import Job
from app.models.module import Module
from app.models.profile import UserCertification, UserProject
from app.models.user import User, UserRole
from app.models.user_module import UserModule
from app.routers.auth import get_current_user

router = APIRouter(prefix="/admin", tags=["admin"])

GAPS_CACHE_SECONDS = 300
GAPS_TOP = 5
_gaps_cache = {"at": 0.0, "value": None}


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admins only.")
    return current_user


def check_admin_schema():
    """Start-up check: the 7 Oct tables and columns must exist (migrations/migrate_admin_structure.py)."""
    tables = set(inspect(engine).get_table_names())
    columns = {c["name"] for c in inspect(engine).get_columns("users")}
    if not {"programmes", "intakes", "programme_modules"} <= tables or "employer_status" not in columns:
        raise RuntimeError("Database not updated: run  python migrations/migrate_admin_structure.py  "
                           "from the backend folder, then start the backend again.")


def _user_row(u: User) -> dict:
    return {"id": u.id, "username": u.username, "name": f"{u.first_name} {u.last_name}".strip(), "email": u.email,
            "role": u.role.value if hasattr(u.role, "value") else u.role, "is_active": u.is_active,
            "company_name": u.company_name, "employer_status": u.employer_status, "created_at": u.created_at}


def common_skill_gaps(db: Session) -> list[dict]:
    """Skills most often in students' own "skills to learn next" (top 5 each), most students first."""
    from app.routers.recommend import RecommendRequest, recommend_jobs
    now = time.time()
    if _gaps_cache["value"] is not None and now - _gaps_cache["at"] < GAPS_CACHE_SECONDS:
        return _gaps_cache["value"]
    counts, names, students = Counter(), {}, 0
    for student in db.query(User).filter(User.role == UserRole.student, User.is_active.is_(True)):
        try:
            result = recommend_jobs(RecommendRequest(top_n=0), db, student)
        except HTTPException:          # empty profile: nothing to count
            continue
        students += 1
        for item in result["skills_to_learn"]:
            key = item["skill"].strip().lower()
            counts[key] += 1
            names.setdefault(key, item["skill"])
    value = [{"skill": names[k], "students": n, "of_students": students} for k, n in counts.most_common(GAPS_TOP)]
    _gaps_cache.update(at=now, value=value)
    return value


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    pending = (db.query(User).filter(User.role == UserRole.employer, User.employer_status == "pending")
               .order_by(User.created_at).all())
    unreviewed = db.query(Module).filter(Module.skills_reviewed_at.is_(None)).order_by(Module.level, Module.code)
    live = db.query(Job).filter(Job.source == "live", Job.gone_at.is_(None), Job.hidden_by_admin_at.is_(None))

    student_ids = db.query(User.id).filter(User.role == UserRole.student, User.is_active.is_(True))
    with_grades = db.query(func.count(func.distinct(UserModule.user_id))).filter(
        UserModule.user_id.in_(student_ids)).scalar()
    with_extra = len({uid for (uid,) in db.query(UserProject.user_id).filter(UserProject.user_id.in_(student_ids))}
                     | {uid for (uid,) in db.query(UserCertification.user_id)
                        .filter(UserCertification.user_id.in_(student_ids))})
    students = student_ids.count()
    return {
        "todo": {
            "pending_employers": [_user_row(u) for u in pending],
            "modules_to_review": unreviewed.count(),
            "modules_to_review_sample": [{"code": m.code, "name": m.name} for m in unreviewed.limit(3)],
        },
        "counts": {
            "students": students,
            "employers": db.query(User).filter(User.role == UserRole.employer,
                                               User.employer_status == "approved").count(),
            "live_jobs": live.count(),
            "modules": db.query(Module).count(),
            "newest_live_job_at": db.query(func.max(Job.created_at)).filter(Job.source == "live").scalar(),
        },
        "profiles": {"students": students, "with_grades": with_grades, "with_project_or_cert": with_extra,
                     "visible_to_employers": db.query(User).filter(User.role == UserRole.student,
                                                                   User.is_active.is_(True),
                                                                   User.is_visible_to_employers.is_(True)).count()},
        "skill_gaps": common_skill_gaps(db),
    }


@router.get("/users")
def list_users(role: str = "", status: str = "", q: str = "", db: Session = Depends(get_db),
               admin: User = Depends(require_admin)):
    """All accounts, newest first. role: student / employer / admin; status: pending / approved / rejected /
    inactive; q: part of a name, username, email or company."""
    query = db.query(User)
    if role:
        if role not in {r.value for r in UserRole}:
            raise HTTPException(status_code=400, detail="Unknown role.")
        query = query.filter(User.role == UserRole(role))
    if status == "inactive":
        query = query.filter(User.is_active.is_(False))
    elif status:
        query = query.filter(User.employer_status == status)
    if q.strip():
        like = f"%{q.strip().lower()}%"
        query = query.filter(or_(func.lower(User.username).like(like), func.lower(User.email).like(like),
                                 func.lower(User.first_name + " " + User.last_name).like(like),
                                 func.lower(func.coalesce(User.company_name, "")).like(like)))
    return [_user_row(u) for u in query.order_by(User.created_at.desc()).limit(500)]


def _target(user_id: int, db: Session, admin: User) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="You can't change your own account here.")
    return user


@router.post("/users/{user_id}/approve")
def approve_employer(user_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return _set_employer_status(user_id, "approved", db, admin)


@router.post("/users/{user_id}/reject")
def reject_employer(user_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return _set_employer_status(user_id, "rejected", db, admin)


def _set_employer_status(user_id: int, status: str, db: Session, admin: User) -> dict:
    user = _target(user_id, db, admin)
    if user.role != UserRole.employer:
        raise HTTPException(status_code=400, detail="Only employer accounts are approved or rejected.")
    user.employer_status = status
    db.commit()
    return _user_row(user)


@router.post("/users/{user_id}/deactivate")
def deactivate_user(user_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Signs the user out on their next request and blocks sign-in; nothing is deleted."""
    user = _target(user_id, db, admin)
    if user.role == UserRole.admin:
        raise HTTPException(status_code=400, detail="Admin accounts can't be deactivated here.")
    user.is_active = False
    db.commit()
    _gaps_cache["value"] = None
    return _user_row(user)


@router.post("/users/{user_id}/reactivate")
def reactivate_user(user_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    user = _target(user_id, db, admin)
    user.is_active = True
    db.commit()
    _gaps_cache["value"] = None
    return _user_row(user)
