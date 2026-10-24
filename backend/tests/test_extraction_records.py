"""MongoDB extraction_records (14 Oct): every time the AI reads skills, what it proposed, what the checks kept and
rejected (with the reason), and what a person then changed. The AI is replaced by fixed answers; MongoDB by the
in-memory collection in conftest (`records`)."""
import json

from conftest import PASSWORD


def _only(records, **query):
    found = [d for d in records.docs if all(d.get(k) == v for k, v in query.items())]
    assert len(found) == 1, found
    return found[0]


def test_project_suggestion_kept_rejected_and_what_the_student_changed(client, users, records, monkeypatch):
    import app.routers.profile as profile
    # the AI invents "Kubernetes" (not in her words) and finds "Flask" (in them)
    monkeypatch.setattr(profile, "_ask_json", lambda prompt, label: [
        {"skill": "Flask", "quote": "built with Flask"}, {"skill": "Kubernetes", "quote": "deployed on Kubernetes"}])
    student, other = users.student(skills=()), users.student(skills=())
    h = users.h(student)
    body = {"name": "Library app", "description": "A library system built with Flask and a SQLite database."}
    r = client.post("/profile/projects/suggest", headers=h, json=body)
    assert r.status_code == 200 and [s["name"] for s in r.json()["skills"]] == ["Flask"]
    rid = r.json()["record_id"]
    doc = _only(records, _id=rid)
    assert (doc["kind"], doc["user_id"], doc["outcome"], doc["prompt_version"]) == ("project", users.ids[student], "suggested", "project-v1")
    assert [k["skill"] for k in doc["kept"]] == ["Flask"]
    assert doc["rejected"] == [{"skill": "Kubernetes", "quote": "deployed on Kubernetes", "reason": "not in the description"}]
    # another student can't attach a review to this record
    client.post("/profile/projects", headers=users.h(other), json={**body, "skills": {"SQLite": "Added by you"}, "record_id": rid})
    assert doc["reviews"] == []
    # she keeps Flask, adds SQLite; GitHub languages would be left out of the comparison
    r = client.post("/profile/projects", headers=h, json={**body, "record_id": rid,
                                                          "skills": {"Flask": "built with Flask", "SQLite": "Added by you",
                                                                     "Python": "GitHub: 80% of the code"}})
    assert r.status_code == 201
    review = doc["reviews"][0]
    assert (review["by"], review["added"], review["removed"]) == ("student", ["SQLite"], [])
    assert doc["source"] == str(r.json()["id"])


def test_export_and_delete_include_her_records(client, users, records, monkeypatch):
    import app.mongo
    import app.routers.profile as profile

    class Chats:
        def find(self, q):
            return self

        def sort(self, *a):
            return []

        def delete_many(self, q):
            pass
    monkeypatch.setattr(app.mongo, "chat_sessions", lambda: Chats())
    monkeypatch.setattr(profile, "_ask_json", lambda prompt, label: [{"skill": "Flask", "quote": "built with Flask"}])
    student = users.student(skills=())
    client.post("/profile/projects/suggest", headers=users.h(student),
                json={"name": "Library app", "description": "A library system built with Flask and a database."})
    data = json.loads(client.get("/auth/me/export", headers=users.h(student)).content)
    assert data["project_skill_suggestions"][0]["kept"][0]["skill"] == "Flask"
    assert "user_id" not in data["project_skill_suggestions"][0]
    assert client.post("/auth/me/delete", headers=users.h(student), json={"password": PASSWORD}).status_code == 204
    assert not [d for d in records.docs if d.get("user_id") == users.ids[student]]


def test_employer_read_then_publish_records_their_changes(client, users, records, monkeypatch):
    from app.routers import jobs
    ad = "We need Python and SQL. Docker is a plus. You will build REST APIs in Python every day for our clients."

    class Reader:
        model = "test-model"

        def extract_job_skills_with_evidence(self, title, description, retries=3):
            return [{"skill": "Python", "evidence_quote": "We need Python", "type": "hard", "level": "required"},
                    {"skill": "SQL", "evidence_quote": "Python and SQL", "type": "hard", "level": "required"},
                    {"skill": "Docker", "evidence_quote": "Docker is a plus", "type": "hard", "level": "preferred"},
                    {"skill": "Rust", "evidence_quote": "Rust experience", "type": "hard", "level": "required"}]
    monkeypatch.setattr(jobs, "get_extractor", lambda: Reader())
    employer = users.employer()
    h = users.h(employer)
    r = client.post("/employer/jobs/read", headers=h, json={"title": "Backend Developer", "description": ad})
    assert r.status_code == 200
    doc = _only(records, _id=r.json()["record_id"])
    assert {k["skill"] for k in doc["kept"]} == {"Python", "SQL", "Docker"}
    assert [x["skill"] for x in doc["rejected"]] == ["Rust"] and doc["rejected"][0]["reason"] == "quote not in ad"
    # the employer drops SQL, makes Docker required and adds Git
    cats = client.get("/jobs/subcategories", params={"include_past": True}, headers=h).json()
    skills = [{"name": "Python", "level": "required", "quote": "We need Python", "group": ""},
              {"name": "Docker", "level": "required", "quote": "Docker is a plus", "group": ""},
              {"name": "Git", "level": "required", "quote": "", "group": ""}]
    r = client.post("/employer/jobs", headers=h, json={"title": "Backend Developer", "description": ad, "location": "KL",
                                                       "salary": "", "category": cats[0] if cats else "Developers/Programmers",
                                                       "skills": skills, "soft": [], "record_id": doc["_id"]})
    assert r.status_code == 200
    review = doc["reviews"][0]
    assert (review["by"], review["added"], review["removed"]) == ("employer", ["Git"], ["SQL"])
    assert review["level_changed"] == [{"skill": "Docker", "from": "preferred", "to": "required"}]
    assert doc["source"] == r.json()["job_ref"]


