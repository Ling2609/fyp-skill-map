"""The transparency flow (14 Oct): the employer's decision date, stopping new applications, closing with a reason,
reasons for Not selected (one or many at once), what students see about a job and where they stand, and the
employer's record of deciding on time."""
from datetime import datetime, timedelta, timezone

from conftest import sql


def _apply(client, users, student, job):
    r = client.post("/applications", headers=users.h(student), json={"job_id": job["job_ref"]})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _mine(client, users, student, app_id):
    return next(a for a in client.get("/applications/mine", headers=users.h(student)).json() if a["id"] == app_id)


def _post(client, users, employer, days=None, required=("Python", "SQL")):
    cats = client.get("/jobs/subcategories", params={"include_past": True}, headers=users.h(employer)).json()
    body = {"title": "Graduate Engineer", "location": "Kuala Lumpur", "salary": "",
            "category": cats[0] if cats else "Developers/Programmers",
            "description": "Build REST APIs in Python and write SQL every day. " * 3,
            "skills": [{"name": s, "level": "required", "quote": "", "group": ""} for s in required], "soft": []}
    if days is not None:
        body["decide_days"] = days
    return client.post("/employer/jobs", headers=users.h(employer), json=body)


def test_decision_date_is_set_when_posting_and_moved_once(client, users):
    employer = users.employer()
    assert _post(client, users, employer, days=10).status_code == 400            # only 14 / 28 / 30 / 42
    job = _post(client, users, employer, days=14).json()
    due = datetime.fromisoformat(job["decide_by"].replace("Z", "+00:00"))
    assert timedelta(days=13) < due - datetime.now(timezone.utc) <= timedelta(days=14)
    url = f"/employer/jobs/{job['id']}/extend"
    assert client.post(url, headers=users.h(employer), json={"days": 7, "reason": "ok"}).status_code == 400   # too short
    r = client.post(url, headers=users.h(employer), json={"days": 7, "reason": "Interviews take longer than planned"})
    assert r.status_code == 200 and r.json()["decide_extended"]
    moved = datetime.fromisoformat(r.json()["decide_by"].replace("Z", "+00:00"))
    assert abs((moved - due) - timedelta(days=7)) < timedelta(seconds=5)
    assert client.post(url, headers=users.h(employer), json={"days": 7, "reason": "Again, sorry"}).status_code == 400


def test_stopping_new_applications_keeps_the_job_for_applicants(client, users):
    employer, early, late = users.employer(), users.student(), users.student()
    job = _post(client, users, employer).json()
    app_id = _apply(client, users, early, job)
    client.patch(f"/employer/jobs/{job['id']}", headers=users.h(employer), json={"stopped": True})
    r = client.post("/applications", headers=users.h(late), json={"job_id": job["job_ref"]})
    assert r.status_code == 400 and "new applications" in r.text
    m = _mine(client, users, early, app_id)
    assert m["taking_applications"] is False and m["status_label"] == "Applied" and not m["job_closed"]
    now = client.get(f"/applications/job/{job['job_ref']}/open", headers=users.h(late)).json()   # Job Detail's fresh check
    assert now["taking_applications"] is False and now["closed"] is False and now["decide_by"]
    client.patch(f"/employer/jobs/{job['id']}", headers=users.h(employer), json={"stopped": False})
    assert client.post("/applications", headers=users.h(late), json={"job_id": job["job_ref"]}).status_code == 200


def test_not_selected_with_a_reason_the_student_sees(client, users):
    employer, student = users.employer(), users.student(skills=("Python",))
    job = _post(client, users, employer).json()
    app_id = _apply(client, users, student, job)
    url, h = f"/employer/applications/{app_id}", users.h(employer)
    assert client.patch(url, headers=h, json={"status": "rejected", "reason": "other"}).status_code == 400   # needs a note
    client.patch(url, headers=h, json={"status": "rejected", "reason": "missing_skills"})
    m = _mine(client, users, student, app_id)
    assert m["status_label"] == "Not selected" and m["reason"] == "missing_skills" and m["reason_skills"] == ["SQL"]
    client.patch(url, headers=h, json={"status": "rejected", "reason": "other", "note": "  We chose someone   local. "})
    m = _mine(client, users, student, app_id)
    assert (m["reason"], m["note"], m["reason_skills"]) == ("other", "We chose someone local.", [])
    client.patch(url, headers=h, json={"status": "shortlisted"})                  # a change of mind clears the reason
    m = _mine(client, users, student, app_id)
    assert m["reason"] is None and m["note"] is None


