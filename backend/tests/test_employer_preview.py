"""21 Oct: the student's "what the employer will see" before applying, and "Preview as employer" on My Profile.
Both must show what the employer's applicant page shows (same function), without contact details."""


def test_preview_for_a_job_matches_the_employer_view(client, users, post_job):
    employer, student = users.employer(), users.student(skills=("Python",))
    job = post_job(employer, required=("Python", "SQL"))
    r = client.get(f"/applications/job/{job['job_ref']}/preview", headers=users.h(student))
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["applied"] is False and p["student"]["contact"] is None
    assert p["fit"]["have"] == 1 and p["fit"]["total"] == 2 and p["fit"]["missing"] == ["SQL"]
    # after applying, the employer's page shows the same match and the same profile parts
    app_id = client.post("/applications", headers=users.h(student), json={"job_id": job["job_ref"]}).json()["id"]
    e = client.get(f"/employer/applications/{app_id}", headers=users.h(employer)).json()
    assert e["fit"] == p["fit"]
    for key in ("name", "projects", "strongest_modules", "certifications", "awards", "about", "programme_line"):
        assert e["student"][key] == p["student"][key], key
    assert client.get(f"/applications/job/{job['job_ref']}/preview", headers=users.h(student)).json()["applied"] is True


def test_preview_only_for_skillmap_jobs_and_students(client, users, db):
    from conftest import sql
    student, employer = users.student(), users.employer()
    sql(db, "insert into jobs (job_id, job_title, company, location, description, source) "
            "values ('live_preview_x', 'QA', 'Tec D', 'KL', 'Test.', 'live')")
    try:
        assert client.get("/applications/job/live_preview_x/preview", headers=users.h(student)).status_code == 404
    finally:
        sql(db, "delete from jobs where job_id = 'live_preview_x'")
    r = client.get("/profile/preview", headers=users.h(student))
    assert r.status_code == 200 and r.json()["student"]["contact"] is None and "own_contact" in r.json()["student"]
    assert r.json()["student"]["own_contact"] is None          # the employer's version: no own contact details
    assert client.get("/profile/preview", headers=users.h(employer)).status_code == 403


def test_interview_preparation_gets_the_job_ad(client, users, post_job, monkeypatch):
    """21 Oct (her review): "Prepare for the interview" must be about THIS job: the chat context holds the ad and the
    shortlisted purpose; an ordinary chat about the same job does not get the ad."""
    import app.routers.chatbot as cb
    employer, student = users.employer(), users.student(skills=("Python",))
    job = post_job(employer, required=("Python", "SQL"))
    seen = []

    class FakeCompletions:
        def create(self, model, messages, **k):
            seen.append(messages)
            msg = type("M", (), {"content": "ok"})
            return type("R", (), {"choices": [type("C", (), {"message": msg, "finish_reason": "stop"})]})
    monkeypatch.setattr(cb, "get_client", lambda: type("G", (), {"chat": type("Ch", (), {"completions": FakeCompletions()})})())
    body = {"mode": "career_counsellor", "messages": [{"role": "user", "content": "Help me prepare"}],
            "job_id": job["job_ref"], "job_title": "Graduate Software Engineer"}
    assert client.post("/chatbot/", headers=users.h(student), json={**body, "purpose": "interview"}).status_code == 200
    ctx = next(m["content"] for m in seen[-1] if m["role"] == "system" and "User context" in m["content"])
    assert "SHORTLISTED" in ctx and "The job ad (excerpt): Build REST APIs in Python" in ctx and "SQL" in ctx
    assert client.post("/chatbot/", headers=users.h(student), json=body).status_code == 200
    ctx2 = next(m["content"] for m in seen[-1] if m["role"] == "system" and "User context" in m["content"])
    assert "The job ad (excerpt)" not in ctx2
    assert client.post("/chatbot/", headers=users.h(student), json={**body, "purpose": "anything"}).status_code == 422


def test_employer_sees_nice_to_haves_the_student_has_but_not_the_ones_missing(client, users):
    """21 Oct (her rule): required skills show have and missing; nice-to-haves only when the student has them."""
    employer, student = users.employer(), users.student(skills=("Python", "Docker"))
    cats = client.get("/jobs/subcategories", params={"include_past": True}, headers=users.h(employer)).json()
    r = client.post("/employer/jobs", headers=users.h(employer), json={
        "title": "Backend Developer", "location": "KL", "salary": "", "category": cats[0] if cats else "Developers/Programmers",
        "description": "Build REST APIs in Python with Docker and Kubernetes every day. " * 3,
        "skills": [{"name": "Python", "level": "required", "quote": "", "group": ""},
                   {"name": "SQL", "level": "required", "quote": "", "group": ""},
                   {"name": "Docker", "level": "preferred", "quote": "", "group": ""},
                   {"name": "Kubernetes", "level": "preferred", "quote": "", "group": ""}], "soft": []})
    assert r.status_code == 200, r.text
    fit = client.get(f"/applications/job/{r.json()['job_ref']}/preview", headers=users.h(student)).json()["fit"]
    assert [m["skill"] for m in fit["matched"]] == ["Python"] and fit["missing"] == ["SQL"]
    assert fit["nice_have"] == ["Docker"] and "nice_missing" not in fit and "Kubernetes" not in str(fit)


def test_employer_sees_what_was_sent_then_the_latest(client, users, post_job):
    """21 Oct (her pick): an application keeps what the employer was shown when the student applied; after she
    changes her profile, the employer still sees that copy by default, is told it changed, and can see the latest."""
    employer, student = users.employer(), users.student(skills=("Python",))
    job = post_job(employer, required=("Python", "SQL"))
    h = users.h(student)
    app_id = client.post("/applications", headers=h, json={"job_id": job["job_ref"]}).json()["id"]
    first = client.get(f"/employer/applications/{app_id}", headers=users.h(employer)).json()
    assert first["versions"]["changed"] is False and first["versions"]["showing"] == "sent"
    # she adds a project with SQL after applying
    client.post("/profile/projects", headers=h, json={"name": "Shop DB", "description": "A shop database in SQL.",
                                                       "skills": {"SQL": "Added by you"}})
    sent = client.get(f"/employer/applications/{app_id}", headers=users.h(employer)).json()
    assert sent["versions"]["changed"] is True and sent["versions"]["showing"] == "sent"
    assert sent["fit"]["have"] == 1 and "Shop DB" not in [p["name"] for p in sent["student"]["projects"]]
    latest = client.get(f"/employer/applications/{app_id}?view=latest", headers=users.h(employer)).json()
    assert latest["versions"]["showing"] == "latest" and latest["fit"]["have"] == 2
    assert "Shop DB" in [p["name"] for p in latest["student"]["projects"]]
    # her own preview of this job shows the same two versions
    mine = client.get(f"/applications/job/{job['job_ref']}/preview", headers=h).json()
    assert mine["applied"] and mine["versions"]["changed"] and mine["fit"]["have"] == 1
