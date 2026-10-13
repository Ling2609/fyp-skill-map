"""The small what-if on the Dashboard's goal card (13 Oct): for each skill still to learn, the goal jobs the student
would newly fit (half or more of the required skills) with that one skill on their profile."""
CATEGORY = "What-if Test Engineers"


def _post(client, users, employer, title, required):
    r = client.post("/employer/jobs", headers=users.h(employer), json={
        "title": title, "location": "Kuala Lumpur", "salary": "", "category": CATEGORY,
        "description": "Build and run services for our customers every day. " * 3,
        "skills": [{"name": s, "level": "required", "quote": "", "group": ""} for s in required], "soft": []})
    assert r.status_code == 200, r.text
    return r.json()


def test_each_missing_skill_shows_the_jobs_it_would_open(client, users):
    employer, student = users.employer(), users.student(skills=("Python",))
    platform = _post(client, users, employer, "Platform Engineer", ("Python", "Terraform", "Ansible", "Kotlin"))
    ops = _post(client, users, employer, "Ops Engineer", ("Ansible", "Haskell"))
    already = _post(client, users, employer, "Python Engineer", ("Python", "Ansible"))      # 1 of 2: already a fit
    assert client.put("/profile/goal", headers=users.h(student), json={"category": CATEGORY}).status_code == 200

    r = client.get("/recommend/goal", headers=users.h(student))
    assert r.status_code == 200, r.text
    rows = {x["skill"]: x for x in r.json()["readiness"]}
    assert rows["Python"]["has"] and rows["Python"]["opens_count"] == 0       # a skill she has opens nothing new
    assert not any(k.startswith("_") for x in rows.values() for k in x)       # internal fields stay internal

    # Ansible: Platform 1 -> 2 of 4 (half) and Ops 0 -> 1 of 2 (half); Python Engineer was already a fit
    ansible = rows["Ansible"]
    assert ansible["opens_count"] == 2
    got = {o["job_ref"]: (o["before"], o["after"], o["total"]) for o in ansible["opens"]}
    assert got == {platform["job_ref"]: (1, 2, 4), ops["job_ref"]: (0, 1, 2)}
    assert already["job_ref"] not in got
    # Kotlin alone takes Platform to half (1 -> 2 of 4); Haskell alone takes Ops to half (0 -> 1 of 2)
    assert [o["job_ref"] for o in rows["Kotlin"]["opens"]] == [platform["job_ref"]]
    assert [o["job_ref"] for o in rows["Haskell"]["opens"]] == [ops["job_ref"]]
