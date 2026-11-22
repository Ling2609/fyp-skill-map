"""
Workshop planner for the career office (20 Nov 2026, her pick of the mock review/workshop-planner.html).

The admin ticks up to 4 of the most common skill gaps, picks a length, format and audience, and gets a draft
activity proposal to edit and export as a PDF. The usual sections of a university activity proposal: background,
objectives, learning outcomes, participants, agenda, resources and budget, evaluation.

The numbers are SkillMap's, never the model's: the background's first sentence ("6 of 9 students lack Reporting in
their top job matches") is written here from common_skill_gaps(); the model writes the rest. If the model is not
available (no key, daily limit, a bad answer) the same proposal comes from a plain template, so the page always works.
Facilitator, venue, date, seats and budget are left for the career office ("[to fill in]"): the model can't know them.
"""
import json
import re
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from sqlalchemy import func, or_

from app.models.job import Job, JobSkill
from app.models.user import User, UserRole
from app.routers.admin import common_skill_gaps, require_admin

router = APIRouter(prefix="/admin/workshop", tags=["admin"])

LENGTHS = {"2h": ("2 hours", 120), "half": ("Half day (4 hours)", 240), "full": ("Full day (7 hours)", 420)}
FORMATS = {"in_person": "In person", "online": "Online", "hybrid": "Hybrid"}
AUDIENCES = {"all": "Open to all students", "final_year": "Final-year students"}
TO_FILL = "[to fill in]"


class DraftIn(BaseModel):
    skills: list[str] = Field(min_length=1, max_length=4)
    length: str = "half"
    format: str = "in_person"
    audience: str = "all"
    note: str = Field(default="", max_length=300)


