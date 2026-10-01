"""
How a job's skills count (fix plan Stage 3A, 1 Oct). Used by /recommend and /skillgap, so both pages agree.

Each job skill has a level (required / preferred / trained / unspecified), a type (hard / soft) and maybe an
alternative_group (the ad accepts any one of the group, e.g. "C#, Python, or equivalent"). Stage 1 stores
these; skills extracted before Stage 1 have none, and are treated exactly as before: every skill a
requirement on its own. So nothing changes until a job is re-extracted.

  core      = hard skills that are required                 -> the displayed coverage %
  duty      = hard skills that are unspecified (mostly from the duties) -> used only if the ad requires nothing
  bonus     = hard skills that are preferred               -> "nice to have" box + small ranking bonus
  learn     = skills the role will teach (trained)          -> never a gap, not shown
  soft      = soft skills                                   -> not in the %, not shown (they are in the description)
An either-or group counts as one requirement, met if the student has any member.
Fallback when an ad lists no required hard skill: score on its unspecified skills (basis "unspecified"),
and if there are none either, on its preferred skills (basis "preferred"), so it never shows a fake 0% or 100%.

Why unspecified is a fallback, not core (1 Oct, v8 dry run on 6 unseen ads): sentence-by-sentence extraction
labels most duty phrases "unspecified" ("URL structure", "Escalation management"), up to ~40 per ad, which
diluted the % for every student; and on NEXTDC x 4 the required skills were near-identical (18/18/18/22),
while the items that changed between runs were all unspecified (config backup, bulk changes...).

Why: required qualifications decide eligibility and preferred ones separate stronger candidates (UIC
screening guidance); one clear meaning per number keeps the explanation honest. The ranking bonus weight
is a design choice (references.md, "Scoring must-have vs nice-to-have").
"""
from dataclasses import dataclass

from app.services.skill_names import canonical_key

BONUS_WEIGHT = 0.05      # ranking only: at most +0.05 for having every nice-to-have skill (< one level step, 0.12)


@dataclass
class JobSkillItem:
    name: str
    key: str
    level: str | None = None
    skill_type: str | None = None
    group: str | None = None

    @property
    def tier(self) -> str:
        if self.skill_type == "soft":
            return "soft"
        if self.level == "trained":
            return "learn"
        if self.level == "preferred":
            return "bonus"
        if self.level == "unspecified":
            return "duty"
        return "core"            # required, or no level (skills extracted before Stage 1: counted as before)


def job_skill_items(rows) -> list[JobSkillItem]:
    """One item per canonical skill (A8), first row wins, like dedupe_skills: "Python" and "Python programming"
    are one requirement. rows: JobSkill objects in id order."""
    items, seen = [], set()
    for r in rows:
        name = r.skill_name or ""          # not stripped: the same text dedupe_skills() keeps (same embeddings)
        key = canonical_key(name)
        if not key or key in seen:
            continue
        seen.add(key)
        items.append(JobSkillItem(name, key, getattr(r, "level", None), getattr(r, "skill_type", None),
                                  (getattr(r, "alternative_group", None) or "").strip() or None))
    return items


def units(items: list[JobSkillItem], tier: str) -> list[list[int]]:
    """Requirements of one tier as lists of item indexes: an either-or group is one unit, others alone."""
    out, by_group = [], {}
    for i, it in enumerate(items):
        if it.tier != tier:
            continue
        if it.group:
            g = it.group.lower()
            if g not in by_group:
                by_group[g] = len(out)
                out.append([])
            out[by_group[g]].append(i)
        else:
            out.append([i])
    return out


def unit_name(items: list[JobSkillItem], unit: list[int]) -> str:
    """"Python" or, for a group, "C# or Python"."""
    names = [items[i].name for i in unit]
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " or " + names[-1]


def score_job(items: list[JobSkillItem], has) -> dict:
    """has[i] = the student has item i. Returns the coverage shown to the student and the parts around it."""
    core, bonus = units(items, "core"), units(items, "bonus")
    basis = "required"
    if not core:                      # nothing required: the unspecified skills, else the preferred ones
        duty = units(items, "duty")
        if duty:
            core, basis = duty, "unspecified"
        elif bonus:
            core, bonus, basis = bonus, [], "preferred"
    met = [any(has[i] for i in u) for u in core]
    bonus_met = [any(has[i] for i in u) for u in bonus]
    total = len(core)
    return {
        "basis": basis,
        "core_units": core,
        "core_met": met,
        "matched": sum(met),
        "total": total,
        "coverage": round(sum(met) / total * 100, 1) if total else 0.0,
        "bonus_units": bonus,
        "bonus_met": bonus_met,
        "bonus_ratio": sum(bonus_met) / len(bonus) if bonus else 0.0,
        "learn": [it.name for it in items if it.tier == "learn"],
        "soft": [it.name for it in items if it.tier == "soft"],
    }
