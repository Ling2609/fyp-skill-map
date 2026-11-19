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
