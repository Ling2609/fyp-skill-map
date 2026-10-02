"""
Read-only, one-off: where do the abbreviation merges (skill_merge_overrides.json "same") change anything?
  1. live jobs that listed one skill twice (short + long form) -> now counted once
  2. a student's skills that now match a live job skill only because of a merge
Usage (from backend/, venv active):  python check_abbrev_effect.py low1
"""
import json
import sys

sys.path.append(".")

from app.database import SessionLocal
from app.models.job import Job, JobSkill
from app.models.user import User
from app.services.skill_names import canonical_key, skill_key
from app.services.skill_profile import build_skill_profile

same = json.load(open("data/skill_merge_overrides.json", encoding="utf-8")).get("same", [])
pairs = {frozenset((skill_key(a), skill_key(b))) for a, b in same}


def by_merge(x: str, y: str) -> bool:
    return frozenset((skill_key(x), skill_key(y))) in pairs


db = SessionLocal()
try:
    live = {j.id: j for j in db.query(Job).filter(Job.source == "live")}
    skills = {}
    for js in db.query(JobSkill).filter(JobSkill.job_id.in_(live)):
        skills.setdefault(js.job_id, []).append(js.skill_name)

    print("1. Live jobs that listed the same skill twice (now counted once):")
    n = 0
    for jid, names in skills.items():
        dups = {(a, b) for a in names for b in names if a < b and by_merge(a, b)}
        if dups:
            n += 1
            print(f"   {live[jid].job_title} @ {live[jid].company}: {len(names)} listed -> "
                  + "; ".join(f"{a} = {b}" for a, b in sorted(dups)))
    print(f"   {n} of {len(skills)} live jobs\n")

    user = db.query(User).filter((User.username == sys.argv[1]) | (User.email == sys.argv[1])).first()
    if not user:
        sys.exit(f"No user {sys.argv[1]}")
    mine = sorted({sp for ev in build_skill_profile(user.id, db).values() for sp in (ev.spellings or [ev.name])})
    print(f"2. {sys.argv[1]}'s skills that now match a live job skill through a merge:")
    hits = {}
    for jid, names in skills.items():
        for s in mine:
            for t in names:
                if by_merge(s, t) and canonical_key(s) == canonical_key(t):
                    hits.setdefault((s, t), []).append(live[jid].job_title)
    for (s, t), titles in sorted(hits.items()):
        print(f"   {s} = {t}: {len(titles)} job(s), e.g. {titles[0]}")
    if not hits:
        print("   none")
finally:
    db.close()
