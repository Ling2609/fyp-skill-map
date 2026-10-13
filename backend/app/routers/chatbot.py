"""
Chatbot router — two modes:
  - career_counsellor: personality/work style questions, goal setting, career direction
  - skill_development: per missing skill, suggests specific resources (Coursera, YouTube, docs)

Context-aware: receives user skill profile, target job, and exact skill gaps.

Conversations are saved in MongoDB (app/mongo.py, 6 Oct): each reply is added to the student's chat session, and
the page lists past chats to continue. If MongoDB is off, the chat still works; it is just not saved.
"""
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from pymongo.errors import PyMongoError
from groq import Groq
from app.config import settings
from app.database import get_db
from app.models.user import User
from app.mongo import chat_sessions, history_ok
from app.routers.auth import get_current_user
from app.routers.skillgap import SkillGapRequest, analyse_skill_gap
from app.services.showcase import grade_letter
from app.services import learning_resources

router = APIRouter(prefix="/chatbot", tags=["chatbot"])

MODEL = "openai/gpt-oss-120b"
# Groq's free daily token limit is per model, and the job-ad extraction runs use the 120b one too. When it is used
# up, the chat carries on with the smaller model of the same family, which has its own daily limit (6 Oct, her choice)
FALLBACK_MODEL = "openai/gpt-oss-20b"


def _is_rate_limit(e: Exception) -> bool:
    return "rate limit" in str(e).lower() or "429" in str(e)


def get_client() -> Groq:
    return Groq(api_key=settings.groq_api_key)


# ── System prompts ────────────────────────────────────────────────────────────

CAREER_COUNSELLOR_SYSTEM = """You are an expert career counsellor specialising in the Malaysian ICT job market for fresh graduates.

Your role:
- Ask thoughtful questions about the user's work style, personality, interests, and goals
- Use their skill profile and job match data to give personalised career direction advice
- Suggest specific job roles or career paths that suit them
- Be encouraging but realistic — if there are skill gaps, address them honestly
- Keep responses concise (3-5 sentences max per reply) and conversational
- Reference their actual skills and matched jobs when relevant
- Focus on the Malaysian market context
- Never make up URLs, salaries or company facts; say so when you are not sure (links not on SkillMap's checked list are removed)

Tone: Professional but warm, like a trusted mentor."""

# 13 Oct (learning plan, her approval): a plan the student can follow and tick off. Each step has a time that fits
# their hours a week and a "done when" they can see (SMART goals: specific, measurable, time-bound; Vanderbilt
# University ILP guide, references.md "Learning plan"). The last step puts the result on My Profile, so SkillMap counts
# the new skill. Links only from the checked list (app/services/learning_resources.py); any other link is removed.
SKILL_DEVELOPMENT_SYSTEM = """You are a technical learning guide for Malaysian ICT graduates. You turn a skill the student is missing into a learning plan they can follow and tick off.

When the student asks to learn a skill or asks for a plan, answer in exactly this shape (Markdown, under 450 words):

### Learning plan: <skill>
One or two sentences: why the skill matters for their target job or career goal. When the context quotes the job ad, use the quote and say whether the ad requires the skill or lists it as nice to have.

#### Resources
2 to 4 bullets: **name** (provider, free or paid), then what to use it for. Link a resource ONLY with a URL listed under "Checked resources" in the context, copied exactly. For any other resource write its name and the words to search for. Never write any other URL.

#### Your plan
One table with exactly these columns: | Step | What to do | Time | Done when |
- 3 to 5 steps. "What to do" is one concrete action that builds on skills they already have (e.g. "you know Java, so...").
- Time fits the student's hours a week from the context (assume 5 if not given), e.g. "1 week (5 h)".
- "Done when" is something they can see or show, e.g. "your API runs in a container on localhost".
- The last row is always: | Add it to SkillMap | Add the project to My Profile, Projects, so SkillMap counts the skill | 10 min | <skill> shows on My Profile |

#### Show it: portfolio project
One project that uses this skill and, if possible, other skills they are still missing (2 or 3 sentences).

For a follow-up (change the plan, explain a step, another project) answer briefly. Send the whole plan again, in the same shape, only when the plan itself changes.

Facts: only name a course, provider or university you are sure exists; if unsure, give the words to search for instead. Never say what a named company requires or uses unless it is in the user context below (e.g. "Hytech requires ISTQB" when the ad does not say so). No made-up numbers or statistics.

Formatting (shown in a chat bubble): no emoji, no "---" lines, no other tables, no links inside the table.

Tone: Direct and practical. No fluff."""


