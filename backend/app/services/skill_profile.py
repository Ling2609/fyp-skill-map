"""
Graduate Skill Profile: the one place a student's skills are built.

Used by /recommend, /skillgap and /profile/skills (which feeds the chatbot), so
every page works from the same skills, the same weights and the same thresholds.

Built live from the source tables on each request (modules + grades, projects,
certifications). That's 3 small queries, far cheaper than the SBERT work that
follows, and it can never go stale when a project or certification changes.
"""
from dataclasses import dataclass, field

import numpy as np
from sqlalchemy.orm import Session

from app.models.module import Module, ModuleSkill
from app.models.profile import UserCertification, UserProject
from app.models.user_module import UserModule
from app.services.skill_names import canonical_key

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
    spellings: list[str] = field(default_factory=list)   # every spelling of this skill in the profile (A8)


def build_skill_profile(user_id: int, db: Session) -> dict[str, SkillEvidence]:
    """The student's skills, keyed by canonical skill (app/services/skill_names.py), so "Python",
    "python" and "Python programming" count once. Module evidence wins over project/cert evidence (it carries a grade);
    between modules, the best grade wins. Every spelling is kept (SkillEvidence.spellings) and matched,
    so merging spellings never loses a match one of them would have found."""
    profile: dict[str, SkillEvidence] = {}
    spellings: dict[str, dict[str, str]] = {}      # key -> {lower-case spelling: spelling}

    def seen(key, name):
        spellings.setdefault(key, {}).setdefault(name.strip().lower(), name.strip())

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
        key = canonical_key(skill_name)
        if not key:
            continue
        seen(key, skill_name)
        weight = grade_weight(grade)
        current = profile.get(key)
        if current is None or weight > current.weight:
            profile[key] = SkillEvidence(skill_name.strip(), weight, "module", module_name, grade)

    # Self-declared evidence only adds skills the academic record doesn't already cover
    def add_self_declared(names, source, source_name):
        for name in names or []:
            key = canonical_key(name)
            if key:
                seen(key, name)
            if key and key not in profile:
                profile[key] = SkillEvidence(name.strip(), SELF_DECLARED_WEIGHT, source, source_name)

    for p in db.query(UserProject).filter(UserProject.user_id == user_id).order_by(UserProject.id):
        add_self_declared(p.extracted_skills, "project", f"Project: {p.name}")
    for c in db.query(UserCertification).filter(UserCertification.user_id == user_id).order_by(UserCertification.id):
        add_self_declared(c.mapped_skills, "cert", f"Certification: {c.cert_name}")

    for key, ev in profile.items():     # the shown name first, then the other spellings
        ev.spellings = [ev.name] + [s for low, s in spellings[key].items() if low != ev.name.lower()]
    return profile


def profile_spellings(profile: dict[str, SkillEvidence]) -> tuple[list[str], list[str], list[int]]:
    """One row per spelling: (spellings, their canonical keys, index of their skill in the profile)."""
    names, keys, owner = [], [], []
    for g, (key, ev) in enumerate(profile.items()):
        for s in ev.spellings or [ev.name]:
            names.append(s)
            keys.append(key)
            owner.append(g)
    return names, keys, owner


def count_modules(user_id: int, db: Session) -> int:
    return db.query(UserModule).filter(UserModule.user_id == user_id).count()


def normalise_rows(vecs: np.ndarray) -> np.ndarray:
    """L2-normalise each row, so cosine similarity becomes a plain matmul."""
    return vecs / (np.linalg.norm(vecs, axis=1, keepdims=True) + 1e-8)


def similarity_matrix(job_vecs_normed: np.ndarray, spelling_vecs_normed: np.ndarray,
                      job_keys: list[str], spelling_keys: list[str], owner: list[int]) -> np.ndarray:
    """sims[j, g] = how close job skill j is to graduate skill g: the best of g's spellings
    (rows from profile_spellings). The same canonical skill ("MS SQL Server" / "SQL Server")
    counts as identical (1.0), whatever SBERT says."""
    rows = job_vecs_normed @ spelling_vecs_normed.T
    key_row = {k: r for r, k in enumerate(spelling_keys)}
    for j, k in enumerate(job_keys):
        r = key_row.get(k)
        if r is not None:
            rows[j, r] = 1.0
    owner = np.asarray(owner)
    sims = np.full((rows.shape[0], owner.max() + 1), -1.0)
    for g in range(sims.shape[1]):
        sims[:, g] = rows[:, owner == g].max(axis=1)
    return sims


def skill_coverage(spelling_vecs_normed: np.ndarray, job_skill_vecs_normed: np.ndarray, total: int,
                   spelling_keys: list[str], owner: list[int], job_keys: list[str]) -> int:
    """How many of the job's skills the student covers (best similarity >= MATCH_THRESHOLD).
    The same rule Skill Gap uses, so Job Matches and Job Detail always agree."""
    if not total or not len(spelling_vecs_normed):
        return 0
    best = similarity_matrix(job_skill_vecs_normed, spelling_vecs_normed, job_keys, spelling_keys, owner).max(axis=1)
    return int((best >= MATCH_THRESHOLD).sum())
