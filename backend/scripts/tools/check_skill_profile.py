"""
Check a student's skill count (read-only, no Groq, no changes to the database).

Shows where the "Skills Identified" number comes from and how much of it is
near-duplicate wording ("Python" / "Python programming"), i.e. what A8 would merge.

Usage (from backend/, venv active):
  python scripts/tools/check_skill_profile.py <username or email>
  python scripts/tools/check_skill_profile.py <username> --no-sbert   # skip the SBERT check
"""
import re
import sys
from collections import defaultdict

sys.path.append(".")

from app.database import SessionLocal
from app.models.module import Module, ModuleSkill
from app.models.profile import UserCertification, UserProject
from app.models.user import User
from app.models.user_module import UserModule
from app.services.skill_profile import build_skill_profile

SAME_SKILL_SBERT = 0.85   # the A8 threshold for "same skill"

# Generic words that don't change what the skill is ("Python programming" = "Python")
FILLER = {
    "programming", "development", "fundamentals", "fundamental", "basics", "basic",
    "skills", "skill", "concepts", "concept", "principles", "principle", "knowledge",
    "understanding", "techniques", "technique", "introduction", "intro", "to", "of",
    "the", "and", "in", "using", "with", "for",
}


def normalise(name: str) -> str:
    words = re.sub(r"[^a-z0-9+#]+", " ", name.lower()).split()
    core = [w for w in words if w not in FILLER]
    return " ".join(core) or " ".join(words)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    use_sbert = "--no-sbert" not in sys.argv
    if not args:
        print(__doc__)
        return
    who = args[0].strip().lower()

    db = SessionLocal()
    try:
        user = db.query(User).filter((User.username == who) | (User.email == who)).first()
        if not user:
            print(f"No user '{who}'")
            return

        # ── 1. Raw rows per module (what extraction stored) ─────────────────────
        print(f"\nStudent: {user.username}\n")
        print("MODULES (skills stored per module)")
        raw_total = 0
        saved = db.query(UserModule).filter(UserModule.user_id == user.id).order_by(UserModule.id).all()
        for um in saved:
            mod = db.query(Module).filter(Module.code == um.module_code).first()
            if not mod:
                print(f"  {um.module_code}: NOT IN MODULE CATALOGUE (contributes 0)")
                continue
            rows = db.query(ModuleSkill).filter(ModuleSkill.module_id == mod.id).all()
            raw_total += len(rows)
            by = sorted({r.extracted_by or "?" for r in rows})
            print(f"  {mod.code}  {mod.name}  (grade {um.grade})  {len(rows)} skills  [extracted_by: {', '.join(by)}]")
            print("     " + "; ".join(r.skill_name for r in rows))

        projects = db.query(UserProject).filter(UserProject.user_id == user.id).all()
        certs = db.query(UserCertification).filter(UserCertification.user_id == user.id).all()
        raw_proj = sum(len(p.extracted_skills or []) for p in projects)
        raw_cert = sum(len(c.mapped_skills or []) for c in certs)

        # ── 2. The number the app shows ─────────────────────────────────────────
        profile = build_skill_profile(user.id, db)
        by_src = defaultdict(int)
        for ev in profile.values():
            by_src[ev.source] += 1
        print("\nCOUNT")
        print(f"  Raw rows: {raw_total} from {len(saved)} modules, {raw_proj} from projects, {raw_cert} from certs")
        print(f"  Shown as 'Skills Identified' (unique, case-insensitive): {len(profile)}")
        print(f"     modules {by_src['module']} · projects {by_src['project']} · certs {by_src['cert']}")

        # ── 3. Near-duplicates (what A8 would merge) ────────────────────────────
        names = [ev.name for ev in profile.values()]
        parent = list(range(len(names)))

        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i

        def union(i, j):
            parent[find(i)] = find(j)

        first_with_key = {}
        for i, n in enumerate(names):
            key = normalise(n)
            if key in first_with_key:
                union(i, first_with_key[key])
            else:
                first_with_key[key] = i

        if use_sbert and len(names) > 1:
            import numpy as np
            from app.nlp.embedder import get_embedder
            from app.services.skill_profile import normalise_rows
            vecs = normalise_rows(get_embedder().embed_cached(names))
            sim = vecs @ vecs.T
            for i, j in zip(*np.where(np.triu(sim, 1) >= SAME_SKILL_SBERT)):
                union(int(i), int(j))

        groups = defaultdict(list)
        for i, n in enumerate(names):
            groups[find(i)].append(n)
        merged = [g for g in groups.values() if len(g) > 1]

        method = f"wording + SBERT ≥ {SAME_SKILL_SBERT}" if use_sbert else "wording only"
        print(f"\nNEAR-DUPLICATES ({method})")
        if not merged:
            print("  none found")
        for g in sorted(merged, key=len, reverse=True):
            print("  " + "  =  ".join(g))
        print(f"\n  Distinct skills after merging: {len(groups)}  (shown now: {len(profile)})")
    finally:
        db.close()


if __name__ == "__main__":
    main()
