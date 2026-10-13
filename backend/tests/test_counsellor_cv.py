"""CV points and interview practice in the AI Assistant's career counsellor (13 Oct; IR Sprint 4 "resume tips,
interview preparation"). The assistant gets the student's OWN projects, certifications and strongest modules from the
database, and is told never to invent a result. The language model is replaced by a stand-in (no API key needed)."""
import pytest

from app.routers import chatbot
from conftest import sql
from test_learning_plan import FakeGroq


@pytest.fixture
def groq(monkeypatch):
    fake = FakeGroq("**Shop API**\n- Built a REST API using Python, so that [number?] orders ...")
    monkeypatch.setattr(chatbot, "get_client", lambda: fake)
    monkeypatch.setattr(chatbot, "save_exchange", lambda req, user, reply: None)
    return fake


def _context(fake):
    return next(m["content"] for m in fake.sent if m["role"] == "system" and m["content"].startswith("User context"))


def test_cv_points_use_only_her_own_profile(client, users, db, groq):
    student, other = users.student(skills=("Python", "SQL")), users.student(skills=("Kotlin",))
    sql(db, "update user_projects set name='Bus Tracker' where user_id=:i", i=users.ids[other])
    me = users.ids[student]
    sql(db, "insert into user_certifications (user_id, cert_name, issuer, mapped_skills, added_skills) "
            "values (:i, 'AWS Cloud Practitioner', 'Amazon Web Services', '{}', '[]')", i=me)
    sql(db, "insert into modules (code, name, level, type) values ('CVT001', 'Database Systems', 2, 'common') "
            "on conflict (code) do nothing")
    sql(db, "insert into user_modules (user_id, module_code, grade) values (:i, 'CVT001', 4.0), (:i, 'CVT001x', 2.0)", i=me)

    try:
        r = client.post("/chatbot/", headers=users.h(student), json={
            "mode": "career_counsellor", "messages": [{"role": "user", "content": "Turn my projects into CV points"}]})
    finally:      # the made-up module goes again: the install test counts the real 198
        sql(db, "delete from user_modules where module_code like 'CVT001%'")
        sql(db, "delete from modules where code='CVT001'")
    assert r.status_code == 200, r.text
    context = _context(groq)
    assert "Project: Shop API. An online shop backend with a database. Skills: Python, SQL" in context
    assert "AWS Cloud Practitioner (Amazon Web Services)" in context
    assert "Strongest modules: Database Systems (A)" in context
    assert "Bus Tracker" not in context                         # another student's project never leaks in
    rules = groq.sent[0]["content"]
    assert "[number?]" in rules and "never invent" in rules       # results are asked for, not made up
    assert "STAR" in rules and "ONE question at a time" in rules  # interview practice


def test_no_projects_is_said_and_skill_plans_get_no_cv_block(client, users, groq):
    student = users.student(skills=())
    client.post("/chatbot/", headers=users.h(student), json={
        "mode": "career_counsellor", "messages": [{"role": "user", "content": "Practise interview questions with me"}]})
    assert "Projects on SkillMap: none yet" in _context(groq)
    client.post("/chatbot/", headers=users.h(student), json={
        "mode": "skill_development", "messages": [{"role": "user", "content": "How do I learn Docker?"}]})
    assert "Projects on SkillMap" not in "".join(m["content"] for m in groq.sent if m["role"] == "system")
