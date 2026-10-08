"""
The showcase profile (8 Oct, Mr Au: "something like LinkedIn to showcase the student's skills and strong points").

One read-only summary built from what the student has already entered: account name, headline and About, links,
programme and intake, the strongest modules, projects, certifications and awards, and the top skills WITH THEIR
EVIDENCE. Nothing here is typed twice, so it can never disagree with the Skill Profile.

What makes it different from a LinkedIn profile: a LinkedIn skill is self-claimed, while every skill here comes from
the skill profile (app/services/skill_profile.py) and lists where it was found (module + grade, project, certificate,
award). Used by GET /profile/showcase (the student's own page); the Employer flow will call it with for_employer=True,
which hides grades unless the student allows it (Handshake hides GPA the same way; references.md "Showcase profile").
"""
from sqlalchemy.orm import Session

from app.models.module import Module, ModuleSkill
from app.models.profile import UserAward, UserCertification, UserProject
from app.models.programme import Intake, Programme
from app.models.user import User
from app.models.user_module import UserModule
from app.services.skill_names import canonical_key
from app.services.skill_profile import build_skill_profile

TOP_SKILLS = 8          # how many skills the "Top skills" card shows
STRONG_MODULES = 4      # how many modules the "Education" card names
GRADE_LETTERS = {4.0: "A", 3.7: "A-", 3.3: "B+", 3.0: "B", 2.7: "B-", 2.3: "C+", 2.0: "C"}


def grade_letter(grade: float | None) -> str:
    """4.0 -> "A", 3.7 -> "A-" (the same letters the Skill Profile's grade list uses)."""
    return GRADE_LETTERS.get(round(grade, 1), "") if grade is not None else ""


def _evidence_by_skill(user_id: int, db: Session) -> dict[str, list[dict]]:
    """canonical skill -> every place it was found. The skill profile keeps only the strongest source per skill (that
    is what matching needs); the showcase lists them all, because more evidence = a stronger point to show."""
    found: dict[str, list[dict]] = {}

    def add(skill: str, kind: str, label: str, grade: float | None = None):
        key = canonical_key(skill)
        if key and not any(e["label"] == label for e in found.get(key, [])):   # one line per module / project / ...
            found.setdefault(key, []).append({"type": kind, "label": label, "grade": grade})

    rows = (db.query(ModuleSkill.skill_name, Module.name, UserModule.grade)
            .join(Module, Module.id == ModuleSkill.module_id)
            .join(UserModule, UserModule.module_code == Module.code)
            .filter(UserModule.user_id == user_id).all())
    for skill, module_name, grade in rows:
        add(skill, "module", module_name, grade)
    for p in db.query(UserProject).filter(UserProject.user_id == user_id):
        for skill in p.extracted_skills or []:
            add(skill, "project", p.name)
    for c in db.query(UserCertification).filter(UserCertification.user_id == user_id):
        for skill in c.mapped_skills or []:
            add(skill, "cert", c.cert_name)
    for a in db.query(UserAward).filter(UserAward.user_id == user_id):
        for skill in a.mapped_skills or []:
            add(skill, "award", a.title)
    return found


def _top_skills(user_id: int, db: Session, show_grades: bool) -> tuple[list[dict], int]:
    """The skills with the most evidence first; a tie goes to the better module grade. Returns (top skills, total)."""
    profile = build_skill_profile(user_id, db)
    evidence = _evidence_by_skill(user_id, db)

    def strength(key):
        items = evidence.get(key, [])
        best_grade = max((e["grade"] or 0 for e in items if e["type"] == "module"), default=0)
        return (len(items), best_grade)

    top = []
    for key in sorted(profile, key=strength, reverse=True)[:TOP_SKILLS]:
        items = sorted(evidence.get(key, []), key=lambda e: (e["type"] != "module", -(e["grade"] or 0)))  # best module first
        top.append({"name": profile[key].name, "evidence": [
            {"type": e["type"], "label": e["label"],
             "grade": grade_letter(e["grade"]) if show_grades and e["type"] == "module" else ""}
            for e in items]})
    return top, len(profile)


def build_showcase(user: User, db: Session, for_employer: bool = False) -> dict:
    """Everything My Profile shows, in one reply. for_employer=True hides grades unless the student allows them."""
    show_grades = (not for_employer) or user.show_grades_to_employers
    programme = db.get(Programme, user.programme_id) if user.programme_id else None
    intake = db.get(Intake, user.intake_id) if user.intake_id else None

    modules = (db.query(Module.name, UserModule.grade)
               .join(UserModule, UserModule.module_code == Module.code)
               .filter(UserModule.user_id == user.id)
               .order_by(UserModule.grade.desc(), Module.name).all())
    strongest = {}      # module name -> best grade; the catalogue can hold two modules with one name (different codes)
    for name, grade in modules:
        if name not in strongest and len(strongest) < STRONG_MODULES:
            strongest[name] = grade
    top_skills, total = _top_skills(user.id, db, show_grades)

    projects = db.query(UserProject).filter(UserProject.user_id == user.id).order_by(UserProject.id.desc()).all()
    certs = db.query(UserCertification).filter(UserCertification.user_id == user.id).order_by(UserCertification.id.desc()).all()
    awards = db.query(UserAward).filter(UserAward.user_id == user.id).order_by(UserAward.award_date.desc().nullslast(),
                                                                           UserAward.id.desc()).all()
    return {
        "name": f"{user.first_name} {user.last_name}",
        "headline": user.headline or "",
        "about": user.about or "",
        "links": {"linkedin": user.linkedin_url, "portfolio": user.portfolio_url, "github": user.github_url},
        "visible_to_employers": user.is_visible_to_employers,
        "show_grades_to_employers": user.show_grades_to_employers,
        "programme": programme.name if programme else None,
        "intake": intake.code if intake else None,
        "strongest_modules": [{"name": name, "grade": grade_letter(grade) if show_grades else ""}
                              for name, grade in strongest.items()],
        "top_skills": top_skills,
        "total_skills": total,
        "projects": [{"name": p.name, "description": p.description, "github_url": p.github_url,
                      "skills": list(p.extracted_skills or [])[:6]} for p in projects],
        "certifications": [{"name": c.cert_name, "issuer": c.issuer, "credly_url": c.credly_url} for c in certs],
        "awards": [{"title": a.title, "issuer": a.issuer, "date": a.award_date, "description": a.description or ""}
                   for a in awards],
    }