def test_module_extraction_and_career_office_changes(client, users, records, db, monkeypatch):
    from conftest import sql
    from app.nlp.skill_extractor import SkillExtractor
    monkeypatch.setattr(SkillExtractor, "extract_from_module",
                        lambda self, m: {"extracted_skills": ["Routing", "Switching", "routing"]})
    admin = users.admin()
    h = users.h(admin)
    mod_id, code = sql(db, "select id, code from modules where description is not null and description <> '' "
                           "order by id limit 1").one()
    sql(db, "create table bk_ms as select * from module_skills where module_id=:m", m=mod_id)
    reviewed = sql(db, "select skills_reviewed_at from modules where id=:m", m=mod_id).scalar()
    try:
        assert client.post(f"/admin/modules/{mod_id}/extract", headers=h).status_code == 200
        doc = _only(records, kind="module", source=code)
        assert doc["proposed"] == [{"skill": "Routing"}, {"skill": "Switching"}, {"skill": "routing"}]
        assert [k["skill"] for k in doc["kept"]] == ["Routing", "Switching"]
        client.post(f"/admin/modules/{mod_id}/skills", headers=h, json={"name": "VLANs"})
        client.post(f"/admin/modules/{mod_id}/skills/remove", headers=h, json={"name": "Switching"})
        assert [(r["added"], r["removed"]) for r in doc["reviews"]] == [(["VLANs"], []), ([], ["Switching"])]
    finally:        # put the module's skills back as the install made them, for the other tests
        sql(db, "delete from module_skills where module_id=:m", m=mod_id)
        sql(db, "insert into module_skills select * from bk_ms")
        sql(db, "drop table bk_ms")
        sql(db, "update modules set skills_reviewed_at=:t where id=:m", t=reviewed, m=mod_id)


def test_mongodb_down_never_blocks_and_pauses_retries(client, users, monkeypatch):
    import app.routers.profile as profile
    import app.services.extraction_records as er
    calls = []

    def down():
        calls.append(1)
        raise RuntimeError("MongoDB off")
    monkeypatch.setattr(er, "_col", down)
    monkeypatch.setattr(profile, "_ask_json", lambda prompt, label: [{"skill": "Flask", "quote": "built with Flask"}])
    student = users.student(skills=())
    body = {"name": "Library app", "description": "A library system built with Flask and a database."}
    for _ in range(3):
        r = client.post("/profile/projects/suggest", headers=users.h(student), json=body)
        assert r.status_code == 200 and r.json()["skills"][0]["name"] == "Flask" and r.json()["record_id"] is None
    assert len(calls) == 1                     # tried once, then paused for DOWN_PAUSE seconds


def test_reader_down_says_so_quickly_instead_of_no_skills(client, users, monkeypatch):
    """24 Oct (TC-64, found before her manual run): with Groq unreachable, Read skills waited 45 s and then answered
    "no skills". Now the real extractor raises ReaderUnavailable after its tries and the page gets the 503 message
    that offers to add the skills by hand."""
    import app.nlp.skill_extractor as se
    from app.routers import jobs

    class Down:                                   # every call fails, like a network or key failure
        calls = 0

        def create(self, **kw):
            Down.calls += 1
            raise ConnectionError("Connection error.")
    reader = se.SkillExtractor.__new__(se.SkillExtractor)
    reader.client = type("C", (), {"chat": type("Ch", (), {"completions": Down()})()})()
    reader.model, reader._reasoning_ok = "test-model", True
    reader._evidence_format = [{"type": "json_object"}]
    slept = []
    import time as real_time
    from types import SimpleNamespace
    monkeypatch.setattr(se, "time", SimpleNamespace(sleep=slept.append, time=real_time.time,
                                                    perf_counter=real_time.perf_counter))   # only the reader's pauses
    monkeypatch.setattr(jobs, "get_extractor", lambda: reader)

    h = users.h(users.employer())
    ad = "We need Python and SQL. Docker is a plus. You will build REST APIs in Python every day for our clients."
    r = client.post("/employer/jobs/read", headers=h, json={"title": "Backend Developer", "description": ad})
    assert r.status_code == 503 and "add the skills yourself" in r.json()["detail"]
    assert Down.calls == 2 and slept == [5]       # 2 tries, one pause between them, no second "re-ask" round

    # an answer with no skills is still a real answer, not "down"
    class Empty:
        def create(self, **kw):
            msg = type("M", (), {"content": json.dumps({"sentences": [{"id": 1, "skills": []}]})})()
            return type("R", (), {"choices": [type("Ch", (), {"message": msg, "finish_reason": "stop"})()],
                                  "usage": None})()
    reader.client = type("C", (), {"chat": type("Ch", (), {"completions": Empty()})()})()
    assert reader.extract_job_skills_with_evidence("Clerk", "Please file the papers.", glean=False) == []
