"""Personal data (14 Oct; PDPA 2010): optional contact details with checks, and "Download my data" with everything
SkillMap holds about the user except security data."""
import json
from datetime import datetime, timezone


def test_contact_details_are_checked(client, users):
    student = users.student()
    h = users.h(student)
    assert client.put("/profile/about", headers=h, json={"phone": "call me"}).status_code == 400
    assert client.put("/profile/about", headers=h, json={"available_from": "Jan 2027"}).status_code == 400
    r = client.put("/profile/about", headers=h, json={"phone": " +60 12-345  6789 ", "city": " Kuala  Lumpur ",
                                                     "available_from": "2027-01"})
    assert r.status_code == 200
    assert (r.json()["phone"], r.json()["city"], r.json()["available_from"]) == ("+60 12-345 6789", "Kuala Lumpur", "2027-01")
    # clearing them is allowed (all optional)
    r = client.put("/profile/about", headers=h, json={})
    assert (r.json()["phone"], r.json()["city"]) == ("", "")


def test_download_my_data(client, users, post_job):
    employer, student = users.employer(), users.student(skills=("Python",))
    job = post_job(employer)
    client.post("/applications", headers=users.h(student), json={"job_id": job["job_ref"]})
    r = client.get("/auth/me/export", headers=users.h(student))
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    data = json.loads(r.content)
    assert data["account"]["email"] == student and data["account"]["privacy_accepted_at"]
    assert "hashed_password" not in data["account"] and "$2b$" not in r.text          # no password hash
    assert data["projects"][0]["name"] == "Shop API" and "Python" in data["projects"][0]["extracted_skills"]
    assert data["applications"][0]["job"] == job["title"] and data["applications"][0]["status"] == "applied"
    assert "ai_assistant_chats" in data                    # a list, or a note when MongoDB can't be reached
    assert client.get("/auth/me/export").status_code == 401


def test_download_has_every_field_of_my_rows(client, users, post_job, db, monkeypatch):
    """14 Oct audit: the export promised everything but missed the reason, note, skill counts and dismissals. Now
    every column of the student's rows is exported except the password hash and linking ids, checked against the
    tables themselves so a column added later can't be missed. Chats: every field but the internal ids."""
    import app.mongo
    from sqlalchemy import inspect as sa_inspect
    from app.routers.auth import EXPORT_SKIP

    class Chats:
        def find(self, query):
            assert query == {"user_id": users.ids[student]}
            return self

        def sort(self, *a):
            return [{"_id": "x", "user_id": 1, "title": "Learn SQL", "mode": "skill_development",
                     "context": {"target_skill": "SQL"}, "created_at": datetime(2026, 10, 1, tzinfo=timezone.utc),
                     "updated_at": datetime(2026, 10, 2, tzinfo=timezone.utc),
                     "messages": [{"role": "user", "content": "hi", "at": datetime(2026, 10, 1, tzinfo=timezone.utc)}]}]
    monkeypatch.setattr(app.mongo, "chat_sessions", lambda: Chats())
    employer, student = users.employer(), users.student(skills=("Python",), visible=True)
    job = post_job(employer)
    app_id = client.post("/applications", headers=users.h(student), json={"job_id": job["job_ref"]}).json()["id"]
    client.patch(f"/employer/applications/{app_id}", headers=users.h(employer),
                 json={"status": "rejected", "reason": "other", "note": "We chose someone local."})
    job2 = post_job(employer, title="Graduate Data Analyst")
    client.post("/employer/invitations", headers=users.h(employer), json={"job_id": job2["id"], "student_id": users.ids[student]})
    inv = client.get("/applications/invitations", headers=users.h(student)).json()[0]
    client.patch(f"/applications/invitations/{inv['id']}", headers=users.h(student), json={"dismissed": True})
    data = json.loads(client.get("/auth/me/export", headers=users.h(student)).content)

    def columns(table):
        return {c["name"] for c in sa_inspect(db.get_bind()).get_columns(table)} - set(EXPORT_SKIP.get(table, ()))
    assert set(data["account"]) == columns("users")
    a = data["applications"][0]
    assert columns("applications") <= set(a) and (a["reason"], a["note"]) == ("other", "We chose someone local.")
    assert {"match_have", "match_total", "match_at", "reason_skills"} <= set(a)
    assert columns("application_events") <= set(a["events"][0])
    i = data["invitations"][0]
    assert columns("job_invitations") <= set(i) and i["dismissed_at"]
    assert data["career_office_decisions"] == []
    chat = data["ai_assistant_chats"][0]
    assert chat["context"] == {"target_skill": "SQL"} and chat["updated_at"].startswith("2026-10-02")
    assert "_id" not in chat and "user_id" not in chat and chat["messages"][0]["at"].startswith("2026-10-01")
