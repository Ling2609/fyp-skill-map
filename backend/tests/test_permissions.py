"""Nobody reaches another person's records by changing an id in the address (direct API calls, not the pages)."""


def test_another_employer_cannot_reach_my_jobs_or_applicants(client, users, post_job):
    mine, other, student = users.employer(), users.employer(company="Other Co Sdn Bhd"), users.student(visible=True)
    job = post_job(mine)
    app_id = client.post("/applications", headers=users.h(student), json={"job_id": job["job_ref"]}).json()["id"]
    h = users.h(other)
    assert client.get(f"/employer/jobs/{job['id']}/applicants", headers=h).status_code == 404
    assert client.get(f"/employer/applications/{app_id}", headers=h).status_code == 404
    assert client.patch(f"/employer/applications/{app_id}", headers=h, json={"status": "rejected"}).status_code == 404
    assert client.patch(f"/employer/jobs/{job['id']}", headers=h, json={"closed": True, "reason": "not_filling"}).status_code == 404
    assert client.get(f"/employer/graduates/{users.ids[student]}", params={"job_id": job["id"]}, headers=h).status_code == 404
    assert client.post("/employer/invitations", headers=h, json={"job_id": job["id"], "student_id": users.ids[student]}).status_code == 404


def test_a_student_sees_only_their_own_applications_and_invitations(client, users, post_job):
    employer, a, b = users.employer(), users.student(visible=True), users.student(visible=True)
    job = post_job(employer)
    client.post("/employer/invitations", headers=users.h(employer), json={"job_id": job["id"], "student_id": users.ids[a]})
    client.post("/applications", headers=users.h(a), json={"job_id": job["job_ref"]})
    assert client.get("/applications/mine", headers=users.h(b)).json() == []
    inv = client.get("/applications/invitations", headers=users.h(a)).json()
    other_job = post_job(employer, title="Second job")
    client.post("/employer/invitations", headers=users.h(employer), json={"job_id": other_job["id"], "student_id": users.ids[a]})
    inv = client.get("/applications/invitations", headers=users.h(a)).json()[0]
    assert client.patch(f"/applications/invitations/{inv['id']}", headers=users.h(b), json={"dismissed": True}).status_code == 404


def test_grades_follow_the_students_switch(client, users, post_job, db):
    from conftest import sql
    employer, student = users.employer(), users.student()
    job = post_job(employer)
    app_id = client.post("/applications", headers=users.h(student), json={"job_id": job["job_ref"]}).json()["id"]
    sql(db, "update users set show_grades_to_employers=false where id=:i", i=users.ids[student])
    p = client.get(f"/employer/applications/{app_id}", headers=users.h(employer)).json()
    assert p["student"]["show_grades_to_employers"] is False
    assert all(not m.get("grade") for m in (p["fit"] or {}).get("matched", []))
