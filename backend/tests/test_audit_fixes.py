"""Fixes from the two 14 Oct audits: the first decision date is kept when it moves, "where you stand" compares recent
counts only, the on-time record needs 3 judged jobs, the accepted privacy notice version is stored, deleting an
account can be retried after a partial failure, and chats expire after 18 months without use."""
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from conftest import PASSWORD, sql
from test_transparency import _apply, _mine, _post


def test_moving_the_decision_date_keeps_the_first_one(client, users):
    employer, student = users.employer(), users.student()
    job = _post(client, users, employer, days=14).json()
    first = job["decide_by"]
    app_id = _apply(client, users, student, job)
    r = client.post(f"/employer/jobs/{job['id']}/extend", headers=users.h(employer),
                    json={"days": 7, "reason": "Interviews take longer than planned"})
    assert r.status_code == 200 and r.json()["decide_by_original"] == first and r.json()["decide_by"] != first
    assert _mine(client, users, student, app_id)["decide_by_original"] == first


def test_where_you_stand_works_out_old_counts_again(client, users, db):
    employer = users.employer()
    job = _post(client, users, employer).json()
    best = users.student(skills=("Python", "SQL"))
    best_app = _apply(client, users, best, job)
    others = [_apply(client, users, users.student(skills=("Python", "SQL")), job) for _ in range(4)]
    # pretend two others' stored counts are wrong: one recent (kept, within a day), one two days old (worked out again)
    now = datetime.now(timezone.utc)
    sql(db, "update applications set match_have=0, match_at=:t where id=:i", t=now - timedelta(hours=1), i=others[0])
    sql(db, "update applications set match_have=0, match_at=:t where id=:i", t=now - timedelta(days=2), i=others[1])
    m = _mine(client, users, best, best_app)
    assert m["stand"]["ahead_of"] == 1                          # only the recent wrong count is still below hers
    assert sql(db, "select match_have from applications where id=:i", i=others[1]).scalar() == 2
    assert sql(db, "select match_at from applications where id=:i", i=others[1]).scalar() > now - timedelta(minutes=1)


def test_on_time_record_is_shown_from_three_judged_jobs(client, users, db):
    employer, student = users.employer(), users.student()
    past = datetime.now(timezone.utc) - timedelta(minutes=1)
    app_ids = []
    for n in range(3):
        job = _post(client, users, employer).json()
        app_ids.append(_apply(client, users, student, job))
        client.patch(f"/employer/applications/{app_ids[-1]}", headers=users.h(employer), json={"status": "rejected"})
        sql(db, "update jobs set decide_by=:t where id=:i", t=past, i=job["id"])
        _decided_at(db, app_ids[-1], past - timedelta(days=1))
        rec = _mine(client, users, student, app_ids[-1])["employer_record"]
        assert rec == {"on_time": n + 1, "of": n + 1, "shown": n == 2}


def _decided_at(db, app_id, t):
    """Move an application's decision (its status history and last change) to time t."""
    sql(db, "update applications set status_changed_at=:t where id=:i", t=t, i=app_id)
    sql(db, "update application_events set created_at=:t where application_id=:i and kind='status'", t=t, i=app_id)


def _judged_job(client, users, db, employer, student, decided_offset=None, due_offset=timedelta(minutes=-1)):
    """A job with one applicant, its date `due_offset` from now; decided `decided_offset` relative to the date."""
    job = _post(client, users, employer).json()
    app_id = _apply(client, users, student, job)
    due = datetime.now(timezone.utc) + due_offset
    if decided_offset is not None:
        client.patch(f"/employer/applications/{app_id}", headers=users.h(employer), json={"status": "rejected"})
        _decided_at(db, app_id, due + decided_offset)
    sql(db, "update jobs set decide_by=:t where id=:i", t=due, i=job["id"])
    return job, app_id, due


