"""
Chatbot router — two modes:
  - career_counsellor: personality/work style questions, goal setting, career direction
  - skill_development: per missing skill, suggests specific resources (Coursera, YouTube, docs)

Context-aware: receives user skill profile, target job, and exact skill gaps.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from groq import Groq
from app.config import settings
from app.models.user import User
from app.routers.auth import get_current_user

router = APIRouter(prefix="/chatbot", tags=["chatbot"])

MODEL = "openai/gpt-oss-120b"


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
- Never make up URLs, salaries or company facts; say so when you are not sure

Tone: Professional but warm, like a trusted mentor."""

SKILL_DEVELOPMENT_SYSTEM = """You are a technical learning guide specialising in software engineering and ICT skills for Malaysian graduates.

Your role:
- For each missing skill the user asks about, provide a clear, structured learning path
- Suggest SPECIFIC free resources: exact Coursera courses, YouTube channels/playlists, official docs, freeCodeCamp tutorials
- Estimate realistic time to learn (e.g., "2-3 weeks with 1 hour/day")
- Show how the skill connects to the user's target job role
- Keep responses focused — one skill at a time, actionable steps

Format your responses with:
1. Why this skill matters for their target role
2. Recommended resources (with specific names, not just "YouTube")
3. A simple 3-step learning plan
4. How to demonstrate this skill (portfolio project idea)

Links: never make up a URL. Name each resource exactly (course, channel, book) so it can be searched. Only link the
official home page of a tool's documentation when you are certain of it (e.g. https://docs.docker.com). Never write
playlist, video or course URLs: their IDs cannot be checked and are often wrong.

Facts: only name a course, provider or university you are sure exists; if unsure, give the words to search for
instead. Never say what a named company requires or uses unless it is in the user context below (e.g. "Hytech
requires ISTQB" when the ad does not say so). No made-up numbers or statistics.

Formatting (shown in a chat bubble, rendered as Markdown): short "###" headings, bullet points, at most one small
table with 2-3 short columns and no links inside it. No emoji numbering, no "---" lines. Aim for under 350 words.

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


# ── Helpers ───────────────────────────────────────────────────────────────────

def build_context_block(req: ChatRequest) -> str:
    lines = []
    if req.job_title:
        lines.append(f"Target job: {req.job_title}")
    if req.user_skills:
        top = req.user_skills[:15]
        lines.append(f"User's skills ({len(req.user_skills)} total): {', '.join(top)}"
                     + (" ..." if len(req.user_skills) > 15 else ""))
    if req.missing_skills:
        lines.append(f"Missing skills for target job: {', '.join(req.missing_skills[:10])}")
    if req.matched_jobs:
        top_jobs = [f"{j.get('job_title', '')} at {j.get('company', '')} ({j.get('match_percent', '')}% match)"
                    for j in req.matched_jobs[:3]]
        lines.append(f"Top job matches: {'; '.join(top_jobs)}")
    if req.target_skill:
        lines.append(f"The user wants to learn: {req.target_skill}")
    return "\n".join(lines) if lines else ""


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/")
def chat(req: ChatRequest, current_user: User = Depends(get_current_user)):
    if req.mode not in ("career_counsellor", "skill_development"):
        raise HTTPException(status_code=400, detail="mode must be 'career_counsellor' or 'skill_development'")
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages cannot be empty")

    system_prompt = (
        CAREER_COUNSELLOR_SYSTEM if req.mode == "career_counsellor"
        else SKILL_DEVELOPMENT_SYSTEM
    )

    groq_messages = [{"role": "system", "content": system_prompt}]

    context = build_context_block(req)
    if context:
        groq_messages.append({
            "role": "system",
            "content": f"User context (use this to personalise your responses):\n{context}"
        })

    for msg in req.messages:
        if msg.role not in ("user", "assistant"):
            continue
        groq_messages.append({"role": msg.role, "content": msg.content})

    try:
        response = get_client().chat.completions.create(
            model=MODEL,
            messages=groq_messages,
            temperature=0.7,
            # reasoning shares this budget (gpt-oss): 600 cut replies mid-sentence or left none at all (F21)
            max_completion_tokens=3000,
            reasoning_effort="low",
        )
        choice = response.choices[0]
        reply = (choice.message.content or "").strip()
        if not reply:
            raise HTTPException(status_code=502, detail="The assistant couldn't finish an answer. Please try again.")
        if choice.finish_reason == "length":
            reply += "\n\n(Answer cut short. Ask me to continue.)"
        return {"reply": reply, "mode": req.mode}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Groq API error: {str(e)}")