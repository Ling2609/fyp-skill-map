"""21 Oct (references.md "What employers look for in graduates"): work experience and activities, project context,
languages and an opt-in CGPA. Each one must reach the skill profile (if it has skills), the employer's applicant
page, the chatbot's CV material, the data export and account deletion."""
import pytest

INTERN = {"kind": "work", "category": "internship", "role": "Software Engineering Intern", "organisation": "Tec D",
          "start_month": "2025-06", "end_month": "2025-09",
          "description": "Built REST APIs with FastAPI and wrote unit tests in pytest for the payments team."}


def test_suggest_keeps_only_skills_in_her_words(client, users, monkeypatch):
    import app.routers.experience as ex
    student = users.student()
    monkeypatch.setattr(ex, "_ask_json", lambda prompt, label: [
        {"skill": "FastAPI", "quote": "Built REST APIs with FastAPI"},
        {"skill": "Kubernetes", "quote": "deployed on Kubernetes"},            # not in her text: dropped
        {"skill": "pytest", "quote": "wrote unit tests in pytest"}])
    r = client.post("/profile/experiences/suggest", headers=users.h(student),
                    json={k: INTERN[k] for k in ("kind", "role", "organisation", "description")})
    assert r.status_code == 200, r.text
    assert [s["name"] for s in r.json()["skills"]] == ["FastAPI", "pytest"]
    short = client.post("/profile/experiences/suggest", headers=users.h(student),
                        json={"kind": "work", "role": "Intern", "organisation": "Tec D", "description": "Coding."})
    assert short.json()["too_short"] is True and short.json()["skills"] == []


def test_experience_reaches_profile_employer_chatbot_export_and_delete(client, users, post_job, db):
    from app.models.user import User
    from app.routers.chatbot import cv_lines
    employer, student = users.employer(), users.student()
    h = users.h(student)
    r = client.post("/profile/experiences", headers=h, json={**INTERN, "skills": ["FastAPI", "Teamwork"], "added": ["Teamwork"]})
    assert r.status_code == 201, r.text
    assert r.json()["added_skills"] == ["Teamwork"]
    club = {"kind": "activity", "category": "club", "role": "Vice President", "organisation": "Coding Club",
            "start_month": "2024-09", "end_month": None, "description": "", "skills": ["Leadership"]}
    assert client.post("/profile/experiences", headers=h, json=club).status_code == 201
    # newest first, the one she still does at the top
    assert [e["role"] for e in client.get("/profile/experiences", headers=h).json()] == ["Vice President", INTERN["role"]]
    # the same role at the same place is asked about
    assert client.post("/profile/experiences", headers=h, json={**INTERN, "skills": []}).status_code == 409
    skills = client.get("/profile/skills", headers=h).json()
    assert {"FastAPI", "Teamwork", "Leadership"} <= set(skills["skills"]) and skills["from_experience"] == 3

    job = post_job(employer, required=("FastAPI", "SQL"))
    app_id = client.post("/applications", headers=h, json={"job_id": job["job_ref"]}).json()["id"]
    e = client.get(f"/employer/applications/{app_id}", headers=users.h(employer)).json()
    # the internship uses FastAPI, which the job asks for, so it comes first (and work comes before activities)
    assert [x["role"] for x in e["student"]["experiences"]] == [INTERN["role"], "Vice President"]
    assert e["student"]["experiences"][0]["relevant"] == ["FastAPI"]
    m = next(x for x in e["fit"]["matched"] if x["skill"] == "FastAPI")
    assert m["from"] == "Internship: Software Engineering Intern, Tec D"

    user = db.get(User, users.ids[student])
    lines = "\n".join(cv_lines(user, db))
    assert "Work: Software Engineering Intern, Tec D (2025-06 to 2025-09)" in lines and "Activity: Vice President" in lines

    export = client.get("/auth/me/export", headers=h)
    assert export.status_code == 200 and len(export.json()["work_experience_and_activities"]) == 2


def test_dates_and_types_are_checked(client, users):
    h = users.h(users.student())
    bad = [({"category": "club"}, "Choose a type"), ({"end_month": "2025-01"}, "before the start"),
           ({"start_month": ""}, "month you started"), ({"role": " "}, "required")]
    for change, words in bad:
        r = client.post("/profile/experiences", headers=h, json={**INTERN, **change, "skills": []})
        assert r.status_code == 400 and words in r.json()["detail"], (change, r.text)


def test_project_context_saved_and_shown(client, users, monkeypatch):
    import app.routers.profile as pr
    student = users.student()
    h = users.h(student)
    body = {"name": "Club booking app", "description": "A booking app built with React for the coding club.",
            "skills": {"React": "built with React"}, "role": "Front-end developer", "team_size": 4,
            "outcome": "Used by 120 members", "demo_url": "https://club.example.com"}
    r = client.post("/profile/projects", headers=h, json=body)
    assert r.status_code == 201, r.text
    assert r.json()["team_size"] == 4 and r.json()["demo_url"] == "https://club.example.com"
    pid = r.json()["id"]
    # an edit that changes only the context is saved too
    r = client.put(f"/profile/projects/{pid}", headers=h, json={**body, "outcome": "Used by 200 members"})
    assert r.json()["outcome"] == "Used by 200 members"
    p = client.get("/profile/preview", headers=h).json()["student"]["projects"][0]
    assert (p["role"], p["team_size"], p["outcome"]) == ("Front-end developer", 4, "Used by 200 members")
    for change, words in (({"team_size": 0}, "Team size"), ({"demo_url": "club page"}, "Demo link")):
        r = client.post("/profile/projects", headers=h, json={**body, "name": "Other", **change})
        assert r.status_code == 400 and words in r.json()["detail"]


