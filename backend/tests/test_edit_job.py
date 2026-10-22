"""Editing a posted job (13 Oct): title, location and category stay; description, salary and skills change."""


def test_edit_changes_skills_and_keeps_locked_fields(client, users, post_job):
    employer, student = users.employer(), users.student(skills=("Python", "SQL"))
    job = post_job(employer, required=("Python", "Kotlin"))
    app_id = client.post("/applications", headers=users.h(student), json={"job_id": job["job_ref"]}).json()["id"]
    before = client.get(f"/employer/applications/{app_id}", headers=users.h(employer)).json()["fit"]
    assert (before["have"], before["total"]) == (1, 2)

    e = client.get(f"/employer/jobs/{job['id']}/edit", headers=users.h(employer)).json()
    assert e["title"] == job["title"] and {s["name"] for s in e["skills"]} == {"Python", "Kotlin"} and e["applicants"] == 1
    body = {"title": "Something else", "location": "Penang",                 # ignored: locked once posted
            "description": e["description"] + " Kotlin is no longer needed.", "salary": "RM 4,000",
            "skills": [{"name": "Python", "level": "required", "quote": "", "group": ""},
                       {"name": "SQL", "level": "required", "quote": "", "group": ""}], "soft": []}
    # 21 Oct: someone has applied, so the job can't ask for more (SQL wasn't required when they applied)
    r = client.put(f"/employer/jobs/{job['id']}", headers=users.h(employer), json=body)
    assert r.status_code == 409 and "SQL as a required skill" in r.json()["detail"] and "Post a new job" in r.json()["detail"]
    # asking for less is fine: Kotlin is dropped
    body["skills"] = body["skills"][:1]
    r = client.put(f"/employer/jobs/{job['id']}", headers=users.h(employer), json=body)
    assert r.status_code == 200, r.text
    after = client.get(f"/employer/jobs/{job['id']}/edit", headers=users.h(employer)).json()
    assert after["title"] == job["title"] and after["location"] == job["location"] and after["posted_at"] == job["posted_at"]
    assert after["salary"] == "RM 4,000" and {s["name"] for s in after["skills"]} == {"Python"}
    seen = client.get(f"/employer/applications/{app_id}", headers=users.h(employer)).json()
    fit = seen["fit"]
    assert (fit["have"], fit["total"]) == (1, 1), "the applicant's match should follow the new skills"
    # 21 Oct: the copy sent when applying was for the old skills, so the latest profile is shown and the page says why
    assert seen["versions"]["job_changed"] is True and seen["versions"]["showing"] == "latest"
    m = client.get("/applications/mine", headers=users.h(student)).json()[0]
    assert m["match"].startswith("1 of 1")
    assert m["job_changed"] == {"no_longer_required": ["Kotlin"], "was": "1 of 2"}   # what the job dropped, her old match


def test_after_applying_the_job_cant_ask_for_more_qualification_or_languages(client, users, post_job):
    """21 Oct (references.md "Changing a job's requirements after people applied")."""
    employer, student = users.employer(), users.student()
    job = post_job(employer, required=("Python",))
    h = users.h(employer)
    e = client.get(f"/employer/jobs/{job['id']}/edit", headers=h).json()
    body = {"description": e["description"], "salary": "", "soft": [],
            "skills": [{"name": "Python", "level": "required", "quote": "", "group": ""}],
            "min_qualification": "diploma", "study_field": "", "languages": ["English"]}
    assert client.put(f"/employer/jobs/{job['id']}", headers=h, json=body).status_code == 200      # no one applied yet
    client.post("/applications", headers=users.h(student), json={"job_id": job["job_ref"]})
    for change, words in (({"min_qualification": "bachelor"}, "a higher qualification"), ({"languages": ["English", "Malay"]}, "Malay as a language"),
                          ({"study_field": "Computer Science"}, "a field of study"),
                          ({"skills": body["skills"] + [{"name": "Docker", "level": "required", "quote": "", "group": ""}]}, "Docker")):
        r = client.put(f"/employer/jobs/{job['id']}", headers=h, json={**body, **change})
        assert r.status_code == 409 and words in r.json()["detail"], change
    # asking for less, or adding only a nice-to-have, is fine
    less = {**body, "min_qualification": "certificate", "languages": [],
            "skills": body["skills"] + [{"name": "Docker", "level": "preferred", "quote": "", "group": ""}]}
    assert client.put(f"/employer/jobs/{job['id']}", headers=h, json=less).status_code == 200


def test_edit_needs_a_required_skill_and_a_real_description(client, users, post_job):
    employer = users.employer()
    job = post_job(employer)
    body = {"description": "too short", "salary": "", "skills": [{"name": "Python", "level": "required", "quote": "", "group": ""}], "soft": []}
    assert client.put(f"/employer/jobs/{job['id']}", headers=users.h(employer), json=body).status_code == 400
    body["description"] = "A long enough description of the work the graduate will do every single day here."
    body["skills"] = [{"name": "Python", "level": "preferred", "quote": "", "group": ""}]
    assert client.put(f"/employer/jobs/{job['id']}", headers=users.h(employer), json=body).status_code == 400


