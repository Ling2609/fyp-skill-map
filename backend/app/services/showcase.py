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
from app.models.profile import UserAward, UserCertification, UserExperience, UserProject
from app.models.programme import Intake, Programme
from app.models.user import User
from app.models.user_module import UserModule
from app.services.skill_names import canonical_key
from app.services.skill_profile import build_skill_profile

TOP_SKILLS = 8          # how many skills the "Top skills" card shows
STRONG_MODULES = 12     # how many modules the "Strongest modules" card can list (it shows what fits, then "See all")
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
    from app.routers.experience import evidence_label
    for e in db.query(UserExperience).filter(UserExperience.user_id == user_id):
        for skill in e.mapped_skills or []:
            add(skill, e.kind, evidence_label(e).split(": ", 1)[1])
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


def _github_link(user_id: int, db: Session) -> str | None:
    from app.models.profile import GithubAccount
    first = db.query(GithubAccount).filter(GithubAccount.user_id == user_id).order_by(GithubAccount.id).first()
    return f"https://github.com/{first.login}" if first else None


def _repo_check(project, for_employer: bool):
    if not project.github_url:
        return None
    if for_employer and project.repo_check != "yours":
        return None
    return project.repo_check


def _for_job(skills: list[str], job_keys: set[str] | None, shown: int = 6) -> tuple[list[str], list[str]]:
    """(skills to show, the ones this job asks for). 21 Oct (her idea): with a job, its skills come first."""
    skills = list(skills or [])
    if not job_keys:
        return skills[:shown], []
    relevant = [s for s in skills if canonical_key(s) in job_keys]
    return (relevant + [s for s in skills if s not in relevant])[:shown], relevant


