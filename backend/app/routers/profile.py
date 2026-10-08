"""
Profile router — user's personal skill profile built from:
  - Projects: name + description + optional GitHub → Groq lists the skills USED, each with the student's own words
    as evidence; a skill whose words aren't in the description is dropped (same check as job skills, evidence.py).
    A public GitHub link adds the repo's main languages (≥ 10% of the code, services/github_repo.py)
  - Certifications: the skills listed on the certificate if the student types them ("listed"); otherwise Groq
    estimates them from the name and issuer ("estimated"), or returns none if it doesn't know the certificate
  - The student can remove any single skill (✕ on the chip); adding skills by hand is not offered (no evidence)
4 Oct, references.md "Project and certificate skill extraction".
  - Awards (8 Oct): title, issuer, date, what it was for; the AI suggests skills, the student checks them before saving
  - About & links (8 Oct): headline, About, LinkedIn / portfolio / GitHub links, two switches for employers
  - GET /profile/showcase: everything My Profile shows (app/services/showcase.py)
  - Programme + intake (8 Oct): GET / PUT /profile/study, asked at first sign-in and editable on My Profile
  - Import from GitHub (8 Oct): GET /profile/github/repos lists public repos; each one picked is added as a project

GET /profile/skills returns the shared Graduate Skill Profile (app/services/skill_profile.py).
"""
import json
import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from groq import Groq

from app.database import get_db
from app.models.profile import ADDED_BY_YOU, UserAward, UserProject, UserCertification
from app.routers.auth import get_current_user
from app.models.user import User
from app.config import settings

from app.models.programme import Intake, Programme
from app.models.user_module import UserModule
from app.services.evidence import check_quote, normalise_text
from app.services.github_repo import public_repos, repo_languages, same_repo
from app.services.skill_names import canonical_key
from app.services.showcase import build_showcase
from app.services.skill_profile import build_skill_profile

router = APIRouter(prefix="/profile", tags=["profile"])
MODEL = "openai/gpt-oss-120b"
# gpt-oss is a reasoning model: its hidden reasoning shares the output budget, so a small max_tokens (150/200 before)
# can leave no room for the answer and the skills came back empty without any error (F20; same cause as Stage 1 v8)
EXTRACT_LIMITS = {"max_completion_tokens": 2048, "reasoning_effort": "low"}


def get_client() -> Groq:
    return Groq(api_key=settings.groq_api_key)


# ── Schemas ───────────────────────────────────────────────────────────────────

class ProjectIn(BaseModel):
    name: str
    description: str
    github_url: str | None = None
    allow_duplicate: bool = False   # the student saw "you already have one called ..." and chose to add it anyway


class CertIn(BaseModel):
    cert_name: str
    issuer: str
    listed_skills: str = ""      # optional: the skills printed on the certificate / badge, comma separated
    credly_url: str | None = None
    # 4 Oct (her flow): the pop-up shows the skills before saving, so what is sent here has been seen and checked.
    # skills = the final chips; suggested = some of them came from "Suggest skills" (saved as "confirmed", else "listed")
    skills: list[str] | None = None
    suggested: bool = False
    allow_duplicate: bool = False


class CertSuggestIn(BaseModel):
    cert_name: str
    issuer: str


class SkillRemove(BaseModel):
    skill: str


class SkillAdd(BaseModel):
    skill: str


class ProjectOut(BaseModel):
    id: int
    name: str
    description: str
    github_url: str | None
    extracted_skills: list[str]
    skill_quotes: dict[str, str] | None = None
    github_note: str | None = None      # only in the reply to "add": why the repo's languages couldn't be read
    skills_note: str | None = None      # only in the reply to "add"/"edit": the AI call failed (limit, network)

    class Config:
        from_attributes = True


class CertOut(BaseModel):
    id: int
    cert_name: str
    issuer: str
    mapped_skills: list[str]
    skills_source: str | None = None
    added_skills: list[str] | None = None
    credly_url: str | None = None

    class Config:
        from_attributes = True


class AwardIn(BaseModel):
    title: str
    issuer: str
    award_date: str | None = None      # "2025-11" from the month picker, or empty
    description: str = ""
    skills: list[str] = []             # the chips the student kept in the pop-up
    allow_duplicate: bool = False


class AwardSuggestIn(BaseModel):
    title: str
    issuer: str
    description: str = ""


class AwardOut(BaseModel):
    id: int
    title: str
    issuer: str
    award_date: str | None = None
    description: str | None = None
    mapped_skills: list[str]
    added_skills: list[str] | None = None

    class Config:
        from_attributes = True


class AboutIn(BaseModel):
    headline: str = ""
    about: str = ""
    linkedin_url: str = ""
    portfolio_url: str = ""
    github_url: str = ""
    visible_to_employers: bool = False
    show_grades_to_employers: bool = False


# ── Helpers ───────────────────────────────────────────────────────────────────

MAX_PROJECT_SKILLS = 15
MAX_CERT_SKILLS = 10
# Plans and wishes don't show a skill was used ("we will add Docker", "future work: Kubernetes"). A bare "will" is NOT
# enough: students describe features that way ("The app will notify users with Firebase") for things they built.
_PLANNED = re.compile(r"\b(plan(ning|s)? to|planned|future (work|improvements?|enhancements?|plans?)|would like to|hope to"
                      r"|intend(s|ing)? to|next step|to be added|not yet|still in progress|want(s|ed)? to"
                      r"|will (add|be adding|try|explore|learn|look into|integrate|migrate|move to)|later on|eventually)\b")


