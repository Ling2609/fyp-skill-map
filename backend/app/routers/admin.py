"""
Admin = the university's career office (7 Oct; roadmap "Admin + Employer: COMPLETE flows"). Batch 1: the
dashboard (layout D: to-do first, then counts and two panels) and user management. Every endpoint is admin-only.

Dashboard panels (references.md, "Admin layout"): only totals, never one student's data.
  - to-do: employers waiting for approval, modules whose extracted skills nobody has reviewed yet
  - most common skill gaps (/admin/skill-gaps, its own call): for each student with a profile, their own "skills to learn next" (the same
    recommend_jobs call the Dashboard uses), counted over students. Cached for a few minutes: it runs the
    matching once per student
  - student profiles: grades entered, a project or certificate added, visible to employers

Admin accounts are made with scripts/tools/create_admin.py (admin can't be chosen at sign-up).
"""
import time
from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, inspect, or_
from sqlalchemy.orm import Session

from app.database import engine, get_db
from app.models.job import Job
from app.models.module import Module
from app.models.profile import UserCertification, UserProject
from app.models.programme import AdminAction
from app.models.user import User, UserRole
from app.models.user_module import UserModule
from app.routers.auth import get_current_user

router = APIRouter(prefix="/admin", tags=["admin"])

GAPS_CACHE_SECONDS = 300
GAPS_TOP = 8
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
    if "admin_actions" not in tables:
        raise RuntimeError("Database not updated: run  python migrations/migrate_admin_actions.py  "
                           "from the backend folder, then start the backend again.")
    if "kind" not in {c["name"] for c in inspect(engine).get_columns("programme_modules")}:     # 10 Oct
        raise RuntimeError("Database not updated: run  python migrations/migrate_all_programmes.py  "
                           "from the backend folder, then start the backend again.")
    if "other_codes" not in {c["name"] for c in inspect(engine).get_columns("intakes")}:       # 10 Oct, intakes
        raise RuntimeError("Database not updated: run  python migrations/migrate_intake_modules.py  "
                           "from the backend folder, then start the backend again.")


def _last_actions(db: Session, user_ids: list[int]) -> dict[int, dict]:
    """The newest admin decision on each of these accounts (what the Users list shows under the status)."""
    if not user_ids:
        return {}
    rows = (db.query(AdminAction, User.first_name, User.last_name)
            .outerjoin(User, User.id == AdminAction.admin_id)
            .filter(AdminAction.target_user_id.in_(user_ids))
            .order_by(AdminAction.target_user_id, AdminAction.created_at.desc(), AdminAction.id.desc()))
    latest = {}
    for a, first, last in rows:
        latest.setdefault(a.target_user_id, {"action": a.action, "reason": a.reason, "at": a.created_at,
                                             "by": f"{first or ''} {last or ''}".strip() or "a former admin"})
    return latest


def _user_row(u: User, last: dict | None = None) -> dict:
    return {"last_action": last, "id": u.id, "username": u.username, "name": f"{u.first_name} {u.last_name}".strip(), "email": u.email,
            "role": u.role.value if hasattr(u.role, "value") else u.role, "is_active": u.is_active,
            "company_name": u.company_name, "employer_status": u.employer_status, "created_at": u.created_at}


def common_skill_gaps(db: Session) -> list[dict]:
    """Skills most often in students' own "skills to learn next", counted over students (top 8 shown), most students first."""
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
    month_ago = datetime.now(timezone.utc) - timedelta(days=30)
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
            "students_new_30d": db.query(User).filter(User.role == UserRole.student, User.is_active.is_(True),
                                                      User.created_at >= month_ago).count(),
            "employers_pending": len(pending),
            "modules": db.query(Module).count(),
            "modules_reviewed": db.query(Module).filter(Module.skills_reviewed_at.isnot(None)).count(),
            "newest_live_job_at": db.query(func.max(Job.created_at)).filter(Job.source == "live").scalar(),
        },
        "profiles": {"students": students, "with_grades": with_grades, "with_project_or_cert": with_extra,
                     "visible_to_employers": db.query(User).filter(User.role == UserRole.student,
                                                                   User.is_active.is_(True),
                                                                   User.is_visible_to_employers.is_(True)).count()},
    }


