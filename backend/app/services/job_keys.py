"""
When are two live job postings "the same job"?

JSearch can return one posting several times with different ids (e.g. listed by two
publishers, or fetched again on another day). We treat two live jobs as the same when
their title, company and location match after normalising case, punctuation and spacing.

Location is part of the key on purpose: the same title at the same company in
Kuala Lumpur and in Penang are two real openings, not a duplicate.

27 Nov (her review): a title written with a space and without one is the same role, so the
title is compared with its spaces removed: "Front End", "Front-end" and "Frontend" are one
word by then, and the same holds for "full stack", "dev ops", "cyber security", "node js",
"react js", "ui ux", "ms sql". That covers every such pair at once, instead of a list that
would always be missing the next one. Two spellings that spacing cannot fix keep a small
rule of their own: ".NET"/"Dotnet" -> "net", and "systems" -> "system".

Company and location are compared as before (lower case, punctuation and spacing collapsed,
spaces kept), so nothing about *which* company or *which* place changes.

Used by scripts/live_jobs/fetch_live_jobs.py (don't insert a duplicate) and
scripts/tools/remove_duplicate_jobs.py (clean up existing ones), so both use one rule.
"""
import re


def _norm(text: str | None) -> str:
    text = (text or "").lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)   # "Graduate-Program (KL)" -> "graduate program kl"
    return " ".join(text.split())


# Spellings that removing spaces cannot bring together (word is different, not split)
ROLE_ALIASES = [
    (r"\bdot\s?net\b", "net"),     # ".NET" already becomes "net"; "Dotnet" / "Dot NET" become it too
    (r"\bsystems?\b", "system"),   # "Systems Analyst" = "System Analyst"
]


def role_key(title: str | None) -> str:
    """The title as one string: "'Front-End' Engineer" and "Frontend Engineer" give the same key."""
    text = _norm(title)
    for pattern, spelling in ROLE_ALIASES:
        text = re.sub(pattern, spelling, text)
    return text.replace(" ", "")


def job_key(title: str | None, company: str | None, location: str | None) -> tuple[str, str, str]:
    return (role_key(title), _norm(company), _norm(location))
