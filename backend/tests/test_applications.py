"""Applying on SkillMap and the student's progress: Applied -> Viewed -> Shortlisted -> Decision."""
import threading
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.main import app
from conftest import sql


def mine(client, users, student, app_id):
    return next(a for a in client.get("/applications/mine", headers=users.h(student)).json() if a["id"] == app_id)


def apply(client, users, student, job):
    return client.post("/applications", headers=users.h(student), json={"job_id": job["job_ref"]})


def test_apply_once_with_progress(client, users, post_job):
    employer, student = users.employer(), users.student()
    job = post_job(employer)
    r = apply(client, users, student, job)
    assert r.status_code == 200, r.text
    p = r.json()["progress"]
    assert [s["key"] for s in p["steps"]] == ["applied", "viewed", "shortlisted", "decision"] and p["stage"] == "applied"
    assert apply(client, users, student, job).status_code == 409


def test_student_without_skills_cannot_apply(client, users, post_job):
    job = post_job(users.employer())
    assert apply(client, users, users.student(skills=()), job).status_code == 400


def test_simultaneous_applies_give_one_application_no_server_error(client, users, post_job):
    job, student = post_job(users.employer()), users.student()
    h, codes = users.h(student), []
    def go():
        with TestClient(app) as c:
            codes.append(c.post("/applications", headers=h, json={"job_id": job["job_ref"]}).status_code)
    threads = [threading.Thread(target=go) for _ in range(4)]
    [t.start() for t in threads]; [t.join() for t in threads]
    assert sorted(codes).count(200) == 1 and set(codes) <= {200, 409}, codes


def test_cannot_apply_to_closed_or_gone_or_live_jobs(client, users, post_job, db):
    employer, student = users.employer(), users.student()
    closed = post_job(employer, title="Closed job")
    client.patch(f"/employer/jobs/{closed['id']}", headers=users.h(employer), json={"closed": True, "reason": "not_filling"})
    assert apply(client, users, student, closed).status_code == 400
    gone = post_job(employer, title="Gone job")
    sql(db, "update jobs set gone_at=now() where id=:i", i=gone["id"])
    assert apply(client, users, student, gone).status_code == 400
    sql(db, "update jobs set source='live' where id=:i", i=gone["id"])
    assert apply(client, users, student, gone).status_code == 404


def test_viewed_is_recorded_when_the_profile_is_opened_not_the_list(client, users, post_job, db):
    employer, student = users.employer(), users.student()
    job = post_job(employer)
    app_id = apply(client, users, student, job).json()["id"]
    client.get(f"/employer/jobs/{job['id']}/applicants", headers=users.h(employer))
    assert mine(client, users, student, app_id)["progress"]["stage"] == "applied"
    client.get(f"/employer/applications/{app_id}", headers=users.h(employer))
    client.get(f"/employer/applications/{app_id}", headers=users.h(employer))
    assert sql(db, "select count(*) from application_events where application_id=:i and kind='viewed'", i=app_id).scalar() == 1
    p = mine(client, users, student, app_id)["progress"]
    assert p["stage"] == "viewed" and p["steps"][1]["at"]


def test_status_set_from_the_list_counts_as_viewed(client, users, post_job):
    employer, student = users.employer(), users.student()
    job = post_job(employer)
    app_id = apply(client, users, student, job).json()["id"]
    client.patch(f"/employer/applications/{app_id}", headers=users.h(employer), json={"status": "shortlisted"})
    p = mine(client, users, student, app_id)["progress"]
    assert p["steps"][1]["at"] and p["stage"] == "shortlisted"


def test_shortlist_back_and_again_then_reject_then_correct(client, users, post_job):
    employer, student = users.employer(), users.student()
    job = post_job(employer)
    app_id = apply(client, users, student, job).json()["id"]
    set_ = lambda st: client.patch(f"/employer/applications/{app_id}", headers=users.h(employer), json={"status": st})
    set_("shortlisted"); set_("applied")
    assert mine(client, users, student, app_id)["progress"]["steps"][2]["at"] is None
    set_("shortlisted")
    assert mine(client, users, student, app_id)["progress"]["steps"][2]["at"]
    set_("rejected")
    m = mine(client, users, student, app_id)
    assert m["status_label"] == "Not selected" and m["progress"]["steps"][3]["label"] == "Not selected"
    set_("shortlisted")
    m = mine(client, users, student, app_id)
    assert m["status_label"] == "Shortlisted" and m["progress"]["steps"][3]["at"] is None


