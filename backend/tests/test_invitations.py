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
    # 25 Oct: the job's View applicants page lists them with the applicants table's columns
    assert all(g["missing"] == ["Haskell"] and "nice_total" not in g for g in grads)
    # her 21 Oct rule: only the nice-to-haves they have, by name (nothing about the ones they lack)
    assert [g["nice_have"] for g in grads] == [["Docker"], []]


def _grad(client, users, employer, job, student):
    """The graduate's row in the job's 'Graduates who fit this job' list (View applicants), or None."""
    rows = client.get(f"/employer/jobs/{job['id']}/graduates", headers=users.h(employer)).json()
    return next((g for g in rows if g["student_id"] == users.ids[student]), None)


def test_declining_shows_the_reason_and_still_lets_her_apply(client, users, post_job):
    """25 Oct (her plan, option D): "No thanks" with an optional reason; the employer sees "Declined" and the reason
    at once; she can still apply while the job is open."""
    employer, student = users.employer(), users.student(visible=True)
    job = post_job(employer)
    client.post("/employer/invitations", headers=users.h(employer), json={"job_id": job["id"], "student_id": users.ids[student]})
    assert _grad(client, users, employer, job, student)["invite"]["state"] == "invited"
    inv = client.get("/applications/invitations", headers=users.h(student)).json()[0]
    url = f"/applications/invitations/{inv['id']}"
    # "Other" needs her own words, up to 200 characters; unknown reasons are refused
    assert client.patch(url, headers=users.h(student), json={"dismissed": True, "reason": "other"}).status_code == 400
    assert client.patch(url, headers=users.h(student), json={"dismissed": True, "reason": "other", "note": "x" * 201}).status_code == 400
    assert client.patch(url, headers=users.h(student), json={"dismissed": True, "reason": "bored"}).status_code == 400
    assert client.patch(url, headers=users.h(student), json={"dismissed": True, "reason": "other",
                                                               "note": "  I'd rather   stay in Penang "}).status_code == 200
    g = _grad(client, users, employer, job, student)
    assert g["invite"]["state"] == "declined" and g["invite"]["label"] == "Declined · I'd rather stay in Penang"
    act = client.get("/employer/dashboard", headers=users.h(employer)).json()["activity"]
    assert any(a["kind"] == "declined" and a["reason"] == "I'd rather stay in Penang" for a in act)
    # a listed reason instead; then no reason at all (still fine)
    client.patch(url, headers=users.h(student), json={"dismissed": False})
    client.patch(url, headers=users.h(student), json={"dismissed": True, "reason": "wrong_role"})
    assert _grad(client, users, employer, job, student)["invite"]["label"] == "Declined · Not the right role for me"
    client.patch(url, headers=users.h(student), json={"dismissed": False})
    client.patch(url, headers=users.h(student), json={"dismissed": True})
    assert _grad(client, users, employer, job, student)["invite"]["label"] == "Declined · No reason given"
    # she changes her mind: applying still works, as an ordinary application (no "Invited" tag: it didn't answer
    # the invitation), and the employer can't invite her again
    assert client.post("/applications", headers=users.h(student), json={"job_id": job["job_ref"]}).status_code == 200
    assert _grad(client, users, employer, job, student) is None                  # now an applicant, not a "fit"
    applicant = client.get(f"/employer/jobs/{job['id']}/applicants", headers=users.h(employer)).json()["applicants"][0]
    assert applicant["invited"] is False
    assert client.post("/employer/invitations", headers=users.h(employer),
                       json={"job_id": job["id"], "student_id": users.ids[student]}).status_code == 409


def test_no_answer_after_14_days_is_no_reply(client, users, post_job, db):
    employer, student = users.employer(), users.student(visible=True)
    job = post_job(employer)
    inv = client.post("/employer/invitations", headers=users.h(employer),
                      json={"job_id": job["id"], "student_id": users.ids[student]}).json()
    sql(db, "update job_invitations set created_at = now() - interval '13 days' where id=:i", i=inv["id"])
    assert _grad(client, users, employer, job, student)["invite"]["state"] == "invited"
    assert len(client.get("/applications/invitations", headers=users.h(student)).json()) == 1
    sql(db, "update job_invitations set created_at = now() - interval '15 days' where id=:i", i=inv["id"])
    g = _grad(client, users, employer, job, student)
    assert (g["invite"]["state"], g["invite"]["label"]) == ("no_reply", "No reply")
    assert client.get("/applications/invitations", headers=users.h(student)).json() == []     # ended for her too
    assert client.post("/applications", headers=users.h(student), json={"job_id": job["job_ref"]}).status_code == 200
    applicant = client.get(f"/employer/jobs/{job['id']}/applicants", headers=users.h(employer)).json()["applicants"][0]
    assert applicant["invited"] is False                                          # applied after it ended