def _ask_json(prompt: str, label: str):
    """Groq call that must answer with JSON; None if it failed (the item is still saved, just without skills)."""
    try:
        resp = get_client().chat.completions.create(
            model=MODEL, messages=[{"role": "user", "content": prompt}], temperature=0.1, **EXTRACT_LIMITS)
        raw = (resp.choices[0].message.content or "").strip()
        if raw.startswith("```"):
            raw = raw.strip("`").removeprefix("json").strip()
        if not raw:
            print(f"[{label}] empty answer (finish_reason={resp.choices[0].finish_reason})")
            return None
        return json.loads(raw)
    except Exception as e:
        print(f"[{label}] extraction failed: {e}")
        return None


def _sentence_of(quote: str, text: str) -> str:
    """The sentence (or line) of `text` that holds the quote; the quote itself if not found."""
    q = normalise_text(quote)
    for part in re.split(r"(?<=[.!?;])\s+|\n+", text):
        if q and q in normalise_text(part):
            return part
    return quote


def verify_project_skills(items, text: str) -> tuple[dict[str, str], list[dict]]:
    """Keep a skill only if its quote is in the student's text (fuzzy, evidence.check_quote) and the sentence is not a
    plan. Returns ({skill: quote} in order, rejected items with a reason); duplicates by canonical key are merged."""
    kept, rejected, seen = {}, [], set()
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        skill, quote = str(item.get("skill") or "").strip(), str(item.get("quote") or "").strip()
        key = canonical_key(skill)
        if not skill or not key:
            continue
        if not quote or not check_quote(quote, text)[0]:
            rejected.append({"skill": skill, "quote": quote, "reason": "not in the description"})
        elif _PLANNED.search(normalise_text(_sentence_of(quote, text))):
            rejected.append({"skill": skill, "quote": quote, "reason": "planned, not used"})
        elif key not in seen and len(kept) < MAX_PROJECT_SKILLS:
            seen.add(key)
            kept[skill] = quote
    return kept, rejected


def project_prompt(name: str, description: str) -> str:
    # No real skill names as examples: models copy example answers (Zhao et al. 2021, references.md)
    return f"""Read this student project and list the technical skills the student USED in it.

Project name: {name}
Description: {description}

Rules:
- Only skills the text says were used or built with. Skip plans and wishes ("will add", "plan to", "future work").
- Technical skills only: programming languages, frameworks, libraries, tools, platforms, databases and technical
  methods. No soft skills and no vague words such as "coding" or "website".
- Give each skill its usual name.
- For each skill, "quote" = the words from the name or description that show it, copied exactly, 2 to 12 words.
- At most {MAX_PROJECT_SKILLS} skills. If there are none, return [].

Return ONLY a JSON array of objects with the keys "skill" and "quote"."""


SKILLS_NOT_READ = "Skills couldn't be read right now. Add them yourself, or edit the project later to try again."


def _extract_project(name: str, description: str) -> tuple[dict[str, str], bool]:
    """({skill: quote} the student's own words support, True if the AI call failed: limit reached, network...)."""
    answer = _ask_json(project_prompt(name, description), "project skills")
    kept, rejected = verify_project_skills(answer, f"{name}\n{description}")
    for r in rejected:
        print(f"[project skills] dropped {r['skill']!r}: {r['reason']} ({r['quote']!r})")
    return kept, answer is None


def extract_skills_from_project(name: str, description: str) -> dict[str, str]:
    """{skill: quote} for the skills the student's own words support."""
    return _extract_project(name, description)[0]


def parse_listed_skills(text: str) -> list[str]:
    """'Python, SQL; data analysis' -> ['Python', 'SQL', 'data analysis'] (dedupe by canonical key, 1-60 chars)."""
    out, seen = [], set()
    for part in re.split(r"[,;\n•]+", text or ""):
        name = " ".join(part.split()).strip(" .-")
        key = canonical_key(name)
        if name and key and len(name) <= 60 and key not in seen:
            seen.add(key)
            out.append(name)
    return out[:MAX_CERT_SKILLS * 2]


def cert_prompt(cert_name: str, issuer: str) -> str:
    return f"""Which technical skills does this certification cover?

Certification: {cert_name}
Issuer: {issuer}

Rules:
- Only if you know this exact certification and its syllabus. If you don't, or you are unsure, return [].
- Technical skills only (technologies, tools, platforms, methods), as in the official exam or course outline.
- One skill per item, each a short name (1-4 words). No groups, lists or brackets inside an item.
- At most {MAX_CERT_SKILLS} skills.

Return ONLY a JSON array of skill names."""


def map_cert_to_skills(cert_name: str, issuer: str) -> list[str]:
    return _estimate_cert(cert_name, issuer) or []


