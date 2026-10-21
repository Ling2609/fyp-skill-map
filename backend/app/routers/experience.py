"""
Work experience and activities (21 Oct, references.md "What employers look for in graduates").

  - "work": internship, industrial placement, part-time job, freelance work
  - "activity": club or society role, hackathon, competition, volunteering, organising an event

Same flow as an award (8 Oct): the pop-up asks the AI for skills, the student keeps or removes the chips, then saves,
so every saved skill was seen by her. Unlike an award, each suggested skill must come with the student's own words
from the role or description, checked the way project skills are (verify_project_skills: the quote must be in her text
and not a plan). A skill the AI can't point to in her words is dropped, so nothing is claimed for her.

Routes sit under /profile like the other evidence: /profile/experiences, /profile/experiences/suggest.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.profile import EXPERIENCE_CATEGORIES, UserExperience
from app.models.user import User
from app.routers.auth import get_current_user
from app.routers.profile import (MAX_SKILL_CHARS, MAX_SKILLS_PER_ITEM, MIN_DESCRIPTION, MONTH, SkillAdd, SkillRemove,
                                 _ask_json, _clean_skill, _clean_skills, _same, verify_project_skills)
from app.services.skill_names import canonical_key

router = APIRouter(prefix="/profile", tags=["profile"])

MAX_EXPERIENCE_SKILLS = 10
LIMITS = {"Role": 120, "Organisation": 120, "What you did": 1500}
# How the evidence reads on Skill Gap and to employers ("Internship: Software Intern, Grab"); the frontend has the
# same labels for its menus (pages/student/experienceKinds.js)
CATEGORY_LABELS = {"internship": "Internship", "placement": "Industrial placement", "part_time": "Part-time job",
                   "freelance": "Freelance", "club": "Club or society", "hackathon": "Hackathon",
                   "competition": "Competition", "volunteering": "Volunteering", "event": "Event organising",
                   "other": "Other"}


def evidence_label(e: UserExperience) -> str:
    kind = CATEGORY_LABELS.get(e.category, "Other")
    if e.category == "other":
        kind = "Work" if e.kind == "work" else "Activity"
    return f"{kind}: {e.role}, {e.organisation}"


class ExperienceIn(BaseModel):
    kind: str
    category: str
    role: str
    organisation: str
    start_month: str
    end_month: str | None = None        # empty = still doing it
    description: str = ""
    skills: list[str] = []              # the chips the student kept in the pop-up
    added: list[str] = []               # which of them she typed in herself
    allow_duplicate: bool = False


class ExperienceSuggestIn(BaseModel):
    kind: str
    role: str
    organisation: str
    description: str = ""


class ExperienceOut(BaseModel):
    id: int
    kind: str
    category: str
    role: str
    organisation: str
    start_month: str
    end_month: str | None = None
    description: str | None = None
    mapped_skills: list[str]
    added_skills: list[str] | None = None

    class Config:
        from_attributes = True


def experience_prompt(kind: str, role: str, organisation: str, description: str) -> str:
    what = "work experience" if kind == "work" else "student activity"
    return f"""Read this {what} and list the skills the student USED in it.

Role: {role}
Organisation: {organisation}
What they did: {description}

Rules:
- Only skills the role or the text shows were used. Skip plans and wishes ("will learn", "plan to").
- Technical skills (languages, frameworks, tools, platforms, methods) and soft skills (such as leadership, teamwork,
  public speaking, event planning) both count, but only when the text shows them being used.
- Give each skill its usual name, 1-4 words.
- For each skill, "quote" = the words from the role or the text that show it, copied exactly, 2 to 12 words.
- At most {MAX_EXPERIENCE_SKILLS} skills. If there are none, return [].