def build_showcase(user: User, db: Session, for_employer: bool = False, job_skills: list[str] | None = None) -> dict:
    """Everything My Profile shows, in one reply. for_employer=True hides grades unless the student allows them.
    job_skills (21 Oct, her idea): an employer looking at an applicant for a job sees the projects and experience
    that use the job's skills first, each with those skills first and listed in "relevant"; the rest keep their
    order (newest first) after them. Nothing is hidden."""
    job_keys = {k for k in (canonical_key(s) for s in job_skills or []) if k} or None
    show_grades = (not for_employer) or user.show_grades_to_employers
    programme = db.get(Programme, user.programme_id) if user.programme_id else None
    intake = db.get(Intake, user.intake_id) if user.intake_id else None

    modules = (db.query(Module.id, Module.name, UserModule.grade)
               .join(UserModule, UserModule.module_code == Module.code)
               .filter(UserModule.user_id == user.id).all())
    # 21 Oct (her review: 4 modules, the first four A's in A-Z order, said nothing): the order is now meaningful.
    # With a job: the modules that teach the job's skills first (those skills listed, ticked on the page); then the
    # better grade; then the module with more skills (more to show). The catalogue can hold two modules with one name
    # (different codes): the best one is kept.
    skills_of: dict[int, list[str]] = {}
    for mid, skill in db.query(ModuleSkill.module_id, ModuleSkill.skill_name).filter(
            ModuleSkill.module_id.in_([m[0] for m in modules] or [0])):
        skills_of.setdefault(mid, []).append(skill)
    ranked = []
    for mid, name, grade in modules:
        skills = skills_of.get(mid, [])
        relevant = [k for k in skills if job_keys and canonical_key(k) in job_keys]
        ranked.append(((-len(relevant), -(grade or 0), -len(skills), name), name, grade, relevant))
    strongest = {}
    for _, name, grade, relevant in sorted(ranked):
        if name not in strongest and len(strongest) < STRONG_MODULES:
            strongest[name] = (grade, relevant)
    top_skills, total = _top_skills(user.id, db, show_grades)

    projects = db.query(UserProject).filter(UserProject.user_id == user.id).order_by(UserProject.id.desc()).all()
    certs = db.query(UserCertification).filter(UserCertification.user_id == user.id).order_by(UserCertification.id.desc()).all()
    from app.routers.experience import CATEGORY_LABELS, _newest_first
    experiences = _newest_first(db.query(UserExperience).filter(UserExperience.user_id == user.id)).all()
    awards = db.query(UserAward).filter(UserAward.user_id == user.id).order_by(UserAward.award_date.desc().nullslast(),
                                                                           UserAward.id.desc()).all()
    def item_order(items):     # most of the job's skills first; Python's sort keeps the newest-first order on ties
        return sorted(items, key=lambda x: -len(x["relevant"])) if job_keys else items

    project_rows = []
    for p in projects:
        shown, relevant = _for_job(p.extracted_skills, job_keys)
        project_rows.append({"name": p.name, "description": p.description, "github_url": p.github_url,
                             "repo_check": _repo_check(p, for_employer), "skills": shown, "relevant": relevant,
                             # 21 Oct: the project's context (all optional)
                             "role": p.role or "", "team_size": p.team_size, "outcome": p.outcome or "",
                             "demo_url": p.demo_url})
    experience_rows = []
    for e in experiences:
        shown, relevant = _for_job(e.mapped_skills, job_keys)
        experience_rows.append({"kind": e.kind, "category": e.category,
                                "category_label": CATEGORY_LABELS.get(e.category, "Other"), "role": e.role,
                                "organisation": e.organisation, "start": e.start_month, "end": e.end_month,
                                "description": e.description or "", "skills": shown, "relevant": relevant})
    # work before activities (as a CV lists them), each newest first, unless a job puts the relevant ones first
    experience_rows.sort(key=lambda x: x["kind"] != "work")
    return {
        "name": f"{user.first_name} {user.last_name}",
        "headline": user.headline or "",
        "about": user.about or "",
        # 14 Oct: GitHub only from a connected (proved) account, never a typed link; LinkedIn and portfolio are typed
        "links": {"linkedin": user.linkedin_url, "portfolio": user.portfolio_url, "github": _github_link(user.id, db)},
        "visible_to_employers": user.is_visible_to_employers,
        "show_grades_to_employers": user.show_grades_to_employers,
        # 14 Oct: the student's own contact details, for her own view only; employers get them from
        # employer._profile_for, and only after shortlisting
        "own_contact": None if for_employer else {"phone": user.phone or "", "city": user.city or "",
                                                  "available_from": user.available_from or ""},
        "programme": programme.name if programme else None,
        "intake": intake.code if intake else None,
        "module_count": len(modules),     # modules with a grade (the profile checklist and the Education card)
        "strongest_modules": [{"name": name, "grade": grade_letter(grade) if show_grades else "", "relevant": relevant}
                              for name, (grade, relevant) in strongest.items()],
        "top_skills": top_skills,
        "total_skills": total,
        # repo_check (14 Oct, Connect GitHub): "yours" / "not_linked" / None, shown next to the repo link.
        # 15 Oct (her decision, references.md): employers get only the positive "yours"; "not linked" can just mean
        # she hasn't connected that account, so it's for her own eyes (as GitHub shows no badge on unsigned commits)
        "projects": item_order(project_rows),
        # 21 Oct (references.md "What employers look for in graduates"): work experience and activities
        "experiences": item_order(experience_rows),
        "languages": user.languages or [],
        # the CGPA she typed from her transcript; employers see it only if she switched it on
        "cgpa": float(user.cgpa) if user.cgpa is not None and (not for_employer or user.show_cgpa) else None,
        "show_cgpa": user.show_cgpa,
        "certifications": [{"name": c.cert_name, "issuer": c.issuer, "credly_url": c.credly_url} for c in certs],
        "awards": [{"title": a.title, "issuer": a.issuer, "date": a.award_date, "description": a.description or ""}
                   for a in awards],
    }