# ── Schemas ───────────────────────────────────────────────────────────────────

class Message(BaseModel):
    role: str
    content: str = Field(max_length=4000)


class ChatRequest(BaseModel):
    mode: str
    messages: list[Message] = Field(max_length=40)  # keeps each Groq call small
    user_skills: list[str] | None = None
    missing_skills: list[str] | None = None
    matched_jobs: list[dict] | None = None
    target_skill: str | None = None
    job_title: str | None = None
    # "Learn →" on a job (E3, 9 Oct): the backend reads that job's skill gap itself, the same numbers Job Detail shows
    job_id: str | None = Field(default=None, max_length=200)
    session_id: str | None = Field(default=None, max_length=64)   # continue a saved chat; None = start a new one
    hours_per_week: int | None = Field(default=None, ge=1, le=40)   # 13 Oct: the plan's times fit this


# ── Helpers ───────────────────────────────────────────────────────────────────

def _evidence(m: dict) -> str:
    """Where a matched skill comes from, in a few words: module + grade, project or certificate."""
    where = m.get("matched_via_module") or ""          # "Python Programming", or "Project: SkillMap" etc.
    if m.get("evidence_source") == "module":
        letter = grade_letter(m.get("grade"))
        return f"module {where}" + (f", grade {letter}" if letter else "")
    return where


def job_gap_lines(gap: dict, target_skill: str | None) -> list[str]:
    """The job's skill gap (as on Job Detail) as context lines: what the student already has (with evidence), what
    is still missing, nice to have, and the ad's own words about the skill being learnt."""
    job = gap["job"]
    lines = [f"Target job: {job['job_title']} at {job['company']}"
             + (f" ({job['location']})" if job.get("location") else "")]
    s = gap["summary"]
    lines.append(f"Has {s['matched_skills']} of {s['job_skills_total']} "
                 f"{'required' if s.get('coverage_basis') == 'required' else 'listed'} skills for this job")
    if gap["matched_skills"]:
        lines.append("Already has for this job: " + "; ".join(
            f"{m['job_skill']} (from {_evidence(m)})" for m in gap["matched_skills"][:8]))
    if gap["missing_skills"]:
        lines.append("Still missing (required by the ad): " + ", ".join(m["job_skill"] for m in gap["missing_skills"][:10]))
    nice = [n["job_skill"] for n in gap.get("nice_to_have", []) if not n["has"]]
    if nice:
        lines.append("Nice to have, not yet: " + ", ".join(nice[:6]))
    if target_skill:
        t = target_skill.lower()
        for kind, rows in (("requires", gap["missing_skills"]), ("lists as nice to have", gap.get("nice_to_have", []))):
            row = next((r for r in rows if r["job_skill"].lower() == t), None)
            if row:
                quote = row.get("ad_quote")
                lines.append(f"The ad {kind} {row['job_skill']}" + (f': "{quote}"' if quote else ""))
                break
    return lines


