"""
Profile router — user's personal skill profile built from:
  - Projects: name + description + optional GitHub → Groq extracts skills
  - Certifications: cert name + issuer → Groq maps to skills

GET /profile/skills returns the combined, deduplicated skill list.
"""
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from groq import Groq

from app.database import get_db
from app.models.profile import UserProject, UserCertification
from app.routers.auth import get_current_user
from app.models.user import User
from app.config import settings

router = APIRouter(prefix="/profile", tags=["profile"])
MODEL = "openai/gpt-oss-120b"


def get_client() -> Groq:
    return Groq(api_key=settings.groq_api_key)


# ── Schemas ───────────────────────────────────────────────────────────────────

class ProjectIn(BaseModel):
    name: str
    description: str
    github_url: str | None = None


class CertIn(BaseModel):
    cert_name: str
    issuer: str


class ProjectOut(BaseModel):
    id: int
    name: str
    description: str
    github_url: str | None
    extracted_skills: list[str]

    class Config:
        from_attributes = True


class CertOut(BaseModel):
    id: int
    cert_name: str
    issuer: str
    mapped_skills: list[str]

    class Config:
        from_attributes = True


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_json_array(raw: str) -> list[str]:
    """Strip markdown fences and parse a JSON array from Groq output."""
    raw = raw.strip()
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw
        if raw.startswith("json"):
            raw = raw[4:]
    result = json.loads(raw.strip())
    if isinstance(result, list):
        return [str(s).strip() for s in result if s]
    return []


def extract_skills_from_project(name: str, description: str) -> list[str]:
    prompt = f"""Extract technical skills from this software project. Return ONLY a JSON array of skill strings, nothing else.

Project: {name}
Description: {description}

Rules:
- Include programming languages, frameworks, libraries, tools, platforms, databases, APIs
- Be specific: "React" not "frontend", "PostgreSQL" not "database"
- No soft skills, no generic terms like "problem solving"
- Max 15 skills
- Example output: ["Python", "FastAPI", "PostgreSQL", "Docker", "REST API"]

Output the JSON array only:"""

    try:
        resp = get_client().chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=200,
        )
        return _parse_json_array(resp.choices[0].message.content)[:15]
    except Exception:
        return []


def map_cert_to_skills(cert_name: str, issuer: str) -> list[str]:
    prompt = f"""List the technical skills validated by this certification. Return ONLY a JSON array of skill strings.

Certification: {cert_name}
Issuer: {issuer}

Rules:
- List the specific technologies, tools, platforms, or methodologies the cert covers
- Max 10 skills
- Example for "AWS Certified Solutions Architect": ["AWS", "Cloud Architecture", "EC2", "S3", "VPC", "IAM", "RDS", "CloudFormation"]

Output the JSON array only:"""

    try:
        resp = get_client().chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=150,
        )
        return _parse_json_array(resp.choices[0].message.content)[:10]
    except Exception:
        return []


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/projects", response_model=ProjectOut, status_code=201)
def add_project(
    data: ProjectIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not data.name.strip() or not data.description.strip():
        raise HTTPException(status_code=400, detail="Project name and description are required")
    skills = extract_skills_from_project(data.name.strip(), data.description.strip())
    project = UserProject(
        user_id=current_user.id,
        name=data.name.strip(),
        description=data.description.strip(),
        github_url=data.github_url,
        extracted_skills=skills,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/projects", response_model=list[ProjectOut])
def list_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(UserProject).filter(UserProject.user_id == current_user.id).all()


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = db.query(UserProject).filter(
        UserProject.id == project_id,
        UserProject.user_id == current_user.id,
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(project)
    db.commit()


@router.post("/certifications", response_model=CertOut, status_code=201)
def add_certification(
    data: CertIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not data.cert_name.strip() or not data.issuer.strip():
        raise HTTPException(status_code=400, detail="Cert name and issuer are required")
    skills = map_cert_to_skills(data.cert_name.strip(), data.issuer.strip())
    cert = UserCertification(
        user_id=current_user.id,
        cert_name=data.cert_name.strip(),
        issuer=data.issuer.strip(),
        mapped_skills=skills,
    )
    db.add(cert)
    db.commit()
    db.refresh(cert)
    return cert


@router.get("/certifications", response_model=list[CertOut])
def list_certifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(UserCertification).filter(UserCertification.user_id == current_user.id).all()


@router.delete("/certifications/{cert_id}", status_code=204)
def delete_certification(
    cert_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cert = db.query(UserCertification).filter(
        UserCertification.id == cert_id,
        UserCertification.user_id == current_user.id,
    ).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Certification not found")
    db.delete(cert)
    db.commit()


@router.get("/skills")
def get_skill_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    projects = db.query(UserProject).filter(UserProject.user_id == current_user.id).all()
    certs = db.query(UserCertification).filter(UserCertification.user_id == current_user.id).all()

    all_skills = []
    for p in projects:
        all_skills.extend(p.extracted_skills or [])
    for c in certs:
        all_skills.extend(c.mapped_skills or [])

    seen = set()
    unique_skills = []
    for s in all_skills:
        key = s.lower().strip()
        if key and key not in seen:
            seen.add(key)
            unique_skills.append(s)

    return {
        "skills": unique_skills,
        "total": len(unique_skills),
        "from_projects": sum(len(p.extracted_skills or []) for p in projects),
        "from_certs": sum(len(c.mapped_skills or []) for c in certs),
    }