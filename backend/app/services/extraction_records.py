"""
MongoDB `extraction_records` (14 Oct; planned 13 Oct, docs/data_flow.md gap 1): every time the AI reads skills, what
it proposed, what SkillMap's checks kept and rejected (with the reason), and later what a person changed. Until now
only the accepted skills were kept, so the AI's mistakes and the human corrections were lost; these records let the
evaluation measure them from real use (scripts/tools/extraction_report.py).

One document per extraction:
    {kind: "job_ad" | "module" | "project", source: "emp_12" / module code / project id or None, user_id (projects),
     at, model, prompt_version, proposed: [...], kept: [...], rejected: [{skill, quote, reason}], tidy: {...},
     outcome: "saved" | "too_few" | "ai_failed" | "suggested", reviews: [{at, by, added, removed, level_changed}]}

Why MongoDB (as chats): a self-contained document whose shape differs by kind (job ads have levels and groups,
modules don't), written once, appended to (reviews), read whole. The text the AI read is NOT copied here: it is in
PostgreSQL already (jobs.description, modules.description, user_projects.description).

Never in the way: if MongoDB can't be reached, extraction works exactly as before and the log says "not saved". After
a failure, writes are skipped for DOWN_PAUSE seconds, so a bulk run with MongoDB off isn't slowed by 2 s per job.
Privacy: project records hold a student's skills and short quotes; deleted with the account, included in Download my
data, said in the privacy notice.
"""
import time
import uuid
from datetime import datetime, timezone

from pymongo import ASCENDING, DESCENDING

DOWN_PAUSE = 60          # seconds without trying again after MongoDB failed
_state = {"down_until": 0.0, "indexes": False}


def _col():
    from app.mongo import get_db
    col = get_db()["extraction_records"]
    if not _state["indexes"]:
        col.create_index([("kind", ASCENDING), ("source", ASCENDING), ("at", DESCENDING)])
        col.create_index("user_id", sparse=True)
        _state["indexes"] = True
    return col


def _try(action, what: str):
    """Run a MongoDB write; on any failure log it, pause writes for a while, and carry on."""
    if time.monotonic() < _state["down_until"]:
        return None
    try:
        return action(_col())
    except Exception as e:                       # MongoDB off, timeout, bad document: never break the caller
        _state["down_until"] = time.monotonic() + DOWN_PAUSE
        print(f"[records] {what} not saved: {type(e).__name__}")
        return None


def _skill(item) -> dict:
    """A proposed / kept / rejected skill, trimmed to what the evaluation needs."""
    if isinstance(item, str):
        return {"skill": item}
    out = {"skill": item.get("skill") or item.get("name")}
    for key in ("evidence_quote", "quote", "level", "type", "alternative_group", "reason"):
        if item.get(key):
            out["quote" if key == "evidence_quote" else key] = item[key]
    return out


def record(kind: str, *, model: str, prompt_version: str, proposed, kept, rejected=(), outcome: str,
           source=None, user_id: int | None = None, tidy: dict | None = None) -> str | None:
    """Save one extraction; returns its id (to attach a later review), or None if it couldn't be saved."""
    doc = {"_id": uuid.uuid4().hex, "kind": kind, "source": None if source is None else str(source),
           "at": datetime.now(timezone.utc), "model": model, "prompt_version": prompt_version,
           "proposed": [_skill(x) for x in (proposed or []) if x], "kept": [_skill(x) for x in (kept or []) if x],
           "rejected": [_skill(x) for x in (rejected or []) if x], "outcome": outcome, "reviews": []}
    if user_id is not None:
        doc["user_id"] = user_id
    if tidy:
        doc["tidy"] = {k: v for k, v in tidy.items() if v}
    return _try(lambda c: c.insert_one(doc).inserted_id, f"{kind} record")


def _names(items) -> dict[str, str]:
    """{lower-case name: name as written} for a list of names or skill dicts."""
    out = {}
    for x in items or []:
        name = x if isinstance(x, str) else (x.get("skill") or x.get("name") or "")
        name = " ".join(str(name).split())
        if name:
            out.setdefault(name.lower(), name)
    return out


def diff(before, after, levels_before: dict | None = None, levels_after: dict | None = None) -> dict:
    """What a person changed: skills added, removed, and (job ads) moved to another level."""
    b, a = _names(before), _names(after)
    changed = []
    if levels_before is not None and levels_after is not None:
        lb = {k.lower(): v for k, v in levels_before.items()}
        la = {k.lower(): v for k, v in levels_after.items()}
        changed = [{"skill": a[k], "from": lb[k], "to": la[k]} for k in a if k in b and lb.get(k) and la.get(k)
                   and lb[k] != la[k]]
    return {"added": [a[k] for k in a if k not in b], "removed": [b[k] for k in b if k not in a],
            "level_changed": changed}


def add_review(record_id: str | None, by: str, change: dict, source=None, user_id: int | None = None) -> bool:
    """Append what a person changed to a record (and set its source once known, e.g. the job created on publish).
    The user_id check stops a student attaching a review to someone else's record."""
    if not record_id:
        return False
    review = {"at": datetime.now(timezone.utc), "by": by, **change}
    query = {"_id": record_id}
    if user_id is not None:
        query["user_id"] = user_id
    update = {"$push": {"reviews": review}}
    if source is not None:
        update["$set"] = {"source": str(source)}
    return bool(_try(lambda c: c.update_one(query, update).matched_count, f"review of {record_id}"))


def review_against(record_id: str | None, by: str, after, source=None, user_id: int | None = None,
                   levels_after: dict | None = None) -> bool:
    """Compare what a person finally saved with what the AI's record kept, and append that as a review (the
    pop-up flows: a student's project, an employer's job, a new module). The user_id check stops a student
    attaching a review to someone else's record."""
    if not record_id:
        return False
    def push(c):
        query = {"_id": record_id}
        if user_id is not None:
            query["user_id"] = user_id
        doc = c.find_one(query, projection={"kept": 1})
        if not doc:
            return 0
        kept = doc.get("kept") or []
        levels_before = {k["skill"]: k.get("level") for k in kept if k.get("level")} if levels_after else None
        review = {"at": datetime.now(timezone.utc), "by": by, **diff(kept, after, levels_before, levels_after)}
        update = {"$push": {"reviews": review}}
        if source is not None:
            update["$set"] = {"source": str(source)}
        return c.update_one({"_id": record_id}, update).matched_count
    return bool(_try(push, f"review of {record_id}"))


def review_latest(kind: str, source, by: str, change: dict) -> bool:
    """Append a review to the newest record for this item (a module's skills changed by the career office)."""
    if not any(change.get(k) for k in ("added", "removed", "level_changed")):
        return False
    def push(c):
        doc = c.find_one({"kind": kind, "source": str(source)}, sort=[("at", DESCENDING)], projection={"_id": 1})
        if not doc:
            return 0
        return c.update_one({"_id": doc["_id"]},
                            {"$push": {"reviews": {"at": datetime.now(timezone.utc), "by": by, **change}}}).matched_count
    return bool(_try(push, f"review of {kind} {source}"))


def for_user(user_id: int) -> list[dict]:
    """A student's project records, for Download my data. Raises if MongoDB can't be reached (the caller says so)."""
    return list(_col().find({"user_id": user_id}, projection={"_id": 0, "user_id": 0}).sort("at", ASCENDING))


def delete_for_user(user_id: int):
    """Delete a student's records (account deletion). Raises if MongoDB can't be reached, so nothing is half-deleted."""
    _col().delete_many({"user_id": user_id})