def build_context_block(req: ChatRequest, gap: dict | None = None, goal: str | None = None) -> str:
    lines = []
    if gap:
        lines += job_gap_lines(gap, req.target_skill)
    elif req.job_title:
        lines.append(f"Target job: {req.job_title}")
    if goal:
        lines.append(f"Career goal (job category the user is working towards): {goal}")
    if req.user_skills:
        top = req.user_skills[:15]
        lines.append(f"User's skills ({len(req.user_skills)} total): {', '.join(top)}"
                     + (" ..." if len(req.user_skills) > 15 else ""))
    if req.missing_skills:
        if not gap:   # with a job's gap the missing skills are already listed above
            lines.append(f"Missing skills for target job: {', '.join(req.missing_skills[:10])}")
    if req.matched_jobs:
        top_jobs = [f"{j.get('job_title', '')} at {j.get('company', '')} ({j.get('match_percent', '')}% match)"
                    for j in req.matched_jobs[:3]]
        lines.append(f"Top job matches: {'; '.join(top_jobs)}")
    if req.target_skill:
        lines.append(f"The user wants to learn: {req.target_skill}")
    if req.mode == "skill_development":
        if req.hours_per_week:
            lines.append(f"Hours a week the user can spend learning: {req.hours_per_week}")
        # Checked links for the skill being learnt, else the skills named in the question, else the job's gaps
        question = next((m.content for m in reversed(req.messages) if m.role == "user"), "")
        gaps = ", ".join((req.missing_skills or [])[:5]) or (", ".join(m["job_skill"] for m in gap["missing_skills"][:5]) if gap else "")
        lines += learning_resources.context_lines(learning_resources.find_skills(req.target_skill, question, gaps))
    return "\n".join(lines) if lines else ""


def ensure_profile_step(reply: str) -> str:
    """A plan's table always ends with putting the work on My Profile (the prompt asks; this makes sure)."""
    from app.services.plan_pdf import plan_title
    skill = plan_title(reply)
    lines = reply.split("\n")
    head = next((i for i, l in enumerate(lines) if l.strip().startswith("|") and "done when" in l.lower()), None)
    if skill is None or head is None:
        return reply
    end = head
    while end + 1 < len(lines) and lines[end + 1].strip().startswith("|"):
        end += 1
    if any("my profile" in l.lower() for l in lines[head:end + 1]):
        return reply
    lines.insert(end + 1, f"| Add it to SkillMap | Add the project to My Profile, Projects, so SkillMap counts the skill "
                          f"| 10 min | {skill} shows on My Profile |")
    return "\n".join(lines)


# ── Endpoint ──────────────────────────────────────────────────────────────────

MAX_SAVED_MESSAGES = 200      # per chat; older ones drop off (the model only ever sees the last 20)
TITLE_CHARS = 60
HISTORY_OFF = "Chat history isn't available right now (MongoDB is not running). Your chats are not being saved."