def test_languages_and_cgpa_only_when_she_allows(client, users):
    student = users.student()
    h = users.h(student)
    # the fields an older caller sends (no languages or CGPA)
    about = {k: v for k, v in client.get("/profile/about", headers=h).json().items() if k not in ("languages", "cgpa", "show_cgpa")}
    langs = [{"language": "English", "level": "full_professional", "test": "MUET Band 5"},
             {"language": "Malay", "level": "native", "test": ""}]
    r = client.put("/profile/about", headers=h, json={**about, "languages": langs, "cgpa": 3.716, "show_cgpa": False})
    assert r.status_code == 200, r.text
    assert r.json()["cgpa"] == 3.72 and r.json()["languages"][0]["test"] == "MUET Band 5"
    preview = client.get("/profile/preview", headers=h).json()["student"]
    assert preview["cgpa"] is None and preview["languages"][1]["language"] == "Malay"     # hidden until switched on
    client.put("/profile/about", headers=h, json={**about, "show_cgpa": True})
    assert client.get("/profile/preview", headers=h).json()["student"]["cgpa"] == 3.72
    # an older caller that sends no languages leaves them alone
    assert len(client.put("/profile/about", headers=h, json=about).json()["languages"]) == 2
    for change, words in (({"cgpa": 4.5}, "0.00 to 4.00"), ({"languages": [{"language": "English", "level": "good"}]}, "how well"),
                          ({"languages": langs[:1] * 2}, "twice")):
        r = client.put("/profile/about", headers=h, json={**about, **change})
        assert r.status_code == 400 and words in r.json()["detail"], change
    r = client.put("/profile/about", headers=h, json={**about, "clear_cgpa": True})
    assert r.json()["cgpa"] is None and r.json()["show_cgpa"] is False


def test_a_database_without_the_new_columns_is_named_then_upgraded(client, db):
    from conftest import run_migration, sql
    from app.routers.profile import check_profile_schema
    sql(db, "alter table users drop column show_cgpa")
    try:
        with pytest.raises(RuntimeError, match="migrate_profile_more_evidence.py"):
            check_profile_schema()
    finally:
        assert "user_experiences table: ok" in run_migration("migrate_profile_more_evidence")
    check_profile_schema()


def test_with_a_job_the_relevant_project_comes_first(client, users, post_job):
    """21 Oct (her idea): the employer sees first the projects and experience that use the job's skills."""
    employer, student = users.employer(), users.student(skills=("Python",))      # "Shop API", added first
    h = users.h(student)
    client.post("/profile/projects", headers=h, json={"name": "Game", "description": "A small 2D game in Unity.",
                                                      "skills": {"Unity": "in Unity"}})
    assert [p["name"] for p in client.get("/profile/preview", headers=h).json()["student"]["projects"]] == ["Game", "Shop API"]
    job = post_job(employer, required=("Python", "SQL"))
    p = client.get(f"/applications/job/{job['job_ref']}/preview", headers=h).json()["student"]["projects"]
    assert [x["name"] for x in p] == ["Shop API", "Game"] and p[0]["relevant"] == ["Python"] and p[1]["relevant"] == []


def test_someone_on_the_old_notice_can_agree_to_the_new_one(client, users, db):
    """21 Oct (her pick): a student who agreed to 14 Oct sees what changed and agrees; only the newest version counts."""
    from conftest import sql
    from app.routers.auth import PRIVACY_VERSION
    student = users.student(skills=())
    sql(db, "update users set privacy_version='2026-10-14' where id=:i", i=users.ids[student])
    h = users.h(student)
    assert client.get("/auth/me", headers=h).json()["privacy_version"] == "2026-10-14"
    assert client.post("/auth/me/privacy", headers=h, json={"version": "2026-10-14"}).status_code == 409
    r = client.post("/auth/me/privacy", headers=h, json={"version": PRIVACY_VERSION})
    assert r.status_code == 200 and r.json()["privacy_version"] == PRIVACY_VERSION == "2026-10-21"


def test_strongest_modules_put_the_jobs_skills_first(client, users, post_job, db):
    """21 Oct (her review): the module card's order means something: with a job, the modules that teach its skills."""
    from conftest import sql
    student, employer = users.student(skills=()), users.employer()
    sql(db, "insert into modules (code, name, level, type) values ('ZZ-1','Aaa Art',1,'common'),('ZZ-2','Zzz Databases',1,'common')")
    try:
        ids = dict(db.execute(__import__('sqlalchemy').text("select code, id from modules where code in ('ZZ-1','ZZ-2')")).all())
        sql(db, "insert into module_skills (module_id, module_code, skill_name) values (:a,'ZZ-1','Drawing'),(:b,'ZZ-2','SQL')", a=ids['ZZ-1'], b=ids['ZZ-2'])
        sql(db, "insert into user_modules (user_id, module_code, grade) values (:u,'ZZ-1',4.0),(:u,'ZZ-2',3.7)", u=users.ids[student])
        h = users.h(student)
        plain = client.get("/profile/preview", headers=h).json()["student"]["strongest_modules"]
        assert [m["name"] for m in plain][:2] == ["Aaa Art", "Zzz Databases"]           # better grade first
        job = post_job(employer, required=("SQL",))
        for_job = client.get(f"/applications/job/{job['job_ref']}/preview", headers=h).json()["student"]["strongest_modules"]
        assert for_job[0]["name"] == "Zzz Databases" and for_job[0]["relevant"] == ["SQL"]
    finally:
        sql(db, "delete from user_modules where module_code in ('ZZ-1','ZZ-2')")
        sql(db, "delete from module_skills where module_id in (select id from modules where code in ('ZZ-1','ZZ-2'))")
        sql(db, "delete from modules where code in ('ZZ-1','ZZ-2')")