def test_several_at_once_all_or_nothing(client, users):
    employer, other_employer = users.employer(), users.employer(company="Other Sdn Bhd")
    job = _post(client, users, employer).json()
    other_job = _post(client, users, other_employer).json()
    a1, a2 = (_apply(client, users, users.student(), job) for _ in range(2))
    foreign = _apply(client, users, users.student(), other_job)
    h = users.h(employer)
    r = client.post("/employer/applications/bulk", headers=h, json={"ids": [a1, foreign], "reason": "position_filled"})
    assert r.status_code == 404
    assert sql(users.db, "select count(*) from applications where id in (:a, :b) and status='rejected'",
               a=a1, b=foreign).scalar() == 0                                    # nothing changed
    r = client.post("/employer/applications/bulk", headers=h, json={"ids": [a1, a2], "reason": "position_filled"})
    assert r.status_code == 200 and r.json()["updated"] == 2
    assert client.post("/employer/applications/bulk", headers=h, json={"ids": [a1], "status": "accepted"}).status_code == 400


def test_closing_filled_through_skillmap_needs_the_hire(client, users):
    employer, student = users.employer(), users.student()
    job = _post(client, users, employer).json()
    app_id = _apply(client, users, student, job)
    url, h = f"/employer/jobs/{job['id']}", users.h(employer)
    r = client.patch(url, headers=h, json={"closed": True, "reason": "filled_skillmap"})
    assert r.status_code == 400 and "Accepted" in r.text
    r = client.patch(url, headers=h, json={"closed": True, "reason": "filled_other"})
    assert r.status_code == 200 and r.json()["close_reason"] == "filled_other"
    m = _mine(client, users, student, app_id)
    assert m["reason"] == "job_filled" and m["status_label"] == "Not selected"


def test_job_numbers_and_where_you_stand(client, users, db):
    employer = users.employer()
    job = _post(client, users, employer).json()
    best = users.student(skills=("Python", "SQL"))
    best_app = _apply(client, users, best, job)
    for skills in (("Python",), ("Python",), ("Excel",)):
        _apply(client, users, users.student(skills=skills), job)
    assert _mine(client, users, best, best_app)["stand"] is None                  # 4 applicants: not shown
    _apply(client, users, users.student(skills=("Excel",)), job)
    m = _mine(client, users, best, best_app)
    assert m["stand"] == {"have": 2, "total": 2, "others": 4, "ahead_of": 4}
    assert m["job_stats"] == {"applied": 5, "shortlisted": 0, "decided": 0}


def test_employer_record_of_deciding_on_time(client, users, db):
    employer, s1, s2 = users.employer(), users.student(), users.student()
    job = _post(client, users, employer).json()
    a1, a2 = _apply(client, users, s1, job), _apply(client, users, s2, job)
    m = _mine(client, users, s1, a1)
    assert m["employer_record"] == {"on_time": 0, "of": 0, "shown": False}       # nothing due yet
    client.patch(f"/employer/applications/{a1}", headers=users.h(employer), json={"status": "rejected"})
    sql(db, "update jobs set decide_by=:t where id=:i", t=datetime.now(timezone.utc) - timedelta(minutes=1), i=job["id"])
    yesterday = datetime.now(timezone.utc) - timedelta(days=1)
    sql(db, "update applications set status_changed_at=:t where id=:i", t=yesterday, i=a1)
    sql(db, "update application_events set created_at=:t where application_id=:i and kind='status'", t=yesterday, i=a1)
    m2 = _mine(client, users, s2, a2)
    assert m2["employer_record"] == {"on_time": 0, "of": 1, "shown": False}      # s2 was never decided by the date
    assert m2["progress"]["nudge"] == "no_decision"
    # 18 Oct (improvement #1): the same record on Job Detail, before applying
    s3 = users.student()
    gap = client.post("/skillgap/", headers=users.h(s3), json={"job_id": job["job_ref"]})
    assert gap.status_code == 200, gap.text
    assert gap.json()["job"]["employer_record"] == {"on_time": 0, "of": 1, "shown": False}
    attention = client.get("/employer/dashboard", headers=users.h(employer)).json()["attention"]
    assert [p["waiting"] for p in attention["past_date"]] == [1]
