"""Employers inviting visible graduates who fit a job; the student decides; the email stays private."""
from conftest import sql


def test_invite_flow(client, users, post_job):
    employer, student = users.employer(), users.student(visible=True)
    job = post_job(employer)
    d = client.get("/employer/dashboard", headers=users.h(employer)).json()
    assert any(g["student_id"] == users.ids[student] for g in d["graduates"]), "a visible student with every skill should fit"
    r = client.post("/employer/invitations", headers=users.h(employer), json={"job_id": job["id"], "student_id": users.ids[student]})
    assert r.status_code == 200, r.text
    inv = client.get("/applications/invitations", headers=users.h(student)).json()
    assert len(inv) == 1 and inv[0]["company"] == "Kayu Digital Sdn Bhd"
    assert client.get("/applications/counts", headers=users.h(student)).json()["invitations"] == 1
    assert client.get("/applications/refs", headers=users.h(student)).json()[job["job_ref"]]["invited"]
    # applying answers the invitation
    assert client.post("/applications", headers=users.h(student), json={"job_id": job["job_ref"]}).status_code == 200
    assert client.get("/applications/invitations", headers=users.h(student)).json() == []
    a = client.get(f"/employer/jobs/{job['id']}/applicants", headers=users.h(employer)).json()["applicants"][0]
    assert a["invited"] is True


def test_invite_only_once_even_after_not_interested(client, users, post_job):
    employer, student = users.employer(), users.student(visible=True)
    job = post_job(employer)
    body = {"job_id": job["id"], "student_id": users.ids[student]}
    assert client.post("/employer/invitations", headers=users.h(employer), json=body).status_code == 200
    assert client.post("/employer/invitations", headers=users.h(employer), json=body).status_code == 409
    inv = client.get("/applications/invitations", headers=users.h(student)).json()[0]
    assert client.patch(f"/applications/invitations/{inv['id']}", headers=users.h(student), json={"dismissed": True}).status_code == 200
    assert client.get("/applications/invitations", headers=users.h(student)).json() == []
    assert client.post("/employer/invitations", headers=users.h(employer), json=body).status_code == 409


def test_cannot_invite_hidden_or_already_applied_or_to_a_closed_job(client, users, post_job):
    employer = users.employer()
    job = post_job(employer)
    hidden = users.student(visible=False)
    assert client.post("/employer/invitations", headers=users.h(employer), json={"job_id": job["id"], "student_id": users.ids[hidden]}).status_code == 404
    applied = users.student(visible=True)
    client.post("/applications", headers=users.h(applied), json={"job_id": job["job_ref"]})
    assert client.post("/employer/invitations", headers=users.h(employer), json={"job_id": job["id"], "student_id": users.ids[applied]}).status_code == 409
    client.patch(f"/employer/jobs/{job['id']}", headers=users.h(employer), json={"closed": True})
    other = users.student(visible=True)
    assert client.post("/employer/invitations", headers=users.h(employer), json={"job_id": job["id"], "student_id": users.ids[other]}).status_code == 400


def test_graduate_profile_never_shows_the_email(client, users, post_job):
    employer, student = users.employer(), users.student(visible=True)
    job = post_job(employer)
    g = client.get(f"/employer/graduates/{users.ids[student]}", params={"job_id": job["id"]}, headers=users.h(employer)).json()
    assert g["student"]["email"] is None and student not in str(g)
    app_id = client.post("/applications", headers=users.h(student), json={"job_id": job["job_ref"]}).json()["id"]
    assert client.get(f"/employer/applications/{app_id}", headers=users.h(employer)).json()["student"]["email"] == student


def test_deactivated_student_leaves_graduates_who_fit(client, users, post_job, db):
    employer, student = users.employer(), users.student(visible=True)
    job = post_job(employer)
    sql(db, "update users set is_active=false where id=:i", i=users.ids[student])
    d = client.get("/employer/dashboard", headers=users.h(employer)).json()
    assert all(g["student_id"] != users.ids[student] for g in d["graduates"])
    assert client.get(f"/employer/graduates/{users.ids[student]}", params={"job_id": job["id"]}, headers=users.h(employer)).status_code == 404
    sql(db, "update users set is_active=true where id=:i", i=users.ids[student])