def test_undo_restores_the_previous_status_from_history(client, users, post_job, db):
    employer, student = users.employer(), users.student()
    job = post_job(employer)
    app_id = apply(client, users, student, job).json()["id"]
    client.patch(f"/employer/applications/{app_id}", headers=users.h(employer), json={"status": "shortlisted"})
    r = client.patch(f"/employer/applications/{app_id}", headers=users.h(employer), json={"status": "accepted", "undo": True}).json()
    assert r["status"] == "applied" and r["status_changed_at"] is None, r
    assert sql(db, "select count(*) from application_events where application_id=:i and kind='status'", i=app_id).scalar() == 0
    assert client.patch(f"/employer/applications/{app_id}", headers=users.h(employer), json={"status": "maybe"}).status_code == 400


def test_quiet_applications_get_the_14_day_note_then_no_decision_at_the_date(client, users, post_job, db):
    """14 Oct: the employer's own decision date replaces the 30-day guess."""
    employer, student = users.employer(), users.student()
    job = post_job(employer)
    app_id = apply(client, users, student, job).json()["id"]
    sql(db, "update applications set created_at=:t where id=:i", t=datetime.now(timezone.utc) - timedelta(days=15), i=app_id)
    assert mine(client, users, student, app_id)["progress"]["nudge"] == "keep_applying"
    sql(db, "update jobs set decide_by=:t where id=:i", t=datetime.now(timezone.utc) - timedelta(days=1), i=job["id"])
    assert mine(client, users, student, app_id)["progress"]["nudge"] == "no_decision"
    client.patch(f"/employer/applications/{app_id}", headers=users.h(employer), json={"status": "rejected"})
    assert mine(client, users, student, app_id)["progress"]["nudge"] is None


def test_closing_a_job_with_waiting_applicants(client, users, post_job, db):
    employer = users.employer()
    job = post_job(employer)
    waiting, accepted = users.student(), users.student()
    a1 = apply(client, users, waiting, job).json()["id"]
    a2 = apply(client, users, accepted, job).json()["id"]
    client.patch(f"/employer/applications/{a2}", headers=users.h(employer), json={"status": "accepted"})
    row = next(j for j in client.get("/employer/jobs", headers=users.h(employer)).json() if j["id"] == job["id"])
    assert row["waiting"] == 1
    r = client.patch(f"/employer/jobs/{job['id']}", headers=users.h(employer), json={"closed": True, "reason": "filled_skillmap"}).json()
    assert r["status"] == "closed" and r["waiting"] == 0
    assert mine(client, users, waiting, a1)["status_label"] == "Not selected"
    assert mine(client, users, accepted, a2)["status_label"] == "Accepted"
    n = sql(db, "select count(*) from application_events").scalar()
    client.patch(f"/employer/jobs/{job['id']}", headers=users.h(employer), json={"closed": True, "reason": "filled_skillmap"})
    assert sql(db, "select count(*) from application_events").scalar() == n, "closing twice added events"
    client.patch(f"/employer/jobs/{job['id']}", headers=users.h(employer), json={"closed": False})
    assert mine(client, users, waiting, a1)["status_label"] == "Not selected", "reopening reversed a decision"


def test_closing_needs_a_reason_and_tells_everyone_waiting(client, users, post_job):
    """14 Oct: no silent close. A reason is required; applicants still waiting get "Not selected" with it."""
    employer, student = users.employer(), users.student()
    job = post_job(employer)
    app_id = apply(client, users, student, job).json()["id"]
    assert client.patch(f"/employer/jobs/{job['id']}", headers=users.h(employer), json={"closed": True}).status_code == 400
    client.patch(f"/employer/jobs/{job['id']}", headers=users.h(employer), json={"closed": True, "reason": "not_filling"})
    m = mine(client, users, student, app_id)
    assert m["status_label"] == "Not selected" and m["reason"] == "job_cancelled" and m["close_reason"] == "not_filling"


def test_employer_dashboard_and_counts(client, users, post_job):
    employer, student = users.employer(), users.student()
    job = post_job(employer)
    app_id = apply(client, users, student, job).json()["id"]
    d = client.get("/employer/dashboard", headers=users.h(employer)).json()
    assert d["summary"]["new"] == 1 and d["to_review"][0]["id"] == app_id and d["to_review"][0]["opened"] is False
    assert client.get("/employer/counts", headers=users.h(employer)).json()["new_applicants"] == 1
    assert set(d["attention"]) == {"waiting_long", "quiet_jobs", "review_days", "past_date"}
    # 20 Oct (layout N2): what "What you can do now" and "Your reply record" use
    row = next(j for j in d["open_jobs"] if j["id"] == job["id"])
    assert row["required"] == 2 and row["has_requirements"] is False and row["decide_by"]
    assert d["record"] == {"on_time": 0, "of": 0, "shown": False}
    client.patch(f"/employer/applications/{app_id}", headers=users.h(employer), json={"status": "shortlisted"})
    assert client.get("/employer/counts", headers=users.h(employer)).json()["new_applicants"] == 0