def _estimate_cert(cert_name: str, issuer: str) -> list[str] | None:
    """Suggested skills; [] if the AI doesn't know the certificate; None if the call failed."""
    answer = _ask_json(cert_prompt(cert_name, issuer), "certification skills")
    if answer is None:
        return None
    if not isinstance(answer, list):
        return []
    # The model's items are kept whole (never split at commas: "Routing Protocols (OSPF, EIGRP)" broke into pieces
    # in the 4 Oct comparison run); a grouped item is still dropped rather than cut up
    out, seen = [], set()
    for item in answer:
        name = " ".join(str(item).split()).strip() if isinstance(item, (str, int, float)) else ""
        key = canonical_key(name)
        if name and key and key not in seen and len(name) <= MAX_SKILL_CHARS and "," not in name:
            seen.add(key)
            out.append(name)
    return out[:MAX_CERT_SKILLS]


def check_profile_schema():
    """Start-up check: the 4 Oct columns must exist (migrations/migrate_profile_skill_evidence.py)."""
    from sqlalchemy import inspect
    from app.database import engine
    projects = {c["name"] for c in inspect(engine).get_columns("user_projects")}
    certs = {c["name"] for c in inspect(engine).get_columns("user_certifications")}
    if "skill_quotes" not in projects or not {"skills_source", "added_skills", "credly_url"} <= certs:
        raise RuntimeError("Database not updated: run  python migrations/migrate_profile_skill_evidence.py  "
                           "from the backend folder, then start the backend again.")
    users = {c["name"] for c in inspect(engine).get_columns("users")}
    if not {"headline", "show_grades_to_employers"} <= users or not inspect(engine).has_table("user_awards"):
        raise RuntimeError("Database not updated: run  python migrations/migrate_profile_showcase.py  "
                           "from the backend folder, then start the backend again.")


# ── Endpoints ─────────────────────────────────────────────────────────────────
# Add and edit share one rule each (4 Oct): a project's skills come from its text (quotes) + public GitHub languages;
# a certificate's from the skills typed from it, else an AI estimate. Skills the student added by hand are kept on
# edit; skills she removed may come back if the new text still supports them (the page says so).

MAX_SKILL_CHARS = 60
MAX_SKILLS_PER_ITEM = 30
CREDLY_URL = re.compile(r"^https://(www\.)?credly\.com/\S+$", re.I)


