"""
Graduate Skill Profile: the one place a student's skills are built.

Used by /recommend, /skillgap and /profile/skills (which feeds the chatbot), so
every page works from the same skills, the same weights and the same thresholds.

Built live from the source tables on each request (modules + grades, projects,
certifications). That's 3 small queries, far cheaper than the SBERT work that
follows, and it can never go stale when a project or certification changes.
"""
from dataclasses import dataclass

import numpy as np
from sqlalchemy.orm import Session

from app.models.module import Module, ModuleSkill
from app.models.profile import UserCertification, UserProject
from app.models.user_module import UserModule

# ── Matching thresholds (SBERT cosine similarity) ─────────────────────────────
MATCH_THRESHOLD = 0.6    # at or above = the student has this skill (counts as matched)
DIRECT_THRESHOLD = 0.8   # at or above = direct evidence (same skill, different wording)
PARTLY_THRESHOLD = 0.4   # 0.4–0.59 = partly covered (a related skill exists)

# Projects and certifications are self-declared and carry no grade
SELF_DECLARED_WEIGHT = 0.7

EMPTY_PROFILE_MESSAGE = (
    "Your skill profile is empty. Add your module grades, a project or a "
    "certification on the Profile page first."
)


def grade_weight(grade: float) -> float:
    """Strength of academic evidence (4.0 scale). Used for the profile vector and
    shown as evidence strength; it never decides whether a skill is matched."""
    if grade >= 4.0: return 1.0
    elif grade >= 3.7: return 0.9
    elif grade >= 3.3: return 0.8
    elif grade >= 3.0: return 0.7
    elif grade >= 2.7: return 0.6
    else: return 0.5


@dataclass
class SkillEvidence:
    name: str               # skill name as stored (first spelling seen)
    weight: float           # grade_weight for modules, SELF_DECLARED_WEIGHT otherwise
    source: str             # "module" / "project" / "cert"
    source_name: str        # module name, "Project: X" or "Certification: Y"
    grade: float | None = None


def build_skill_profile(user_id: int, db: Session) -> dict[str, SkillEvidence]:
    """The student's skills, keyed by lower-cased name so "Python" and "python"
    count once. Module evidence wins over project/cert evidence (it carries a grade);
    between modules, the best grade wins."""
    profile: dict[str, SkillEvidence] = {}

    # Modules: one joined query instead of one query per module
    rows = (
        db.query(ModuleSkill.skill_name, Module.name, UserModule.grade)
        .join(Module, Module.id == ModuleSkill.module_id)
        .join(UserModule, UserModule.module_code == Module.code)
        .filter(UserModule.user_id == user_id)
        .order_by(UserModule.id, ModuleSkill.id)   # stable order = stable profile vector
        .all()
    )
    for skill_name, module_name, grade in rows:
        key = (skill_name or "").strip().lower()
        if not key:
            continue
        weight = grade_weight(grade)
        current = profile.get(key)
        if current is None or weight > current.weight:
            profile[key] = SkillEvidence(skill_name.strip(), weight, "module", module_name, grade)

    # Self-declared evidence only adds skills the academic record doesn't already cover
    def add_self_declared(names, source, source_name):
        for name in names or []:
            key = (name or "").strip().lower()
            if key and key not in profile:
                profile[key] = SkillEvidence(name.strip(), SELF_DECLARED_WEIGHT, source, source_name)

    for p in db.query(UserProject).filter(UserProject.user_id == user_id).order_by(UserProject.id):
        add_self_declared(p.extracted_skills, "project", f"Project: {p.name}")
    for c in db.query(UserCertification).filter(UserCertification.user_id == user_id).order_by(UserCertification.id):
        add_self_declared(c.mapped_skills, "cert", f"Certification: {c.cert_name}")

    return profile


def count_modules(user_id: int, db: Session) -> int:
    return db.query(UserModule).filter(UserModule.user_id == user_id).count()


def normalise_rows(vecs: np.ndarray) -> np.ndarray:
    """L2-normalise each row, so cosine similarity becomes a plain matmul."""
    return vecs / (np.linalg.norm(vecs, axis=1, keepdims=True) + 1e-8)


def skill_coverage(grad_vecs_normed: np.ndarray, job_skill_vecs_normed: np.ndarray, total: int) -> int:
    """How many of the job's skills the student covers (best similarity >= MATCH_THRESHOLD).
    The same rule Skill Gap uses, so Job Matches and Job Detail always agree."""
    if not total or not len(grad_vecs_normed):
        return 0
    best = (job_skill_vecs_normed @ grad_vecs_normed.T).max(axis=1)
    return int((best >= MATCH_THRESHOLD).sum())