class Proposal(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    facts: list[str] = Field(default_factory=list, max_length=6)
    background: str = Field(default="", max_length=2000)
    objectives: list[str] = Field(default_factory=list, max_length=8)
    outcomes: str = Field(default="", max_length=1500)
    participants: str = Field(default="", max_length=1000)
    agenda: list[list[str]] = Field(default_factory=list, max_length=12)
    resources: str = Field(default="", max_length=1000)
    evaluation: str = Field(default="", max_length=1000)
    partners: str = Field(default="", max_length=1500)


def _clean(text: str, limit: int) -> str:
    return " ".join(str(text or "").split())[:limit]


def _numbers(skills: list[str], db: Session) -> dict:
    gaps = {g["skill"].lower(): g for g in common_skill_gaps(db)}
    picked = [gaps[s.lower()] for s in skills if s.lower() in gaps]
    if not picked:
        raise HTTPException(status_code=400, detail="Pick skills from the most common skill gaps.")
    live = db.query(Job).filter(Job.source == "live", Job.gone_at.is_(None), Job.hidden_by_admin_at.is_(None)).count()
    return {"picked": picked, "of": picked[0]["of_students"], "most": max(g["students"] for g in picked), "live": live,
            **_companies([g["skill"] for g in picked], db)}


def _companies(skills: list[str], db: Session) -> dict:
    """20 Nov (her idea: speakers and industry partners): who asks for these skills, from SkillMap's own data. Employers
    on SkillMap with an open post that asks for one of them (they can be invited to speak), and the companies whose
    live ads ask for them most."""
    match = or_(*[func.lower(JobSkill.skill_name) == s.lower() for s in skills])
    on_skillmap = [c for (c,) in (db.query(User.company_name).join(Job, Job.posted_by_user_id == User.id)
                                  .join(JobSkill, JobSkill.job_id == Job.id)
                                  .filter(User.role == UserRole.employer, User.employer_status == "approved",
                                          Job.closed_at.is_(None), match, User.company_name.isnot(None))
                                  .distinct().limit(5))]
    live = [c for (c, _) in (db.query(Job.company, func.count(func.distinct(Job.id))).join(JobSkill, JobSkill.job_id == Job.id)
                             .filter(Job.source == "live", Job.gone_at.is_(None), match, Job.company.isnot(None))
                             .group_by(Job.company).order_by(func.count(func.distinct(Job.id)).desc()).limit(5))]
    return {"employers": on_skillmap, "hiring": [c for c in live if c not in on_skillmap][:5]}


def _partners_lead(n: dict) -> str:
    parts = []
    if n["employers"]:
        parts.append(f"Employers on SkillMap with open posts asking for these skills: {', '.join(n['employers'])}.")
    if n["hiring"]:
        parts.append(f"Companies whose live ads ask for them most: {', '.join(n['hiring'])}.")
    return " ".join(parts) or "No employer on SkillMap asks for these skills yet."


def _facts(data: DraftIn, n: dict) -> list[str]:
    return [LENGTHS[data.length][0], FORMATS[data.format], f"{AUDIENCES[data.audience]} · {n['most']} benefit most",
            f"Prepared {date.today().day} {date.today().strftime('%b %Y')}"]


def _background_lead(n: dict) -> str:
    parts = [f"{g['students']} of {g['of_students']} students lack {g['skill']}" for g in n["picked"]]
    return (f"In SkillMap's job matching, {'; '.join(parts)} in their top job matches, across {n['live']} live ICT "
            f"job ads.")


def _agenda(names: list[str], minutes: int) -> list[list[str]]:
    blocks = [("Why these skills matter: what the job ads ask for", 0.12)]
    for s in names:
        blocks.append((f"Hands-on: {s}", 0.76 / len(names)))
    blocks.append(("Present, feedback, and add it to your SkillMap profile", 0.12))
    rows, t = [], 0
    for label, share in blocks:
        d = max(15, round(minutes * share / 15) * 15)
        rows.append([f"{t // 60}:{t % 60:02d}-{(t + d) // 60}:{(t + d) % 60:02d}", label])
        t += d
    return rows


def template(data: DraftIn, n: dict) -> dict:
    names = [g["skill"] for g in n["picked"]]
    joined = " and ".join(names) if len(names) < 3 else ", ".join(names[:-1]) + " and " + names[-1]
    return {
        "title": f"Practical workshop: {joined}",
        "facts": _facts(data, n),
        "background": _background_lead(n) + f" A short practical session on {joined} would help these students "
                                             f"meet what employers ask for.",
        "objectives": [f"Practise {s} on a realistic task." for s in names] + ["Show the result as a project employers can see."],
        "outcomes": f"By the end, participants can apply {joined} to a small task and add a project with these skills to their SkillMap profile.",
        "participants": f"{AUDIENCES[data.audience]}. It helps most the {n['most']} of {n['of']} students who lack these skills. Seats: {TO_FILL}.",
        "agenda": _agenda(names, LENGTHS[data.length][1]),
        "resources": f"Facilitator: {TO_FILL} · Venue and date: {TO_FILL} · Equipment: {TO_FILL} · Budget: RM {TO_FILL}",
        "partners": _partners_lead(n) + f" A speaker from one of them could open the session with how {joined} is used at work. "
                    f"Contact: {TO_FILL}.",
        "evaluation": f"A short feedback form after the session, and a check one month later: how many students now show {joined} on their SkillMap profile.",
    }


def _join_background(lead: str, rest: str) -> str:
    """22 Nov (her report: the first sentence showed twice): the model sometimes repeats the sentence it was given, so
    every copy of it is taken out of its part before the two are joined."""
    while lead in rest:
        rest = rest.replace(lead, "", 1)
    return f"{lead} {' '.join(rest.split())}".strip()


PROMPT = """You write activity proposals for a Malaysian university's career office. Write a workshop proposal as JSON with
exactly these keys: "title" (one line), "background_rest" (2-3 sentences that follow the given first sentence; no new
numbers), "objectives" (3-4 short items), "outcomes" (one or two sentences: what participants can do by the end),
"partners_advice" (2 sentences: how the career office could bring in a speaker or an industry partner, e.g. a
guest talk, a real case study or mentors; name no company), "agenda" (list of [time, session] for the given total minutes, starting at 0:00, times like "0:30-1:45", one break if
over 2 hours). Plain English, no marketing words. Do not invent names, dates, venues, prices or statistics.
Reply with the JSON only."""


def ai_draft(data: DraftIn, n: dict) -> dict:
    from app.routers.chatbot import FALLBACK_MODEL, MODEL, get_client
    base = template(data, n)
    ask = {"skills": [g["skill"] for g in n["picked"]], "first_sentence": _background_lead(n),
           "total_minutes": LENGTHS[data.length][1], "format": FORMATS[data.format], "audience": AUDIENCES[data.audience],
           "note_from_career_office": _clean(data.note, 300)}
    for model in (MODEL, FALLBACK_MODEL):
        try:
            res = get_client().chat.completions.create(
                model=model, temperature=0.5, max_completion_tokens=2000, reasoning_effort="low",
                messages=[{"role": "system", "content": PROMPT}, {"role": "user", "content": json.dumps(ask)}])
            text = (res.choices[0].message.content or "").strip()
            got = json.loads(re.sub(r"^```(?:json)?|```$", "", text, flags=re.M).strip())
        except Exception as e:      # the model is a helper: any failure falls back to the template
            print(f"[workshop] draft with {model} failed: {type(e).__name__}: {e}")
            continue
        agenda = [[_clean(r[0], 20), _clean(r[1], 160)] for r in got.get("agenda", []) if isinstance(r, list) and len(r) == 2]
        objectives = [_clean(o, 200) for o in got.get("objectives", []) if str(o).strip()][:6]
        return {**base, "source": "ai",
                "title": _clean(got.get("title"), 160) or base["title"],
                "background": _join_background(_background_lead(n), _clean(got.get("background_rest"), 1200)),
                "objectives": objectives or base["objectives"],
                "outcomes": _clean(got.get("outcomes"), 800) or base["outcomes"],
                "agenda": agenda[:12] or base["agenda"],
                "partners": (_partners_lead(n) + " " + _clean(got.get("partners_advice"), 600) + f" Contact: {TO_FILL}.").strip()
                if got.get("partners_advice") else base["partners"]}
    return {**base, "source": "template"}


@router.post("/draft")
def draft(data: DraftIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if data.length not in LENGTHS or data.format not in FORMATS or data.audience not in AUDIENCES:
        raise HTTPException(status_code=400, detail="Choose a length, format and audience from the list.")
    return ai_draft(data, _numbers(data.skills, db))


@router.post("/pdf")
def pdf(p: Proposal, admin: User = Depends(require_admin)):
    from app.services.workshop_pdf import build_workshop_pdf
    slug = re.sub(r"[^a-z0-9]+", "-", p.title.lower()).strip("-")[:60] or "workshop"
    return Response(content=build_workshop_pdf(p.model_dump()), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="workshop-proposal-{slug}.pdf"'})


# ── Saved proposals (20 Nov, her pick): MongoDB, like the chats: a proposal is one document of free-form sections ──
class Setup(BaseModel):
    """22 Nov (her pick): the choices a proposal was drafted with, so it reopens with them."""
    length: str = "half"
    format: str = "in_person"
    audience: str = "all"
    note: str = Field(default="", max_length=300)


class SaveIn(BaseModel):
    skills: list[str] = Field(default_factory=list, max_length=4)
    proposal: Proposal
    setup: Setup | None = None


def _proposals():
    from app.mongo import workshop_proposals
    return workshop_proposals()


def _saving(fn):
    from pymongo.errors import PyMongoError
    try:
        return fn()
    except PyMongoError as e:
        print(f"[workshop] MongoDB: {type(e).__name__}: {e}")
        raise HTTPException(status_code=503, detail="Saving isn't available right now (the document database is off).")


def _summary(d: dict) -> dict:
    return {"id": d["_id"], "title": d["title"], "skills": d.get("skills", []), "updated_at": d["updated_at"],
            "by": d.get("admin_name")}


@router.get("/proposals")
def list_proposals(admin: User = Depends(require_admin)):
    return _saving(lambda: [_summary(d) for d in _proposals().find({}, {"proposal": 0}).sort("updated_at", -1)])


@router.get("/proposals/{pid}")
def get_proposal(pid: str, admin: User = Depends(require_admin)):
    d = _saving(lambda: _proposals().find_one({"_id": pid}))
    if not d:
        raise HTTPException(status_code=404, detail="That proposal was deleted.")
    return {**_summary(d), "proposal": d["proposal"], "setup": d.get("setup")}


@router.post("/proposals")
def save_proposal(body: SaveIn, admin: User = Depends(require_admin)):
    import uuid
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    doc = {"_id": uuid.uuid4().hex, "admin_id": admin.id,
           "admin_name": " ".join(filter(None, [admin.first_name, admin.last_name])) or admin.username,
           "title": body.proposal.title, "skills": body.skills, "proposal": body.proposal.model_dump(),
           "setup": body.setup.model_dump() if body.setup else None,
           "created_at": now, "updated_at": now}
    _saving(lambda: _proposals().insert_one(doc))
    return _summary(doc)


@router.put("/proposals/{pid}")
def update_proposal(pid: str, body: SaveIn, admin: User = Depends(require_admin)):
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    res = _saving(lambda: _proposals().update_one({"_id": pid}, {"$set": {
        "title": body.proposal.title, "skills": body.skills, "proposal": body.proposal.model_dump(),
        **({"setup": body.setup.model_dump()} if body.setup else {}), "updated_at": now}}))
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="That proposal was deleted.")
    return {"id": pid, "title": body.proposal.title, "skills": body.skills, "updated_at": now}


@router.delete("/proposals/{pid}")
def delete_proposal(pid: str, admin: User = Depends(require_admin)):
    _saving(lambda: _proposals().delete_one({"_id": pid}))
    return {"ok": True}