def _minutes(groq_wait: str) -> str:
    """Groq's "4m18.336s" / "1h2m" / "35.2s" -> "5 minutes" / "2 hours" / "1 minute" (rounded up)."""
    h = re.search(r"(\d+)h", groq_wait)
    m = re.search(r"(\d+)m", groq_wait)
    s = re.search(r"([\d.]+)s", groq_wait)
    total = (int(h.group(1)) * 3600 if h else 0) + (int(m.group(1)) * 60 if m else 0) + (float(s.group(1)) if s else 0)
    mins = max(1, -(-int(total) // 60))
    if mins >= 60:
        hours = -(-mins // 60)
        return f"{hours} hour{'s' if hours > 1 else ''}"
    return f"{mins} minute{'s' if mins > 1 else ''}"


def _now():
    return datetime.now(timezone.utc)


def _own_session(session_id: str, user: User) -> dict:
    """The user's own chat, or 404 (also for someone else's chat: never reveal that it exists)."""
    try:
        doc = chat_sessions().find_one({"_id": session_id, "user_id": user.id})
    except PyMongoError:
        raise HTTPException(status_code=503, detail=HISTORY_OFF)
    if not doc:
        raise HTTPException(status_code=404, detail="Chat not found.")
    return doc


def save_exchange(req: ChatRequest, user: User, reply: str) -> str | None:
    """Add the student's last message and the reply to their chat (a new chat if none). Returns the chat id, or
    None when MongoDB is off: the reply is still shown, only not saved."""
    question = next((m.content for m in reversed(req.messages) if m.role == "user"), "")
    now = _now()
    turn = [{"role": "user", "content": question, "at": now}, {"role": "assistant", "content": reply, "at": now}]
    try:
        col = chat_sessions()
        if req.session_id:
            done = col.update_one({"_id": req.session_id, "user_id": user.id, "mode": req.mode},
                                  {"$push": {"messages": {"$each": turn, "$slice": -MAX_SAVED_MESSAGES}},
                                   "$set": {"updated_at": now}})
            if done.matched_count:
                return req.session_id
        # New chat (or the given one is gone / not this user's / another mode: start a new one, never write to it)
        session_id = str(uuid.uuid4())
        title = " ".join(question.split())
        col.insert_one({"_id": session_id, "user_id": user.id, "mode": req.mode,
                        "title": title[:TITLE_CHARS] + ("…" if len(title) > TITLE_CHARS else ""),
                        "context": {"target_skill": req.target_skill, "job_title": req.job_title, "job_id": req.job_id},
                        "created_at": now, "updated_at": now, "messages": turn})
        return session_id
    except PyMongoError as e:
        print(f"[chatbot] chat not saved (MongoDB): {type(e).__name__}")
        return None


@router.get("/sessions")
def list_sessions(current_user: User = Depends(get_current_user)):
    """The student's past chats, newest first (no messages: the list only needs titles)."""
    if not history_ok():
        raise HTTPException(status_code=503, detail=HISTORY_OFF)
    docs = chat_sessions().aggregate([
        {"$match": {"user_id": current_user.id}}, {"$sort": {"updated_at": -1}}, {"$limit": 50},
        {"$project": {"mode": 1, "title": 1, "context": 1, "updated_at": 1, "count": {"$size": "$messages"}}}])
    return [{"id": d["_id"], "mode": d["mode"], "title": d.get("title") or "Chat", "context": d.get("context") or {},
             "updated_at": d["updated_at"], "message_count": d.get("count", 0)} for d in docs]


@router.get("/sessions/{session_id}")
def get_session(session_id: str, current_user: User = Depends(get_current_user)):
    doc = _own_session(session_id, current_user)
    return {"id": doc["_id"], "mode": doc["mode"], "title": doc.get("title") or "Chat",
            "context": doc.get("context") or {},
            "messages": [{"role": m["role"], "content": m["content"]} for m in doc.get("messages", [])]}


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: str, current_user: User = Depends(get_current_user)):
    _own_session(session_id, current_user)
    try:
        chat_sessions().delete_one({"_id": session_id, "user_id": current_user.id})
    except PyMongoError:
        raise HTTPException(status_code=503, detail=HISTORY_OFF)
    return Response(status_code=204)


@router.post("/")
def chat(req: ChatRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if req.mode not in ("career_counsellor", "skill_development"):
        raise HTTPException(status_code=400, detail="mode must be 'career_counsellor' or 'skill_development'")
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages cannot be empty")

    system_prompt = (
        CAREER_COUNSELLOR_SYSTEM if req.mode == "career_counsellor"
        else SKILL_DEVELOPMENT_SYSTEM
    )

    groq_messages = [{"role": "system", "content": system_prompt}]

    # Grounded in the student's real data (E3): the job's skill gap when the chat came from a job, and the career goal.
    # A job that is gone or a profile that is empty just leaves those lines out; the chat still works.
    gap = None
    if req.job_id:
        try:
            gap = analyse_skill_gap(SkillGapRequest(job_id=req.job_id), db, current_user)
        except HTTPException:
            gap = None
    context = build_context_block(req, gap, current_user.target_category)
    if context:
        groq_messages.append({
            "role": "system",
            "content": f"User context (use this to personalise your responses):\n{context}"
        })

    for msg in req.messages:
        if msg.role not in ("user", "assistant"):
            continue
        groq_messages.append({"role": msg.role, "content": msg.content})

    reply, last_error = None, None
    for model in (MODEL, FALLBACK_MODEL):
        try:
            response = get_client().chat.completions.create(
                model=model,
                messages=groq_messages,
                temperature=0.7,
                # reasoning shares this budget (gpt-oss): 600 cut replies mid-sentence or left none at all (F21)
                max_completion_tokens=3000,
                reasoning_effort="low",
            )
        except Exception as e:
            # The real error stays in the server log; the student gets a plain message (external audit, 6 Oct)
            print(f"[chatbot] Groq call failed ({model}): {type(e).__name__}: {e}")
            last_error = e
            if _is_rate_limit(e):
                continue                     # this model's daily limit is used up: try the next one
            raise HTTPException(status_code=502, detail="The assistant isn't available right now. Please try again.")
        choice = response.choices[0]
        reply = (choice.message.content or "").strip()
        if not reply:
            raise HTTPException(status_code=502, detail="The assistant couldn't finish an answer. Please try again.")
        if choice.finish_reason == "length":
            reply += "\n\n(Answer cut short. Ask me to continue.)"
        if model != MODEL:
            print(f"[chatbot] answered with {model} ({MODEL} is at its daily limit)")
        break
    if reply is None:
        # Both models at their daily limit: say when to try again, not "something went wrong"
        wait = re.search(r"try again in ([\d.hms]+)", str(last_error))
        when = f" in about {_minutes(wait.group(1))}" if wait else " later"
        raise HTTPException(status_code=429, detail=f"The assistant has reached its daily usage limit. Please try again{when}.")
    reply, removed = learning_resources.strip_unlisted_links(reply)
    if removed:
        print(f"[chatbot] removed {removed} link(s) not on the checked list")
    if req.mode == "skill_development":
        reply = ensure_profile_step(reply)
    session_id = save_exchange(req, current_user, reply)
    return {"reply": reply, "mode": req.mode, "session_id": session_id, "saved": session_id is not None}

# ── Download plan (PDF) ───────────────────────────────────────────────────────
class PlanPdfIn(BaseModel):
    content: str = Field(min_length=1, max_length=12000)     # the plan message, as shown in the chat
    job_id: str | None = Field(default=None, max_length=200)  # the chat's job: its have / missing go in the header


@router.post("/plan-pdf")
def plan_pdf(req: PlanPdfIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The plan message as an A4 PDF to print and tick off (13 Oct, mock-up v4_plan_pdf). Links are checked again,
    so a saved chat from before a link failed its check doesn't print it."""
    from app.services.plan_pdf import build_pdf, plan_title
    content, _ = learning_resources.strip_unlisted_links(req.content)
    skill = plan_title(content)
    if not skill:
        raise HTTPException(status_code=400, detail="This message isn't a learning plan.")
    job, have, missing = None, [], []
    if req.job_id:
        try:
            gap = analyse_skill_gap(SkillGapRequest(job_id=req.job_id), db, current_user)
            j = gap["job"]
            job = f"{j['job_title']}, {j['company']}" if j.get("company") else j["job_title"]
            have = [m["job_skill"] for m in gap["matched_skills"][:8]]
            missing = [m["job_skill"] for m in gap["missing_skills"][:8]]
        except HTTPException:
            pass                          # the job is gone: the plan prints without it
    name = " ".join(p for p in (current_user.first_name, current_user.last_name) if p) or current_user.username
    pdf = build_pdf(content, student=name, goal=current_user.target_category, job=job, have=have, missing=missing,
                    skill=skill)
    slug = re.sub(r"[^a-z0-9]+", "-", skill.lower()).strip("-") or "skill"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="learning-plan-{slug}.pdf"'})