def test_on_time_boundaries(client, users, db):
    """Exactly on the date is on time; a second late is late; a correction after the date keeps the first answer;
    closing before the date judges it at once (on time); closing after the date is late."""
    from app.services.transparency import employer_record
    student = users.student()
    cases = []
    e = users.employer()
    job, a, due = _judged_job(client, users, db, e, student, decided_offset=timedelta(0))
    cases.append((e, 1, "decided exactly on the date"))
    e = users.employer()
    job, a, due = _judged_job(client, users, db, e, student, decided_offset=timedelta(seconds=1))
    cases.append((e, 0, "decided a second after the date"))
    e = users.employer()
    job, a, due = _judged_job(client, users, db, e, student, decided_offset=-timedelta(days=1))
    client.patch(f"/employer/applications/{a}", headers=users.h(e), json={"status": "accepted"})   # corrected now
    cases.append((e, 1, "Not selected on time, corrected to Accepted after the date"))
    e = users.employer()
    job, a, due = _judged_job(client, users, db, e, student, due_offset=timedelta(days=10))
    client.patch(f"/employer/jobs/{job['id']}", headers=users.h(e), json={"closed": True, "reason": "not_filling"})
    cases.append((e, 1, "closed before the date: everyone told at once"))
    e = users.employer()
    job, a, due = _judged_job(client, users, db, e, student)
    client.patch(f"/employer/jobs/{job['id']}", headers=users.h(e), json={"closed": True, "reason": "not_filling"})
    cases.append((e, 0, "closed after the date"))
    for e, expected, what in cases:
        assert employer_record(users.ids[e], db) == {"on_time": expected, "of": 1, "shown": False}, what


def test_an_undone_decision_does_not_count(client, users, db):
    """Not selected on time, then undone: no answer stands, so after the date the job is late."""
    from app.services.transparency import employer_record
    e, student = users.employer(), users.student()
    job, a, due = _judged_job(client, users, db, e, student, decided_offset=-timedelta(days=1))
    r = client.patch(f"/employer/applications/{a}", headers=users.h(e), json={"status": "rejected", "undo": True})
    assert r.status_code == 200 and r.json()["status"] == "applied"
    assert employer_record(users.ids[e], db) == {"on_time": 0, "of": 1, "shown": False}


def test_sign_up_stores_the_notice_version_the_page_shows(client, users, db):
    from app.routers.auth import PRIVACY_VERSION
    text = (Path(__file__).resolve().parents[2] / "frontend/src/pages/privacyText.js").read_text(encoding="utf-8")
    newest = re.search(r"export const VERSIONS = \[\s*\{\s*date: '([\d-]+)'", text).group(1)
    assert PRIVACY_VERSION == newest                             # change both when the notice changes
    student = users.student()
    assert sql(db, "select privacy_version from users where id=:i", i=users.ids[student]).scalar() == newest


def test_delete_can_be_retried_after_postgres_fails(client, users, db, monkeypatch):
    import app.mongo
    import app.routers.auth as auth

    class Chats:
        deleted = 0

        def delete_many(self, query):
            Chats.deleted += 1
    monkeypatch.setattr(app.mongo, "chat_sessions", lambda: Chats())
    real = auth.delete_student_data

    def broken(user, session):
        real(user, session)                                      # rows deleted in the transaction, then it fails
        raise RuntimeError("database went away")
    monkeypatch.setattr(auth, "delete_student_data", broken)
    student = users.student()
    sid = users.ids[student]
    r = client.post("/auth/me/delete", headers=users.h(student), json={"password": PASSWORD})
    assert r.status_code == 500 and "try again" in r.json()["detail"]
    assert sql(db, "select count(*) from users where id=:i", i=sid).scalar() == 1      # rolled back: account intact
    monkeypatch.setattr(auth, "delete_student_data", real)
    r = client.post("/auth/me/delete", headers=users.h(student), json={"password": PASSWORD})
    assert r.status_code == 204 and Chats.deleted == 2
    assert sql(db, "select count(*) from users where id=:i", i=sid).scalar() == 0


def test_chats_expire_after_18_months_without_use(monkeypatch):
    import app.mongo as mongo

    class Col:
        def __init__(self):
            self.indexes = []

        def create_index(self, keys, **options):
            self.indexes.append((keys, options))
    col = Col()
    monkeypatch.setattr(mongo, "get_db", lambda: {"chat_sessions": col})
    monkeypatch.setattr(mongo, "_indexes_done", False)
    mongo.chat_sessions()
    ttl = [o for k, o in col.indexes if k == "updated_at"]
    assert ttl and ttl[0]["expireAfterSeconds"] == 548 * 24 * 3600


def test_a_database_one_migration_behind_is_named_then_upgraded(client, db):
    """Upgrade path (audit): a database made before this change refuses to start with the script to run, and that
    script brings it up to date."""
    from conftest import run_migration
    from app.routers.jobs import check_jobs_schema
    from app.routers.profile import check_profile_schema
    sql(db, "alter table jobs drop column decide_by_original")
    sql(db, "alter table users drop column privacy_version")
    try:
        for check in (check_jobs_schema, check_profile_schema):
            with pytest.raises(RuntimeError, match="migrate_record_keeping.py"):
                check()
    finally:
        assert "users marked" in run_migration("migrate_record_keeping")
    check_jobs_schema()
    check_profile_schema()
