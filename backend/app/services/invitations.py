"""
Invitations to apply: how each one ends (25 Oct, her plan "option D"; references.md "Invitations: declining and
ending").

An employer invites a visible graduate who fits a job; the student sees it on their Dashboard and My Applications.
  - applies          -> the employer sees the application (tagged "Invited"), straight away
  - "No thanks"      -> the employer sees "Declined" and the reason, if one was given, straight away
  - no answer        -> after INVITE_DAYS the invitation ends for both: the employer sees "No reply"
  - the job closes   -> it ends with the job
Declining never stops the student from applying later (otherwise ignoring would be safer than answering).
"""
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

INVITE_DAYS = 14        # the same clock as "students are told to look elsewhere after 14 days" (application_progress)
REASONS = {"not_looking": "Not looking right now", "wrong_role": "Not the right role for me",
           "have_offer": "Already have an offer"}
NOTE_MAX = 200


def _aware(t):
    return t.replace(tzinfo=timezone.utc) if t and t.tzinfo is None else t


def expired(inv, now: datetime | None = None) -> bool:
    """No answer within INVITE_DAYS."""
    return _aware(inv.created_at) <= (now or datetime.now(timezone.utc)) - timedelta(days=INVITE_DAYS)


def state(inv, now: datetime | None = None) -> dict | None:
    """What the employer sees about an invitation (None = never invited). An application is shown on its own, so
    this is only asked about graduates who haven't applied."""
    if inv is None:
        return None
    if inv.dismissed_at:
        # 25 Oct (her review: consistent wording): "No reason given" rather than a bare "Declined"
        reason = REASONS.get(inv.decline_reason) or inv.decline_note or "No reason given"
        return {"state": "declined", "label": f"Declined · {reason}", "reason": reason, "at": inv.dismissed_at,
                "invited_at": inv.created_at}
    if expired(inv, now):
        return {"state": "no_reply", "label": "No reply", "at": None, "invited_at": inv.created_at}
    return {"state": "invited", "label": "Invited", "at": inv.created_at, "invited_at": inv.created_at}


def check_reason(reason: str | None, note: str | None) -> tuple[str | None, str | None]:
    """Optional: none, one of REASONS, or "other" with the student's own words (needed, up to NOTE_MAX)."""
    note = " ".join((note or "").split()) or None
    if reason in (None, ""):
        return None, None
    if reason == "other":
        if not note:
            raise HTTPException(status_code=400, detail="Write your reason, or choose one of the others.")
        if len(note) > NOTE_MAX:
            raise HTTPException(status_code=400, detail=f"Keep the reason to {NOTE_MAX} characters.")
        return "other", note
    if reason not in REASONS:
        raise HTTPException(status_code=400, detail="Unknown reason.")
    return reason, None


def answered_by(inv, application) -> bool:
    """25 Oct (her point, backed by Gem's data that sourced candidates are hired far more often than applicants):
    an application is tagged "Invited" only if it answers an invitation that was still open when she applied, i.e.
    not declined before and within INVITE_DAYS. After "No thanks" or "No reply" she applies like everyone else."""
    if inv is None or application is None:
        return False
    applied = _aware(application.created_at)
    if inv.dismissed_at and _aware(inv.dismissed_at) <= applied:
        return False
    return applied < _aware(inv.created_at) + timedelta(days=INVITE_DAYS)
