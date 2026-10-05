"""
Stage 1 job skills: check the LLM's mentions and store one row per skill. Shared by the live-job fetcher
(scripts/live_jobs/fetch_live_jobs.py) and the bulk re-extraction (scripts/pipeline/extract_job_skills_v2.py),
so a job saved by either one gets exactly the same skills.

  mentions (every sentence that names a skill)
    -> quote check per mention   (evidence.verify_skills: a mention whose words are not in the ad is rejected)
    -> either-or group check     (with all mentions present, so a group keeps all its members)
    -> tidy rules 1-3            (job_skill_tidy: quote names the skill, duty is not "required", listed options grouped)
    -> one entry per skill       (evidence.merge_mentions: strongest level wins, F25)
    -> tidy rule 4               (job_skill_tidy: "CI/CD" and "CI/CD pipelines" are one skill)
"""
from dataclasses import dataclass, field

from app.models.job import JobSkill
from app.services.evidence import merge_mentions, verify_skills
from app.services.job_skill_tidy import (choice_groups, drop_unnamed, duty_levels, merge_descriptor_names,
                                           names_skill)
from app.services.skill_names import canonical_key

MIN_HARD = 3      # fewer hard skills = the extraction failed or the ad says almost nothing: don't save


@dataclass
class CheckedSkills:
    kept: list[dict]                                   # one per skill, ready to save
    rejected: list[dict]                               # skills with no supported mention at all (unsupported)
    mentions: int = 0                                  # mentions the LLM returned
    rejected_mentions: int = 0                         # unsupported mentions, incl. ones of skills kept elsewhere
    tidy: dict = field(default_factory=dict)           # what the tidy rules changed (counts + merged names)
    hard: int = field(init=False)

    def __post_init__(self):
        self.hard = sum(1 for k in self.kept if k.get("type") == "hard")


def skill_key(name: str) -> str:
    return canonical_key(name) or (name or "").strip().lower()


def tidy_skills(items: list[dict], ad_text: str) -> tuple[list[dict], list[dict], dict]:
    """Tidy rules 1-4 on checked mentions (or on a job's saved rows): (kept, rejected, what changed)."""
    items = [dict(it) for it in items]
    items, unnamed = drop_unnamed(items)
    changes = {"unnamed": len(unnamed), "duty": duty_levels(items, ad_text), "grouped": choice_groups(items)}
    one_each = merge_mentions(items, key=skill_key)
    # merge_mentions drops a group when one member is also asked for on its own ("Java" + "e.g. Python, Java, C#"
    # = Java). The other members were only alternatives, so they go too: reported here, never silent.
    left = {skill_key(k["skill"]) for k in one_each}
    gone = {skill_key(it["skill"]): it for it in items if skill_key(it["skill"]) not in left}
    changes["covered"] = [(it["skill"], it.get("alternative_group", "")) for it in gone.values()]
    kept, merged = merge_descriptor_names(one_each)
    changes["merged"] = merged
    return kept, unnamed, changes


def check_job_skills(mentions: list[dict], ad_text: str) -> CheckedSkills:
    """Quote check, group check, tidy and merge. A skill counts as rejected only if none of its mentions is kept."""
    kept_mentions, rejected_mentions = verify_skills(mentions, ad_text)
    kept, unnamed, changes = tidy_skills(kept_mentions, ad_text)
    rejected_mentions += unnamed
    kept_keys = {skill_key(m["skill"]) for m in kept_mentions if names_skill(m)}
    rejected, seen = [], set()
    for r in rejected_mentions:
        kk = skill_key(r["skill"])
        if kk not in kept_keys and kk not in seen:
            seen.add(kk)
            rejected.append(r)
    return CheckedSkills(kept, rejected, len(mentions), len(rejected_mentions), changes)


def job_skill_rows(job, kept: list[dict], version: str) -> list[JobSkill]:
    """JobSkill rows for one job (kept is already one per skill)."""
    return [JobSkill(job_id=job.id, job_ref=job.job_id, skill_name=k["skill"].strip(), extracted_by=version,
                     evidence_quote=k.get("evidence_quote"), level=k.get("level"), skill_type=k.get("type"),
                     match_score=k.get("match_score"), alternative_group=k.get("alternative_group") or None)
            for k in kept]


def replace_job_skills(db, job, kept: list[dict], version: str) -> int:
    """Delete the job's stored skills and save the checked ones (no commit). Returns rows saved."""
    db.query(JobSkill).filter(JobSkill.job_id == job.id).delete()
    rows = job_skill_rows(job, kept, version)
    db.add_all(rows)
    return len(rows)