def test_only_the_owner_can_edit(client, users, post_job):
    mine, other = users.employer(), users.employer(company="Other Co Sdn Bhd")
    job = post_job(mine)
    assert client.get(f"/employer/jobs/{job['id']}/edit", headers=users.h(other)).status_code == 404
    body = {"description": "A long enough description of the work the graduate will do every single day here.",
            "salary": "", "skills": [{"name": "Python", "level": "required", "quote": "", "group": ""}], "soft": []}
    assert client.put(f"/employer/jobs/{job['id']}", headers=users.h(other), json=body).status_code == 404
    assert client.put(f"/employer/jobs/{job['id']}", headers=users.h(users.student()), json=body).status_code == 403


def test_an_edit_and_an_application_at_the_same_moment_take_turns(client, users, post_job):
    """21 Oct (outside audit: a timing race): saving an edit and applying both lock the job's row, so while one holds
    it the other has to wait; an edit can't miss an application made at the same moment."""
    import pytest
    from sqlalchemy.exc import OperationalError
    from app.database import SessionLocal
    from app.models.job import Job
    job = post_job(users.employer())
    first, second = SessionLocal(), SessionLocal()           # two separate connections, as two requests would be
    try:
        first.query(Job).filter(Job.id == job["id"]).with_for_update().one()      # e.g. the employer's save, mid-way
        with pytest.raises(OperationalError):                 # the student's apply can't take the row meanwhile
            second.query(Job).filter(Job.id == job["id"]).with_for_update(nowait=True).one()
        second.rollback()
        first.commit()                                        # the edit is saved: the row is free again
        assert second.query(Job).filter(Job.id == job["id"]).with_for_update(nowait=True).one().id == job["id"]
    finally:
        second.rollback(); first.close(); second.close()


def _run_together(first, second, gap=0.3):
    """Start `first`, then `second` a moment later while `first` is still inside its endpoint; return both responses."""
    import time
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=2) as pool:
        a = pool.submit(first)
        time.sleep(gap)
        b = pool.submit(second)
        return a.result(timeout=60), b.result(timeout=60)


def _stricter_edit(client, users, employer, job):
    e = client.get(f"/employer/jobs/{job['id']}/edit", headers=users.h(employer)).json()
    body = {"description": e["description"], "salary": "", "soft": [],
            "skills": e["skills"] + [{"name": "Docker", "level": "required", "quote": "", "group": ""}]}
    return lambda: client.put(f"/employer/jobs/{job['id']}", headers=users.h(employer), json=body)


def test_real_endpoints_application_first_then_a_stricter_edit_is_refused(client, users, post_job, monkeypatch):
    """21 Oct (second outside audit: run the real endpoints, not only the lock). The application is mid-way (slowed
    while it builds its copy) when the employer saves a stricter edit: the edit waits for the application, then
    sees it and is refused; the job keeps the requirements the student applied under."""
    import time
    import app.routers.employer as emp
    employer, student = users.employer(), users.student()
    job = post_job(employer, required=("Python",))
    edit = _stricter_edit(client, users, employer, job)
    real = emp.sent_copy
    monkeypatch.setattr(emp, "sent_copy", lambda *a, **k: (time.sleep(1.5), real(*a, **k))[1])
    applied, edited = _run_together(
        lambda: client.post("/applications", headers=users.h(student), json={"job_id": job["job_ref"]}), edit)
    assert applied.status_code == 200, applied.text
    assert edited.status_code == 409 and "Docker as a required skill" in edited.json()["detail"]
    after = client.get(f"/employer/jobs/{job['id']}/edit", headers=users.h(employer)).json()
    assert {s["name"] for s in after["skills"]} == {"Python"}


def test_real_endpoints_edit_first_then_the_application_is_made_under_the_new_ad(client, users, post_job, monkeypatch):
    """The other order: the stricter edit is mid-way (nobody has applied yet, so it is allowed) when a student
    applies. The application waits for the edit, then is made under the new requirements, so the copy the employer
    sees already has Docker: nobody applied under rules that changed afterwards."""
    import time
    import app.routers.employer as emp
    employer, student = users.employer(), users.student()
    job = post_job(employer, required=("Python",))
    edit = _stricter_edit(client, users, employer, job)
    real = emp._asks_for_more
    monkeypatch.setattr(emp, "_asks_for_more", lambda *a, **k: (time.sleep(1.5), real(*a, **k))[1])
    edited, applied = _run_together(
        edit, lambda: client.post("/applications", headers=users.h(student), json={"job_id": job["job_ref"]}))
    assert edited.status_code == 200, edited.text
    assert applied.status_code == 200, applied.text
    app_id = applied.json()["id"]
    sent = client.get(f"/employer/applications/{app_id}", headers=users.h(employer)).json()
    assert sent["versions"]["job_changed"] is False                     # applied under the edited job, not before it
    assert sent["fit"]["total"] == 2 and "Docker" in sent["fit"]["missing"]     # judged against Python + Docker


def test_an_application_from_before_copies_were_kept_still_shows(client, users, post_job, db):
    """Applications made before 21 Oct have no saved copy: the employer sees the latest profile, no version bar."""
    from conftest import sql
    employer, student = users.employer(), users.student()
    job = post_job(employer, required=("Python",))
    app_id = client.post("/applications", headers=users.h(student), json={"job_id": job["job_ref"]}).json()["id"]
    sql(db, "update applications set sent_profile = null, sent_at = null where id = :i", i=app_id)
    r = client.get(f"/employer/applications/{app_id}", headers=users.h(employer))
    assert r.status_code == 200 and r.json()["versions"] is None and r.json()["student"]["name"]
    assert client.get("/applications/mine", headers=users.h(student)).json()[0]["job_changed"] is None
