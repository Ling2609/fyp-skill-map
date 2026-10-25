"""Employers inviting visible graduates who fit a job; the student decides; the email stays private."""
from conftest import sql


def test_invite_flow(client, users, post_job):
    employer, student = users.employer(), users.student(visible=True)
    job = post_job(employer)
    assert job["graduates_all_required"] >= 1 and job["graduates_fit"] >= job["graduates_all_required"]   # 24 Oct
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
    client.patch(f"/employer/jobs/{job['id']}", headers=users.h(employer), json={"closed": True, "reason": "not_filling"})
    other = users.student(visible=True)
    assert client.post("/employer/invitations", headers=users.h(employer), json={"job_id": job["id"], "student_id": users.ids[other]}).status_code == 400


def test_contact_details_only_after_shortlisting(client, users, post_job):
    """14 Oct (her rule): a visible graduate's profile and a new application show no contact details; shortlisting
    shows the email, phone, city and start month."""
    employer, student = users.employer(), users.student(visible=True)
    client.put("/profile/about", headers=users.h(student), json={"visible_to_employers": True, "phone": "012-345 6789",
                                                                "city": "Kuala Lumpur", "available_from": "2027-01"})
    job = post_job(employer)
    g = client.get(f"/employer/graduates/{users.ids[student]}", params={"job_id": job["id"]}, headers=users.h(employer)).json()
    assert g["student"]["contact"] is None and student not in str(g) and "345 6789" not in str(g)
    app_id = client.post("/applications", headers=users.h(student), json={"job_id": job["job_ref"]}).json()["id"]
    a = client.get(f"/employer/applications/{app_id}", headers=users.h(employer)).json()
    assert a["student"]["contact"] is None and student not in str(a)              # applied: still no contact
    client.patch(f"/employer/applications/{app_id}", headers=users.h(employer), json={"status": "shortlisted"})
    c = client.get(f"/employer/applications/{app_id}", headers=users.h(employer)).json()["student"]["contact"]
    assert c == {"email": student, "phone": "012-345 6789", "city": "Kuala Lumpur", "available_from": "2027-01"}


def test_deactivated_student_leaves_graduates_who_fit(client, users, post_job, db):
    employer, student = users.employer(), users.student(visible=True)
    job = post_job(employer)
    sql(db, "update users set is_active=false where id=:i", i=users.ids[student])
    d = client.get("/employer/dashboard", headers=users.h(employer)).json()
    assert all(g["student_id"] != users.ids[student] for g in d["graduates"])
    assert client.get(f"/employer/graduates/{users.ids[student]}", params={"job_id": job["id"]}, headers=users.h(employer)).status_code == 404
    sql(db, "update users set is_active=true where id=:i", i=users.ids[student])


def test_graduates_with_nice_to_have_skills_come_first(client, users):
    """24 Oct (her point): a job with 3 required skills gives many graduates at "2 of 3". Among them, the one who also
    has the nice-to-have skill comes first. Who fits doesn't change, only the order."""
    employer = users.employer()
    plain = users.student(skills=("Python", "SQL"), visible=True)                # made first: sorts first by name
    extra = users.student(skills=("Python", "SQL", "Docker"), visible=True)      # same 2 of 3 + the nice-to-have
    h = users.h(employer)
    cats = client.get("/jobs/subcategories", params={"include_past": True}, headers=h).json()
    skills = ([{"name": s, "level": "required", "quote": "", "group": ""} for s in ("Python", "SQL", "Haskell")]
              + [{"name": "Docker", "level": "preferred", "quote": "", "group": ""}])
    r = client.post("/employer/jobs", headers=h, json={
        "title": "Graduate Data Engineer", "location": "Kuala Lumpur", "salary": "",
        "category": cats[0] if cats else "Developers/Programmers",
        "description": "Build data pipelines in Python and SQL; Docker is a plus. Haskell for our parsers. " * 2,
        "skills": skills, "soft": []})
    assert r.status_code == 200, r.text
    # nobody has Haskell: the "is live" note falls back to "at least half" (24 Oct)
    assert r.json()["graduates_all_required"] == 0 and r.json()["graduates_fit"] >= 2
    grads = [g for g in client.get("/employer/dashboard", headers=h).json()["graduates"]
             if g["job_id"] == r.json()["id"] and g["student_id"] in (users.ids[plain], users.ids[extra])]
    assert [(g["student_id"], g["have"], g["total"], g["nice"]) for g in grads] == [
        (users.ids[extra], 2, 3, 1), (users.ids[plain], 2, 3, 0)]