@router.get("/skill-gaps")
def skill_gaps(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Its own call: it runs the matching for every student, so the dashboard opens first and this panel fills in."""
    return common_skill_gaps(db)


@router.get("/counts")
def counts(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """The sidebar's badges: two small counts, cheap enough to ask on every page."""
    return {"pending_employers": db.query(User).filter(User.role == UserRole.employer,
                                                       User.employer_status == "pending").count(),
            "modules_to_review": db.query(Module).filter(Module.skills_reviewed_at.is_(None)).count()}


def _search(query, q: str):
    """Part of a name, username, email or company."""
    if not q.strip():
        return query
    like = f"%{q.strip().lower()}%"
    return query.filter(or_(func.lower(User.username).like(like), func.lower(User.email).like(like),
                            func.lower(User.first_name + " " + User.last_name).like(like),
                            func.lower(func.coalesce(User.company_name, "")).like(like)))


@router.get("/users/counts")
def user_counts(q: str = "", db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """The numbers on the Users filter buttons (7 Oct), for the current search text."""
    base = _search(db.query(User), q)
    return {"all": base.count(),
            "students": base.filter(User.role == UserRole.student).count(),
            "employers": base.filter(User.role == UserRole.employer).count(),
            "waiting": base.filter(User.role == UserRole.employer, User.employer_status == "pending").count(),
            "deactivated": base.filter(User.is_active.is_(False)).count()}


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
    users = _search(query, q).order_by(User.created_at.desc()).limit(500).all()
    latest = _last_actions(db, [u.id for u in users])
    return [_user_row(u, latest.get(u.id)) for u in users]


@router.get("/users/{user_id}/history")
def user_history(user_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Every admin decision on one account, newest first."""
    if not db.get(User, user_id):
        raise HTTPException(status_code=404, detail="User not found.")
    rows = (db.query(AdminAction, User.first_name, User.last_name).outerjoin(User, User.id == AdminAction.admin_id)
            .filter(AdminAction.target_user_id == user_id)
            .order_by(AdminAction.created_at.desc(), AdminAction.id.desc()))
    return [{"action": a.action, "reason": a.reason, "at": a.created_at,
             "by": f"{f or ''} {l or ''}".strip() or "a former admin"} for a, f, l in rows]


class Reason(BaseModel):
    reason: str = Field(default="", max_length=300)


REASON_NEEDED = "Please give a short reason (it is kept in the account's history)."


def _reason(body: Reason | None, required: bool) -> str | None:
    text = " ".join(((body.reason if body else "") or "").split())
    if required and len(text) < 3:
        raise HTTPException(status_code=400, detail=REASON_NEEDED)
    return text or None


def _record(db: Session, admin: User, user: User, action: str, reason: str | None) -> dict:
    db.add(AdminAction(admin_id=admin.id, target_user_id=user.id, action=action, reason=reason))
    db.commit()
    return _user_row(user, _last_actions(db, [user.id]).get(user.id))


def _target(user_id: int, db: Session, admin: User) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="You can't change your own account here.")
    return user


# Every decision is written to admin_actions (who, when, what, why). A reason is required to deactivate AND to
# reactivate (GitHub's rule), optional to reject (later shown to the employer), not asked to approve.

@router.post("/users/{user_id}/approve")
def approve_employer(user_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return _set_employer_status(user_id, "approved", None, db, admin)


@router.post("/users/{user_id}/reject")
def reject_employer(user_id: int, body: Reason | None = None, db: Session = Depends(get_db),
                    admin: User = Depends(require_admin)):
    return _set_employer_status(user_id, "rejected", _reason(body, required=False), db, admin)


def _set_employer_status(user_id: int, status: str, reason: str | None, db: Session, admin: User) -> dict:
    user = _target(user_id, db, admin)
    if user.role != UserRole.employer:
        raise HTTPException(status_code=400, detail="Only employer accounts are approved or rejected.")
    if user.employer_status == status:
        raise HTTPException(status_code=400, detail=f"This employer is already {status}.")
    user.employer_status = status
    return _record(db, admin, user, "approve" if status == "approved" else "reject", reason)


@router.post("/users/{user_id}/deactivate")
def deactivate_user(user_id: int, body: Reason | None = None, db: Session = Depends(get_db),
                    admin: User = Depends(require_admin)):
    """Signs the user out on their next request and blocks sign-in; nothing is deleted."""
    user = _target(user_id, db, admin)
    if user.role == UserRole.admin:
        raise HTTPException(status_code=400, detail="Admin accounts can't be deactivated here.")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="This account is already deactivated.")
    reason = _reason(body, required=True)
    user.is_active = False
    _gaps_cache["value"] = None
    return _record(db, admin, user, "deactivate", reason)


@router.post("/users/{user_id}/reactivate")
def reactivate_user(user_id: int, body: Reason | None = None, db: Session = Depends(get_db),
                    admin: User = Depends(require_admin)):
    user = _target(user_id, db, admin)
    if user.is_active:
        raise HTTPException(status_code=400, detail="This account is already active.")
    reason = _reason(body, required=True)
    user.is_active = True
    _gaps_cache["value"] = None
    return _record(db, admin, user, "reactivate", reason)
