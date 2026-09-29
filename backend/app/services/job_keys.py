"""
When are two live job postings "the same job"?

JSearch can return one posting several times with different ids (e.g. listed by two
publishers, or fetched again on another day). We treat two live jobs as the same when
their title, company and location match after normalising case, punctuation and spacing.

Location is part of the key on purpose: the same title at the same company in
Kuala Lumpur and in Penang are two real openings, not a duplicate.

Used by scripts/live_jobs/fetch_live_jobs.py (don't insert a duplicate) and
scripts/tools/remove_duplicate_jobs.py (clean up existing ones), so both use one rule.
"""
import re


def _norm(text: str | None) -> str:
    text = (text or "").lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)   # "Graduate-Program (KL)" -> "graduate program kl"
    return " ".join(text.split())


def job_key(title: str | None, company: str | None, location: str | None) -> tuple[str, str, str]:
    return (_norm(title), _norm(company), _norm(location))
