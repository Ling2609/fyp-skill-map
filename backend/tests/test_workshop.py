"""20 Nov: the career office's workshop planner: a draft from the skill gaps (AI text, SkillMap's numbers), a template
when the model is not available, and the proposal as a PDF."""
import json

from app.routers import chatbot

GAPS = [{"skill": "Reporting", "students": 6, "of_students": 9}, {"skill": "Analytics", "students": 5, "of_students": 9}]


def _fake_client(reply: str):
    class C:
        def create(self, **kw):
            msg = type("M", (), {"content": reply})()
            return type("R", (), {"choices": [type("Ch", (), {"message": msg, "finish_reason": "stop"})()]})()
    return lambda: type("G", (), {"chat": type("X", (), {"completions": C()})()})()


def _gaps(monkeypatch):
    monkeypatch.setattr("app.routers.workshop.common_skill_gaps", lambda db: GAPS)


def test_draft_uses_skillmap_numbers_and_the_model_text(client, users, monkeypatch):
    _gaps(monkeypatch)
    monkeypatch.setattr(chatbot, "get_client", _fake_client(json.dumps({
        "title": "Data to decisions", "background_rest": "A practical session would help.",
        "objectives": ["Build a report"], "outcomes": "They can build a report.",
        "agenda": [["0:00–0:30", "Intro"], ["0:30–4:00", "Hands-on"]]})))
    r = client.post("/admin/workshop/draft", headers=users.h(users.admin()), json={"skills": ["Reporting", "Analytics"]})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["source"] == "ai" and d["title"] == "Data to decisions"
    assert d["background"].startswith("In SkillMap's job matching, 6 of 9 students lack Reporting; 5 of 9 students lack Analytics")
    assert "[to fill in]" in d["resources"] and d["agenda"][0] == ["0:00–0:30", "Intro"]
    assert "speaker" in d["partners"] and "[to fill in]" in d["partners"]


def test_a_bad_model_answer_falls_back_to_the_template(client, users, monkeypatch):
    _gaps(monkeypatch)
    monkeypatch.setattr(chatbot, "get_client", _fake_client("not json"))
    d = client.post("/admin/workshop/draft", headers=users.h(users.admin()), json={"skills": ["Reporting"], "length": "2h"}).json()
    assert d["source"] == "template" and "Reporting" in d["title"]
    assert d["agenda"][-1][0].endswith("2:00")


def test_only_listed_gaps_and_choices_and_only_admins(client, users, monkeypatch):
    _gaps(monkeypatch)
    h = users.h(users.admin())
    assert client.post("/admin/workshop/draft", headers=h, json={"skills": ["Cooking"]}).status_code == 400
    assert client.post("/admin/workshop/draft", headers=h, json={"skills": ["Reporting"], "length": "week"}).status_code == 400
    assert client.post("/admin/workshop/draft", headers=users.h(users.student()), json={"skills": ["Reporting"]}).status_code == 403


def test_the_proposal_exports_as_a_pdf(client, users):
    body = {"title": "Data to decisions", "facts": ["Half day"], "background": "B", "objectives": ["O"], "outcomes": "L",
            "participants": "P", "partners": "Contact: [to fill in]", "agenda": [["0:00–0:30", "Intro"]], "resources": "R", "evaluation": "E"}
    r = client.post("/admin/workshop/pdf", headers=users.h(users.admin()), json=body)
    assert r.status_code == 200 and r.content[:4] == b"%PDF"
    assert "workshop-proposal-data-to-decisions" in r.headers["content-disposition"]


class FakeCol:
    """Enough of a pymongo collection for these tests."""
    def __init__(self):
        self.docs = {}

    def insert_one(self, d):
        self.docs[d["_id"]] = dict(d)

    def find_one(self, q):
        return self.docs.get(q["_id"])

    def find(self, q=None, proj=None):
        rows = list(self.docs.values())
        class Cur(list):
            def sort(self, key, order):
                return Cur(sorted(self, key=lambda r: r[key], reverse=order == -1))
            def limit(self, n):
                return Cur(self[:n])
        return Cur(rows)

    def update_one(self, q, u, upsert=False):
        d = self.docs.get(q["_id"])
        if d is None and upsert:
            d = self.docs[q["_id"]] = {"_id": q["_id"], **u.get("$setOnInsert", {})}
        elif d is not None:
            d.update(u.get("$set", {}))
        return type("R", (), {"matched_count": int(d is not None)})()

    def delete_one(self, q):
        self.docs.pop(q["_id"], None)


BODY = {"skills": ["Reporting"], "proposal": {"title": "Data to decisions", "facts": [], "background": "B", "objectives": ["O"],
        "outcomes": "L", "participants": "P", "partners": "", "agenda": [], "resources": "R", "evaluation": "E"}}


def test_proposals_are_saved_listed_updated_and_deleted(client, users, monkeypatch):
    import app.mongo
    col = FakeCol()
    monkeypatch.setattr(app.mongo, "workshop_proposals", lambda: col)
    h = users.h(users.admin())
    pid = client.post("/admin/workshop/proposals", headers=h, json=BODY).json()["id"]
    assert [p["title"] for p in client.get("/admin/workshop/proposals", headers=h).json()] == ["Data to decisions"]
    changed = {**BODY, "proposal": {**BODY["proposal"], "title": "Reporting for graduates"}}
    assert client.put(f"/admin/workshop/proposals/{pid}", headers=h, json=changed).status_code == 200
    assert client.get(f"/admin/workshop/proposals/{pid}", headers=h).json()["proposal"]["title"] == "Reporting for graduates"
    client.delete(f"/admin/workshop/proposals/{pid}", headers=h)
    assert client.get(f"/admin/workshop/proposals/{pid}", headers=h).status_code == 404


def test_saving_says_so_when_mongodb_is_off(client, users):
    # the test settings point MongoDB at a closed port
    r = client.post("/admin/workshop/proposals", headers=users.h(users.admin()), json=BODY)
    assert r.status_code == 503 and "isn't available" in r.json()["detail"]


def test_skill_gaps_keep_one_copy_a_week(client, users, monkeypatch):
    import app.mongo
    from app.routers import admin as adm
    col = FakeCol()
    monkeypatch.setattr(app.mongo, "gap_snapshots", lambda: col)
    adm._snapshot([{"skill": "Git", "students": 7, "of_students": 9}])
    adm._snapshot([{"skill": "Git", "students": 3, "of_students": 9}])      # later the same week: the first is kept
    hist = client.get("/admin/skill-gaps/history", headers=users.h(users.admin())).json()
    assert len(hist) == 1 and hist[0]["gaps"] == [{"skill": "Git", "students": 7}]