def _own_project(project_id: int, user: User, db: Session) -> UserProject:
    project = db.query(UserProject).filter(UserProject.id == project_id, UserProject.user_id == user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _own_cert(cert_id: int, user: User, db: Session) -> UserCertification:
    cert = db.query(UserCertification).filter(UserCertification.id == cert_id,
                                              UserCertification.user_id == user.id).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Certification not found")
    return cert


# Same name twice (5 Oct, her choice B + C): an exact copy of a project (same name and description) is refused; a
# same-name project or certificate is asked about. 409 = "you already have one called X, sure?"; the pop-up then sends
# allow_duplicate. The skill profile counts each skill once, so a duplicate only adds clutter.
# Field limits (5 Oct): a longer value used to reach the database and fail with a 500 (columns are String(200/300/500)).
# Checked by hand, not with pydantic max_length, so the student gets one plain sentence instead of a 422 list.
LIMITS = {"Project name": 100, "Description": 3000, "GitHub link": 500,
          "Certificate name": 150, "Issuer": 100, "Credly link": 500,
          "Award title": 150, "Given by": 100, "What it was for": 1000,
          "Headline": 120, "About": 1000, "LinkedIn link": 300, "Portfolio link": 300, "GitHub profile link": 300}


def _check_length(label: str, value: str | None):
    if value and len(value.strip()) > LIMITS[label]:
        raise HTTPException(status_code=400, detail=f"{label} can be up to {LIMITS[label]} characters")


def _same(a: str, b: str) -> bool:
    return " ".join((a or "").split()).lower() == " ".join((b or "").split()).lower()


def _check_project(data: ProjectIn, user: User, db: Session, current: UserProject | None = None):
    """Lengths, then the same name twice (case and spaces ignored), before any AI call is made. On edit, only asked
    when the name was changed (otherwise every save of an already-confirmed duplicate would ask again)."""
    project_id = current.id if current else None
    for label, value in (("Project name", data.name), ("Description", data.description), ("GitHub link", data.github_url)):
        _check_length(label, value)
    # Option C (her choice "b+c"): the same name AND the same description is an accidental second add, never asked
    # about, always refused (even with allow_duplicate)
    for other in db.query(UserProject).filter(UserProject.user_id == user.id, UserProject.id != (project_id or 0)):
        if _same(other.name, data.name) and _same(other.description, data.description):
            raise HTTPException(status_code=400, detail=f"You've already added “{other.name}” with this description.")
    if data.allow_duplicate or (current and _same(current.name, data.name)):
        return
    name = " ".join(data.name.split()).lower()
    for other in db.query(UserProject).filter(UserProject.user_id == user.id, UserProject.id != (project_id or 0)):
        if " ".join(other.name.split()).lower() == name:
            ask = "use this name for this one too" if current else f"add another “{other.name}”"
            raise HTTPException(status_code=409, detail=f"You already have a project called “{other.name}”. "
                                                        f"Are you sure you want to {ask}?")


def _check_cert(data: CertIn, user: User, db: Session, current: UserCertification | None = None):
    cert_id = current.id if current else None
    for label, value in (("Certificate name", data.cert_name), ("Issuer", data.issuer), ("Credly link", data.credly_url)):
        _check_length(label, value)
    if data.allow_duplicate or (current and _same(current.cert_name, data.cert_name) and _same(current.issuer, data.issuer)):
        return
    key = (" ".join(data.cert_name.split()).lower(), " ".join(data.issuer.split()).lower())
    for other in db.query(UserCertification).filter(UserCertification.user_id == user.id,
                                                    UserCertification.id != (cert_id or 0)):
        if (" ".join(other.cert_name.split()).lower(), " ".join(other.issuer.split()).lower()) == key:
            ask = "use this name for this one too" if current else f"add another “{other.cert_name}”"
            raise HTTPException(status_code=409, detail=f"You already have “{other.cert_name}” from {other.issuer}. "
                                                        f"Are you sure you want to {ask}?")


def _project_skills(data: ProjectIn, keep: dict[str, str]) -> tuple[dict[str, str], str | None, str | None]:
    """{skill: evidence} from the text + GitHub, plus the student's own additions in `keep`; and the GitHub note."""
    if not data.name.strip() or not data.description.strip():
        raise HTTPException(status_code=400, detail="Project name and description are required")
    quotes, failed = _extract_project(data.name.strip(), data.description.strip())
    github_note = None
    if (data.github_url or "").strip():
        languages, github_note = repo_languages(data.github_url)
        have = {canonical_key(s) for s in quotes}
        for lang, pct in languages.items():   # evidence from the code itself; the description's quote wins if both
            if canonical_key(lang) not in have and len(quotes) < MAX_PROJECT_SKILLS + 5:
                quotes[lang] = f"GitHub: {pct}% of the code"
    have = {canonical_key(s) for s in quotes}
    for skill in keep:
        if canonical_key(skill) not in have:
            quotes[skill] = ADDED_BY_YOU
    return quotes, github_note, SKILLS_NOT_READ if failed else None


def _check_credly(url: str | None) -> str | None:
    url = (url or "").strip()
    if url and not CREDLY_URL.match(url):
        raise HTTPException(status_code=400, detail="Use a credly.com badge link, or leave it empty")
    return url or None


def _clean_skill(name: str) -> str:
    name = " ".join((name or "").split()).strip(" ,;.")
    if not name or not canonical_key(name):
        raise HTTPException(status_code=400, detail="Type a skill name")
    if len(name) > MAX_SKILL_CHARS:
        raise HTTPException(status_code=400, detail=f"Keep a skill under {MAX_SKILL_CHARS} characters")
    return name


@router.post("/projects", response_model=ProjectOut, status_code=201)
def add_project(data: ProjectIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _check_project(data, current_user, db)
    quotes, github_note, skills_note = _project_skills(data, {})
    project = UserProject(user_id=current_user.id, name=data.name.strip(), description=data.description.strip(),
                          github_url=(data.github_url or "").strip() or None,
                          extracted_skills=list(quotes), skill_quotes=quotes)
    db.add(project)
    db.commit()
    db.refresh(project)
    out = ProjectOut.model_validate(project)
    out.github_note = github_note
    out.skills_note = skills_note
    return out


@router.put("/projects/{project_id}", response_model=ProjectOut)
def edit_project(project_id: int, data: ProjectIn, current_user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    """Edit: skills are worked out again if the name, description or GitHub link changed, or none were read before."""
    project = _own_project(project_id, current_user, db)
    _check_project(data, current_user, db, project)
    github = (data.github_url or "").strip() or None
    github_note = skills_note = None
    changed = (data.name.strip(), data.description.strip(), github) != (project.name, project.description, project.github_url)
    # also when it has no skills from its text yet (e.g. the AI call failed last time): "edit later to try again"
    nothing_read = not any(v != ADDED_BY_YOU for v in (project.skill_quotes or {}).values())
    # also when it has a GitHub link but no languages from it yet (GitHub unreachable or its hourly limit last time:
    # the note says "edit and save the project later to try again", 6 Oct)
    no_languages = bool(github) and not any(str(v).startswith("GitHub:") for v in (project.skill_quotes or {}).values())
    if changed or nothing_read or no_languages:
        added = {k: v for k, v in (project.skill_quotes or {}).items() if v == ADDED_BY_YOU}
        quotes, github_note, skills_note = _project_skills(data, added)
        project.name, project.description, project.github_url = data.name.strip(), data.description.strip(), github
        project.extracted_skills, project.skill_quotes = list(quotes), quotes
        db.commit()
        db.refresh(project)
    out = ProjectOut.model_validate(project)
    out.github_note = github_note
    out.skills_note = skills_note
    return out


@router.get("/projects", response_model=list[ProjectOut])
def list_projects(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(UserProject).filter(UserProject.user_id == current_user.id).order_by(UserProject.id).all()


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_own_project(project_id, current_user, db))
    db.commit()


@router.post("/projects/{project_id}/remove-skill", response_model=ProjectOut)
def remove_project_skill(project_id: int, data: SkillRemove, current_user: User = Depends(get_current_user),
                         db: Session = Depends(get_db)):
    """The student says a skill is wrong: it leaves this project (and the profile, unless other evidence has it)."""
    project = _own_project(project_id, current_user, db)
    project.extracted_skills = [s for s in project.extracted_skills if s != data.skill]
    project.skill_quotes = {k: v for k, v in (project.skill_quotes or {}).items() if k != data.skill}
    db.commit()
    db.refresh(project)
    return project


@router.post("/projects/{project_id}/add-skill", response_model=ProjectOut)
def add_project_skill(project_id: int, data: SkillAdd, current_user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    """A skill the student says she used; labelled "Added by you" everywhere it is shown."""
    project = _own_project(project_id, current_user, db)
    name = _clean_skill(data.skill)
    if canonical_key(name) in {canonical_key(s) for s in project.extracted_skills}:
        raise HTTPException(status_code=400, detail="This project already has that skill")
    if len(project.extracted_skills) >= MAX_SKILLS_PER_ITEM:
        raise HTTPException(status_code=400, detail=f"A project can have up to {MAX_SKILLS_PER_ITEM} skills")
    project.extracted_skills = [*project.extracted_skills, name]
    project.skill_quotes = {**(project.skill_quotes or {}), name: ADDED_BY_YOU}
    db.commit()
    db.refresh(project)
    return project


def _checked_skills(names: list[str]) -> list[str]:
    """The chips from the pop-up: tidied, duplicates (same canonical key) and empty ones dropped."""
    out, seen = [], set()
    for raw in names:
        name = " ".join(str(raw or "").split()).strip(" ,;.")
        key = canonical_key(name)
        if name and key and key not in seen and len(name) <= MAX_SKILL_CHARS:
            seen.add(key)
            out.append(name)
    if len(out) > MAX_SKILLS_PER_ITEM:
        raise HTTPException(status_code=400, detail=f"A certificate can have up to {MAX_SKILLS_PER_ITEM} skills")
    return out


def _cert_skills(data: CertIn, added: list[str]) -> tuple[list[str], str]:
    """(skills, source): checked chips from the pop-up = "confirmed" / "listed"; otherwise (older callers) typed from
    the certificate = "listed", else the AI estimate; the student's own additions kept."""
    if not data.cert_name.strip() or not data.issuer.strip():
        raise HTTPException(status_code=400, detail="Certificate name and issuer are required")
    if data.skills is not None:
        return _checked_skills(data.skills), "confirmed" if data.suggested else "listed"
    listed = parse_listed_skills(data.listed_skills)
    skills = listed or map_cert_to_skills(data.cert_name.strip(), data.issuer.strip())
    have = {canonical_key(s) for s in skills}
    return skills + [s for s in added if canonical_key(s) not in have], "listed" if listed else "estimated"


@router.post("/certifications/suggest")
def suggest_cert_skills(data: CertSuggestIn, current_user: User = Depends(get_current_user)):
    """Skills for the pop-up to show before saving (nothing is stored); [] if the AI doesn't know the certificate."""
    if not data.cert_name.strip() or not data.issuer.strip():
        raise HTTPException(status_code=400, detail="Certificate name and issuer are required")
    found = _estimate_cert(data.cert_name.strip(), data.issuer.strip())
    return {"skills": found or [], "failed": found is None}   # failed: limit reached / network, not "unknown"


@router.post("/certifications", response_model=CertOut, status_code=201)
def add_certification(data: CertIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _check_cert(data, current_user, db)
    credly = _check_credly(data.credly_url)
    skills, source = _cert_skills(data, [])
    cert = UserCertification(user_id=current_user.id, cert_name=data.cert_name.strip(), issuer=data.issuer.strip(),
                             mapped_skills=skills, skills_source=source, added_skills=[], credly_url=credly)
    db.add(cert)
    db.commit()
    db.refresh(cert)
    return cert


@router.put("/certifications/{cert_id}", response_model=CertOut)
def edit_certification(cert_id: int, data: CertIn, current_user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    """Edit: typed skills replace the list; with the box empty, the AI estimates again only if the name or issuer
    changed (or the list was typed before and has now been cleared). The Credly link is just saved."""
    cert = _own_cert(cert_id, current_user, db)
    _check_cert(data, current_user, db, cert)
    cert.credly_url = _check_credly(data.credly_url)
    renamed = (data.cert_name.strip(), data.issuer.strip()) != (cert.cert_name, cert.issuer)
    if data.skills is not None:   # the pop-up's checked chips replace the list
        cert.mapped_skills, cert.skills_source = _cert_skills(data, [])
        cert.added_skills = []
    elif data.listed_skills.strip() or renamed or cert.skills_source == "listed":
        added = list(cert.added_skills or [])
        cert.mapped_skills, cert.skills_source = _cert_skills(data, added)
        cert.added_skills = [s for s in added if s in cert.mapped_skills]
    cert.cert_name, cert.issuer = data.cert_name.strip(), data.issuer.strip()
    db.commit()
    db.refresh(cert)
    return cert


@router.get("/certifications", response_model=list[CertOut])
def list_certifications(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(UserCertification).filter(UserCertification.user_id == current_user.id) \
        .order_by(UserCertification.id).all()


@router.delete("/certifications/{cert_id}", status_code=204)
def delete_certification(cert_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_own_cert(cert_id, current_user, db))
    db.commit()


@router.post("/certifications/{cert_id}/remove-skill", response_model=CertOut)
def remove_cert_skill(cert_id: int, data: SkillRemove, current_user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    cert = _own_cert(cert_id, current_user, db)
    cert.mapped_skills = [s for s in cert.mapped_skills if s != data.skill]
    cert.added_skills = [s for s in (cert.added_skills or []) if s != data.skill]
    db.commit()
    db.refresh(cert)
    return cert


@router.post("/certifications/{cert_id}/add-skill", response_model=CertOut)
def add_cert_skill(cert_id: int, data: SkillAdd, current_user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    cert = _own_cert(cert_id, current_user, db)
    name = _clean_skill(data.skill)
    if canonical_key(name) in {canonical_key(s) for s in cert.mapped_skills}:
        raise HTTPException(status_code=400, detail="This certificate already has that skill")
    if len(cert.mapped_skills) >= MAX_SKILLS_PER_ITEM:
        raise HTTPException(status_code=400, detail=f"A certificate can have up to {MAX_SKILLS_PER_ITEM} skills")
    cert.mapped_skills = [*cert.mapped_skills, name]
    cert.added_skills = [*(cert.added_skills or []), name]
    db.commit()
    db.refresh(cert)
    return cert


@router.post("/certifications/{cert_id}/confirm", response_model=CertOut)
def confirm_cert_skills(cert_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The student has checked the AI's estimate: the "Estimated" label goes; Skill Gap no longer says "estimated"."""
    cert = _own_cert(cert_id, current_user, db)
    if cert.skills_source in (None, "estimated"):
        cert.skills_source = "confirmed"
        db.commit()
        db.refresh(cert)
    return cert


@router.get("/skills")
def get_skill_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The same Graduate Skill Profile Job Matches and Skill Gap use (also fed to the chatbot)."""
    profile = build_skill_profile(current_user.id, db)
    by_source = lambda src: sum(1 for ev in profile.values() if ev.source == src)
    return {
        "skills": [ev.name for ev in profile.values()],
        "total": len(profile),
        "from_modules": by_source("module"),
        "from_projects": by_source("project"),
        "from_certs": by_source("cert"),
        "from_awards": by_source("award"),
    }

# ── Awards (8 Oct) ─────────────────────────────────────────────────────────────
# Same flow as a certificate (4 Oct): the pop-up suggests skills, the student keeps or removes them, then saves. So
# every saved skill was seen; there is no "estimated" state to confirm later. An award may have no skills (Dean's List).

MAX_AWARD_SKILLS = 8
MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def award_prompt(title: str, issuer: str, description: str) -> str:
    return f"""Which skills does this award show the student has?

Award: {title}
Given by: {issuer}
What it was for: {description or "(not given)"}

Rules:
- Only skills the award title or the description clearly shows were used to win it, e.g. a hackathon prize for a
  mobile app shows mobile app development. Skills can be technical or soft (such as teamwork or public speaking).
- An award for grades alone (such as a dean's list or a scholarship for results) shows no particular skill: return [].
- One skill per item, each a short name (1-4 words). No groups or lists inside an item.
- At most {MAX_AWARD_SKILLS} skills. If unsure, return [].

Return ONLY a JSON array of skill names."""


def _suggest_award(title: str, issuer: str, description: str) -> list[str] | None:
    """Suggested skills ([] if the award shows none); None if the AI call failed (limit, network)."""
    answer = _ask_json(award_prompt(title, issuer, description), "award skills")
    if answer is None:
        return None
    out, seen = [], set()
    for item in answer if isinstance(answer, list) else []:
        name = " ".join(str(item).split()).strip() if isinstance(item, (str, int, float)) else ""
        key = canonical_key(name)
        if name and key and key not in seen and len(name) <= MAX_SKILL_CHARS and "," not in name:
            seen.add(key)
            out.append(name)
    return out[:MAX_AWARD_SKILLS]


def _own_award(award_id: int, user: User, db: Session) -> UserAward:
    award = db.query(UserAward).filter(UserAward.id == award_id, UserAward.user_id == user.id).first()
    if not award:
        raise HTTPException(status_code=404, detail="Award not found")
    return award


def _check_award(data: AwardIn, user: User, db: Session, current: UserAward | None = None):
    """Required fields, lengths, the date, then the same award twice (title + issuer; asked, as for certificates)."""
    if not data.title.strip() or not data.issuer.strip():
        raise HTTPException(status_code=400, detail="Award title and who gave it are required")
    for label, value in (("Award title", data.title), ("Given by", data.issuer), ("What it was for", data.description)):
        _check_length(label, value)
    if data.award_date and not MONTH.match(data.award_date):
        raise HTTPException(status_code=400, detail="Pick the month and year from the date box, or leave it empty")
    if data.allow_duplicate or (current and _same(current.title, data.title) and _same(current.issuer, data.issuer)):
        return
    for other in db.query(UserAward).filter(UserAward.user_id == user.id, UserAward.id != (current.id if current else 0)):
        if _same(other.title, data.title) and _same(other.issuer, data.issuer):
            ask = "use this name for this one too" if current else f"add another “{other.title}”"
            raise HTTPException(status_code=409, detail=f"You already have “{other.title}” from {other.issuer}. "
                                                        f"Are you sure you want to {ask}?")


def _clean_skills(names: list[str]) -> list[str]:
    """The pop-up's chips: tidy, drop empties and repeats (canonical key), at most MAX_SKILLS_PER_ITEM."""
    out, seen = [], set()
    for name in names or []:
        name = " ".join(str(name).split()).strip(" ,;.")
        key = canonical_key(name)
        if name and key and key not in seen and len(name) <= MAX_SKILL_CHARS:
            seen.add(key)
            out.append(name)
    return out[:MAX_SKILLS_PER_ITEM]


@router.post("/awards/suggest")
def suggest_award_skills(data: AwardSuggestIn, current_user: User = Depends(get_current_user)):
    """Skills for the pop-up to show before saving (nothing is stored)."""
    if not data.title.strip() or not data.issuer.strip():
        raise HTTPException(status_code=400, detail="Award title and who gave it are required")
    found = _suggest_award(data.title.strip(), data.issuer.strip(), data.description.strip())
    return {"skills": found or [], "failed": found is None}


@router.post("/awards", response_model=AwardOut, status_code=201)
def add_award(data: AwardIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _check_award(data, current_user, db)
    award = UserAward(user_id=current_user.id, title=data.title.strip(), issuer=data.issuer.strip(),
                      award_date=data.award_date or None, description=data.description.strip() or None,
                      mapped_skills=_clean_skills(data.skills), added_skills=[])
    db.add(award)
    db.commit()
    db.refresh(award)
    return award


@router.put("/awards/{award_id}", response_model=AwardOut)
def edit_award(award_id: int, data: AwardIn, current_user: User = Depends(get_current_user),
               db: Session = Depends(get_db)):
    award = _own_award(award_id, current_user, db)
    _check_award(data, current_user, db, award)
    award.title, award.issuer = data.title.strip(), data.issuer.strip()
    award.award_date, award.description = data.award_date or None, data.description.strip() or None
    award.mapped_skills = _clean_skills(data.skills)
    award.added_skills = [s for s in (award.added_skills or []) if s in award.mapped_skills]
    db.commit()
    db.refresh(award)
    return award


@router.get("/awards", response_model=list[AwardOut])
def list_awards(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(UserAward).filter(UserAward.user_id == current_user.id).order_by(UserAward.id).all()


@router.delete("/awards/{award_id}", status_code=204)
def delete_award(award_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_own_award(award_id, current_user, db))
    db.commit()


@router.post("/awards/{award_id}/remove-skill", response_model=AwardOut)
def remove_award_skill(award_id: int, data: SkillRemove, current_user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    award = _own_award(award_id, current_user, db)
    award.mapped_skills = [s for s in award.mapped_skills if s != data.skill]
    award.added_skills = [s for s in (award.added_skills or []) if s != data.skill]
    db.commit()
    db.refresh(award)
    return award


@router.post("/awards/{award_id}/add-skill", response_model=AwardOut)
def add_award_skill(award_id: int, data: SkillAdd, current_user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    award = _own_award(award_id, current_user, db)
    name = _clean_skill(data.skill)
    if canonical_key(name) in {canonical_key(s) for s in award.mapped_skills}:
        raise HTTPException(status_code=400, detail="This award already has that skill")
    if len(award.mapped_skills) >= MAX_SKILLS_PER_ITEM:
        raise HTTPException(status_code=400, detail=f"An award can have up to {MAX_SKILLS_PER_ITEM} skills")
    award.mapped_skills = [*award.mapped_skills, name]
    award.added_skills = [*(award.added_skills or []), name]
    db.commit()
    db.refresh(award)
    return award


# ── About & links, showcase (8 Oct) ───────────────────────────────────────────

LINK_RULES = {   # field -> (label, the address must contain this, example for the message)
    "linkedin_url": ("LinkedIn link", "linkedin.com/", "https://www.linkedin.com/in/your-name"),
    "portfolio_url": ("Portfolio link", "", "https://your-site.com"),
    "github_url": ("GitHub profile link", "github.com/", "https://github.com/your-name"),
}


def _check_link(field: str, value: str) -> str | None:
    """Empty is fine. Otherwise a full https:// address (http:// is accepted and stored as it is), with the right
    site for LinkedIn and GitHub. Only the address is checked; whether the page exists is not."""
    label, must_have, example = LINK_RULES[field]
    url = (value or "").strip()
    if not url:
        return None
    _check_length(label, url)
    if not re.match(r"^https?://[^\s/]+\.[^\s]+$", url, re.I) or (must_have and must_have not in url.lower()):
        raise HTTPException(status_code=400, detail=f"{label}: use the full address, e.g. {example}")
    return url


def _about_out(user: User) -> dict:
    return {"headline": user.headline or "", "about": user.about or "", "linkedin_url": user.linkedin_url or "",
            "portfolio_url": user.portfolio_url or "", "github_url": user.github_url or "",
            "visible_to_employers": user.is_visible_to_employers,
            "show_grades_to_employers": user.show_grades_to_employers}


@router.get("/about")
def get_about(current_user: User = Depends(get_current_user)):
    return _about_out(current_user)


@router.put("/about")
def save_about(data: AboutIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _check_length("Headline", data.headline)
    _check_length("About", data.about)
    links = {field: _check_link(field, getattr(data, field)) for field in LINK_RULES}   # all checked before saving
    current_user.headline = " ".join(data.headline.split()) or None
    current_user.about = data.about.strip() or None
    current_user.linkedin_url, current_user.portfolio_url, current_user.github_url = (
        links["linkedin_url"], links["portfolio_url"], links["github_url"])
    current_user.is_visible_to_employers = data.visible_to_employers
    current_user.show_grades_to_employers = data.show_grades_to_employers
    db.commit()
    db.refresh(current_user)
    return _about_out(current_user)


@router.get("/showcase")
def get_showcase(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Everything My Profile shows (the student's own view: grades included)."""
    return build_showcase(current_user, db)


# ── Module grades ──────────────────────────────────────────────────────────────
class ModuleGradeInput(BaseModel):
    module_code: str
    grade: float

class ModuleGradesPayload(BaseModel):
    grades: list[ModuleGradeInput]


@router.post("/modules")
def save_module_grades(
    payload: ModuleGradesPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    for item in payload.grades:
        if not (0.0 <= item.grade <= 4.0):
            raise HTTPException(
                status_code=422,
                detail=f"Grade for {item.module_code} must be between 0.0 and 4.0"
            )

    incoming_codes = {item.module_code for item in payload.grades}
    if len(incoming_codes) != len(payload.grades):
        # The same module twice used to crash the save (unique user + module, 500). Refuse it clearly instead of
        # guessing which grade is meant (F13)
        seen, dup = set(), set()
        for item in payload.grades:
            (dup if item.module_code in seen else seen).add(item.module_code)
        raise HTTPException(status_code=422, detail=f"Each module can have only one grade: {', '.join(sorted(dup))}")

    # Delete modules that were removed (unticked electives, cleared grades)
    db.query(UserModule).filter(
        UserModule.user_id == current_user.id,
        UserModule.module_code.notin_(incoming_codes),
    ).delete(synchronize_session=False)

    # Upsert the ones that remain
    for item in payload.grades:
        existing = db.query(UserModule).filter(
            UserModule.user_id == current_user.id,
            UserModule.module_code == item.module_code,
        ).first()
        if existing:
            existing.grade = item.grade
        else:
            db.add(UserModule(
                user_id=current_user.id,
                module_code=item.module_code,
                grade=item.grade,
            ))

    db.commit()

    return {"saved": len(payload.grades), "message": "Module grades saved."}


@router.get("/modules")
def get_module_grades(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    saved = db.query(UserModule).filter(
        UserModule.user_id == current_user.id
    ).all()
    return {
        "grades": [
            {"module_code": m.module_code, "grade": m.grade}
            for m in saved
        ]
    }


# ── Programme + intake (8 Oct) ────────────────────────────────────────────────
# Decided 7 Oct (references.md "Programme + intake"): asked in a one-step setup at first sign-in, like Handshake's
# onboarding, and editable later. The Admin keeps the list (admin_academic.py); students only read it and pick.

class StudyIn(BaseModel):
    programme_id: int
    intake_id: int | None = None     # may stay empty only while the programme has no intakes yet


def _study_out(user: User, db: Session) -> dict:
    programmes = db.query(Programme).order_by(Programme.name).all()
    intakes = db.query(Intake).order_by(Intake.start_date.desc().nulls_last(), Intake.code).all()
    return {"programme_id": user.programme_id, "intake_id": user.intake_id,
            "programmes": [{"id": p.id, "name": p.name,
                            "intakes": [{"id": i.id, "code": i.code} for i in intakes if i.programme_id == p.id]}
                           for p in programmes]}


@router.get("/study")
def get_study(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The student's programme and intake, and the choices (every programme with its intakes, newest first)."""
    return _study_out(current_user, db)


@router.put("/study")
def save_study(data: StudyIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students have a programme and intake")
    programme = db.get(Programme, data.programme_id)
    if not programme:
        raise HTTPException(status_code=400, detail="Please pick your programme")
    has_intakes = db.query(Intake).filter(Intake.programme_id == programme.id).count() > 0
    intake = db.get(Intake, data.intake_id) if data.intake_id else None
    if intake is None and has_intakes:
        raise HTTPException(status_code=400, detail="Please pick your intake")
    if intake is not None and intake.programme_id != programme.id:
        raise HTTPException(status_code=400, detail="That intake belongs to another programme")
    current_user.programme_id, current_user.intake_id = programme.id, intake.id if intake else None
    db.commit()
    db.refresh(current_user)
    return _study_out(current_user, db)


# ── Import from GitHub (8 Oct) ────────────────────────────────────────────────
# Her choice: alongside "+ Add project", not instead of it (projects outside GitHub, repos without a description).
# This only LISTS the repos; the page adds each repo she ticks through POST /profile/projects, so an imported repo is
# an ordinary project (same skill extraction, same languages rule, editable). references.md "Showcase profile".

@router.get("/github/repos")
def list_github_repos(account: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    repos, note = public_repos(account)
    if note:
        raise HTTPException(status_code=400, detail=note)
    links = [p.github_url for p in db.query(UserProject).filter(UserProject.user_id == current_user.id)]
    for r in repos:
        r["added"] = any(same_repo(r["url"], link) for link in links)
    return {"repos": repos}