def test_invite_selected_invites_each_and_reports_the_rest(client, users, post_job):
    """25 Oct: "Invite N selected" on View applicants; each gets the usual single invitation."""
    employer = users.employer()
    job = post_job(employer)
    a, b = users.student(visible=True), users.student(visible=True)
    applied, hidden = users.student(visible=True), users.student(visible=False)
    client.post("/applications", headers=users.h(applied), json={"job_id": job["job_ref"]})
    client.post("/employer/invitations", headers=users.h(employer), json={"job_id": job["id"], "student_id": users.ids[b]})
    ids = [users.ids[x] for x in (a, b, applied, hidden)] + [users.ids[a]]       # a twice: invited once
    r = client.post("/employer/invitations/bulk", headers=users.h(employer), json={"job_id": job["id"], "student_ids": ids})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["invited"] == [users.ids[a]]
    assert {s["student_id"]: s["reason"] for s in out["skipped"]} == {
        users.ids[b]: "You already invited them to apply for this job.",
        users.ids[applied]: "They already applied for this job.",
        users.ids[hidden]: "This graduate's profile isn't visible to employers."}
    assert len(client.get("/applications/invitations", headers=users.h(a)).json()) == 1
    # nothing ticked, too many, another employer's job, a closed job
    assert client.post("/employer/invitations/bulk", headers=users.h(employer), json={"job_id": job["id"], "student_ids": []}).status_code == 422
    assert client.post("/employer/invitations/bulk", headers=users.h(employer),
                       json={"job_id": job["id"], "student_ids": list(range(51))}).status_code == 422
    other = users.employer(company="Other Sdn Bhd")
    assert client.post("/employer/invitations/bulk", headers=users.h(other),
                       json={"job_id": job["id"], "student_ids": [users.ids[a]]}).status_code == 404
    assert client.get(f"/employer/jobs/{job['id']}/graduates", headers=users.h(other)).status_code == 404
    client.patch(f"/employer/jobs/{job['id']}", headers=users.h(employer), json={"closed": True, "reason": "not_filling"})
    assert client.post("/employer/invitations/bulk", headers=users.h(employer),
                       json={"job_id": job["id"], "student_ids": [users.ids[a]]}).status_code == 400
    assert client.get(f"/employer/jobs/{job['id']}/graduates", headers=users.h(employer)).json() == []


def test_graduates_not_yet_invited_come_first(client, users):
    """26 Oct (her review): the ones still to invite come first; already-invited ones follow, each group best match first."""
    employer = users.employer()
    top = users.student(skills=("Python", "SQL", "Docker"), visible=True)
    second = users.student(skills=("Python", "SQL"), visible=True)
    h = users.h(employer)
    cats = client.get("/jobs/subcategories", params={"include_past": True}, headers=h).json()
    job = client.post("/employer/jobs", headers=h, json={
        "title": "Graduate Data Engineer", "location": "Kuala Lumpur", "salary": "",
        "category": cats[0] if cats else "Developers/Programmers",
        "description": "Build data pipelines in Python and SQL; Docker is a plus. Haskell for our parsers. " * 2,
        "skills": [{"name": s, "level": "required", "quote": "", "group": ""} for s in ("Python", "SQL", "Haskell")]
                  + [{"name": "Docker", "level": "preferred", "quote": "", "group": ""}], "soft": []}).json()
    def ours():
        return [g["student_id"] for g in client.get(f"/employer/jobs/{job['id']}/graduates", headers=h).json()
                        if g["student_id"] in (users.ids[top], users.ids[second])]
    assert ours() == [users.ids[top], users.ids[second]]                  # best match first
    assert client.post("/employer/invitations", headers=h, json={"job_id": job["id"], "student_id": users.ids[top]}).status_code == 200
    assert ours() == [users.ids[second], users.ids[top]]                  # the invited one moves below