Return ONLY a JSON array of objects with the keys "skill" and "quote"."""


def _check(data: ExperienceIn | ExperienceSuggestIn):
    if data.kind not in EXPERIENCE_CATEGORIES:
        raise HTTPException(status_code=400, detail="Choose work experience or an activity")
    if not data.role.strip() or not data.organisation.strip():
        raise HTTPException(status_code=400, detail="Role and organisation are required")
    for label, value in (("Role", data.role), ("Organisation", data.organisation), ("What you did", data.description)):
        if value and len(value.strip()) > LIMITS[label]:
            raise HTTPException(status_code=400, detail=f"{label} can be up to {LIMITS[label]} characters")


def _check_full(data: ExperienceIn, user: User, db: Session, current: UserExperience | None = None):
    _check(data)
    if data.category not in EXPERIENCE_CATEGORIES[data.kind]:
        raise HTTPException(status_code=400, detail="Choose a type from the list (or Other)")
    if not MONTH.match(data.start_month or ""):
        raise HTTPException(status_code=400, detail="Pick the month you started")
    if data.end_month and not MONTH.match(data.end_month):
        raise HTTPException(status_code=400, detail="Pick the month you finished, or tick 'I still do this'")
    if data.end_month and data.end_month < data.start_month:
        raise HTTPException(status_code=400, detail="The end month is before the start month")
    if data.allow_duplicate or (current and _same(current.role, data.role) and _same(current.organisation, data.organisation)):
        return
    for other in db.query(UserExperience).filter(UserExperience.user_id == user.id,
                                                 UserExperience.id != (current.id if current else 0)):
        if _same(other.role, data.role) and _same(other.organisation, data.organisation):
            raise HTTPException(status_code=409, detail=f"You already have “{other.role}” at {other.organisation}. "
                                                        f"Are you sure you want to add it again?")


def _own(exp_id: int, user: User, db: Session) -> UserExperience:
    exp = db.query(UserExperience).filter(UserExperience.id == exp_id, UserExperience.user_id == user.id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Not found")
    return exp


def _apply(exp: UserExperience, data: ExperienceIn):
    exp.kind, exp.category = data.kind, data.category
    exp.role, exp.organisation = " ".join(data.role.split()), " ".join(data.organisation.split())
    exp.start_month, exp.end_month = data.start_month, data.end_month or None
    exp.description = data.description.strip() or None
    exp.mapped_skills = _clean_skills(data.skills)
    keys = {canonical_key(a) for a in data.added}
    exp.added_skills = [s for s in exp.mapped_skills if canonical_key(s) in keys]


@router.post("/experiences/suggest")
def suggest_experience_skills(data: ExperienceSuggestIn, current_user: User = Depends(get_current_user)):
    """Skills for the pop-up (nothing is stored), each with the student's words that show it. Needs a sentence or so
    about what she did: a role alone is too thin."""
    _check(data)
    role, org, description = " ".join(data.role.split()), " ".join(data.organisation.split()), data.description.strip()
    if len(description) < MIN_DESCRIPTION:
        return {"skills": [], "failed": False, "too_short": True}
    answer = _ask_json(experience_prompt(data.kind, role, org, description), "experience skills")
    kept, rejected = verify_project_skills(answer, f"{role}\n{description}")
    for r in rejected:
        print(f"[experience skills] dropped {r['skill']!r}: {r['reason']} ({r['quote']!r})")
    skills = [{"name": k, "evidence": q} for k, q in kept.items() if len(k) <= MAX_SKILL_CHARS][:MAX_EXPERIENCE_SKILLS]
    return {"skills": skills, "failed": answer is None, "too_short": False}


@router.post("/experiences", response_model=ExperienceOut, status_code=201)
def add_experience(data: ExperienceIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _check_full(data, current_user, db)
    exp = UserExperience(user_id=current_user.id)
    _apply(exp, data)
    db.add(exp)
    db.commit()
    db.refresh(exp)
    return exp


@router.put("/experiences/{exp_id}", response_model=ExperienceOut)
def edit_experience(exp_id: int, data: ExperienceIn, current_user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    exp = _own(exp_id, current_user, db)
    _check_full(data, current_user, db, exp)
    _apply(exp, data)
    db.commit()
    db.refresh(exp)
    return exp


def _newest_first(q):
    return q.order_by(UserExperience.end_month.desc().nullsfirst(), UserExperience.start_month.desc(),
                      UserExperience.id.desc())


@router.get("/experiences", response_model=list[ExperienceOut])
def list_experiences(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Newest first; the ones she still does at the top (as a CV lists them)."""
    return _newest_first(db.query(UserExperience).filter(UserExperience.user_id == current_user.id)).all()


@router.delete("/experiences/{exp_id}", status_code=204)
def delete_experience(exp_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_own(exp_id, current_user, db))
    db.commit()


@router.post("/experiences/{exp_id}/remove-skill", response_model=ExperienceOut)
def remove_experience_skill(exp_id: int, data: SkillRemove, current_user: User = Depends(get_current_user),
                            db: Session = Depends(get_db)):
    exp = _own(exp_id, current_user, db)
    exp.mapped_skills = [s for s in exp.mapped_skills if s != data.skill]
    exp.added_skills = [s for s in (exp.added_skills or []) if s != data.skill]
    db.commit()
    db.refresh(exp)
    return exp


@router.post("/experiences/{exp_id}/add-skill", response_model=ExperienceOut)
def add_experience_skill(exp_id: int, data: SkillAdd, current_user: User = Depends(get_current_user),
                         db: Session = Depends(get_db)):
    exp = _own(exp_id, current_user, db)
    name = _clean_skill(data.skill)
    if canonical_key(name) in {canonical_key(s) for s in exp.mapped_skills}:
        raise HTTPException(status_code=400, detail="This one already has that skill")
    if len(exp.mapped_skills) >= MAX_SKILLS_PER_ITEM:
        raise HTTPException(status_code=400, detail=f"Up to {MAX_SKILLS_PER_ITEM} skills each")
    exp.mapped_skills = [*exp.mapped_skills, name]
    exp.added_skills = [*(exp.added_skills or []), name]
    db.commit()
    db.refresh(exp)
    return exp
