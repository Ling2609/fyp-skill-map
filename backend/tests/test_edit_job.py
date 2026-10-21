"""Editing a posted job (13 Oct): title, location and category stay; description, salary and skills change."""


def test_edit_changes_skills_and_keeps_locked_fields(client, users, post_job):
    employer, student = users.employer(), users.student(skills=("Python", "SQL"))
    job = post_job(employer, required=("Python", "Kotlin"))
    app_id = client.post("/applications", headers=users.h(student), json={"job_id": job["job_ref"]}).json()["id"]
    before = client.get(f"/employer/applications/{app_id}", headers=users.h(employer)).json()["fit"]
    assert (before["have"], before["total"]) == (1, 2)

    e = client.get(f"/employer/jobs/{job['id']}/edit", headers=users.h(employer)).json()
    assert e["title"] == job["title"] and {s["name"] for s in e["skills"]} == {"Python", "Kotlin"} and e["applicants"] == 1
    r = client.put(f"/employer/jobs/{job['id']}", headers=users.h(employer), json={
        "title": "Something else", "location": "Penang",                 # ignored: locked once posted
        "description": e["description"] + " Kotlin was a mistake: it is SQL.", "salary": "RM 4,000",
        "skills": [{"name": "Python", "level": "required", "quote": "", "group": ""},
                   {"name": "SQL", "level": "required", "quote": "", "group": ""}], "soft": []})
    assert r.status_code == 200, r.text
    after = client.get(f"/employer/jobs/{job['id']}/edit", headers=users.h(employer)).json()
    assert after["title"] == job["title"] and after["location"] == job["location"] and after["posted_at"] == job["posted_at"]
    assert after["salary"] == "RM 4,000" and {s["name"] for s in after["skills"]} == {"Python", "SQL"}
    seen = client.get(f"/employer/applications/{app_id}", headers=users.h(employer)).json()
    fit = seen["fit"]
    assert (fit["have"], fit["total"]) == (2, 2), "the applicant's match should follow the new skills"
    # 21 Oct: the copy sent when applying was for the old skills, so the latest profile is shown and the page says why
    assert seen["versions"]["job_changed"] is True and seen["versions"]["showing"] == "latest"
    m = client.get("/applications/mine", headers=users.h(student)).json()[0]
    assert m["match"].startswith("2 of 2")


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
