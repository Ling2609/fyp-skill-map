"""Jobs applied for on other sites (20 Oct, her idea): the student records them, sets the status, can undo; only
live jobs; only the student sees them; included in "Download my data" and removed with the account."""
import json

from conftest import sql


import pytest


@pytest.fixture(autouse=True)
def _remove_test_jobs(db):
    """The live jobs made here are removed afterwards, so later tests that rank every live job aren't affected."""
    yield
    sql(db, "delete from job_skills where job_ref like 'live_outside_%'")
    sql(db, "delete from jobs where job_id like 'live_outside_%'")


def _live_job(db, ref):
    sql(db, "insert into jobs (job_id, job_title, company, location, description, source, publisher, source_url) "
            "values (:j, 'QA Engineer', 'Tec D', 'KL', 'Test software.', 'live', 'LinkedIn', 'https://example.com/x')", j=ref)
    return ref


def test_record_update_undo(client, users, db, post_job):
    student, other = users.student(), users.student()
    ref = _live_job(db, "live_outside_1")
    h = users.h(student)
    assert client.get(f"/applications/outside/job/{ref}", headers=h).json() is None
    r = client.post("/applications/outside", headers=h, json={"job_id": ref})
    assert r.status_code == 200 and r.json()["status"] == "applied" and r.json()["publisher"] == "LinkedIn"
    again = client.post("/applications/outside", headers=h, json={"job_id": ref}).json()
    assert again["id"] == r.json()["id"]                                         # recording twice: one record
    oid = r.json()["id"]
    assert client.patch(f"/applications/outside/{oid}", headers=h, json={"status": "hired"}).status_code == 400
    up = client.patch(f"/applications/outside/{oid}", headers=h, json={"status": "interviewing"}).json()
    assert up["status_label"] == "Interviewing" and up["status_changed_at"]
    # nobody else sees or changes it
    assert client.patch(f"/applications/outside/{oid}", headers=users.h(other), json={"status": "offer"}).status_code == 404
    assert client.get("/applications/outside", headers=users.h(other)).json() == []
    assert [x["id"] for x in client.get("/applications/outside", headers=h).json()] == [oid]
    # a SkillMap post is applied for on SkillMap, not recorded here
    job = post_job(users.employer())
    assert client.post("/applications/outside", headers=h, json={"job_id": job["job_ref"]}).status_code == 404
    # undo
    assert client.delete(f"/applications/outside/{oid}", headers=h).status_code == 204
    assert client.get(f"/applications/outside/job/{ref}", headers=h).json() is None


def test_in_my_data_and_removed_with_the_account(client, users, db):
    from app.models.application import OutsideApplication
    from app.models.user import User
    from app.routers.auth import delete_student_data
    student = users.student()
    ref = _live_job(db, "live_outside_2")
    client.post("/applications/outside", headers=users.h(student), json={"job_id": ref})
    data = json.loads(client.get("/auth/me/export", headers=users.h(student)).content)
    row = data["applications_on_other_sites"][0]
    assert row["site"] == "LinkedIn" and row["status"] == "applied" and "student_id" not in row
    user = db.get(User, users.ids[student])
    delete_student_data(user, db)
    db.commit()
    assert db.query(OutsideApplication).filter(OutsideApplication.student_id == user.id).count() == 0


def test_refs_and_invitations_with_an_outside_record(client, users, db):
    """20 Oct (500 on her machine): the outside-record tag was added to /invitations instead of /refs. Both must work
    for a student with a record, and /refs must tag the job with its site."""
    student = users.student()
    h = users.h(student)
    _live_job(db, 'live_outside_refs')
    assert client.post("/applications/outside", headers=h, json={"job_id": "live_outside_refs"}).status_code == 200
    assert client.get("/applications/invitations", headers=h).status_code == 200
    r = client.get("/applications/refs", headers=h)
    assert r.status_code == 200 and r.json()["live_outside_refs"]["site"] == "LinkedIn"


def test_my_outside_list_has_the_match(client, users, db):
    """20 Oct (her review): other-site rows show 'your match X of Y required', like SkillMap applications."""
    student = users.student(skills=("Python", "SQL"))
    h = users.h(student)
    _live_job(db, "live_outside_match")
    jid = sql(db, "select id from jobs where job_id = 'live_outside_match'").scalar()
    for skill in ("Python", "Kubernetes"):
        sql(db, "insert into job_skills (job_id, job_ref, skill_name) values (:j, 'live_outside_match', :s)", j=jid, s=skill)
    assert client.post("/applications/outside", headers=h, json={"job_id": "live_outside_match"}).status_code == 200
    row = next(x for x in client.get("/applications/outside", headers=h).json() if x["job_ref"] == "live_outside_match")
    assert row["match"] == "1 of 2 required"
