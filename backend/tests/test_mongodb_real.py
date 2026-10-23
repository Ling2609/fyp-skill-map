"""
MongoDB for real (23 Oct, her question "what about MongoDB, no need testing?"). The other tests replace MongoDB with
small stand-ins, so they never show that a real MongoDB server accepts SkillMap's documents, builds its indexes, or
deletes what it should. These do, against the MongoDB on this computer, in a SEPARATE database, `skillmap_test`,
which is emptied at the start of each test (your own `skillmap` database is never touched).

They need MongoDB running (the Windows service, as for the app). If it isn't, they are skipped with a message, so the
rest of the suite still runs. Server: TEST_MONGODB_URL if set, else MONGODB_URL in backend/.env, else localhost:27017.
"""
import os
from datetime import timezone
from pathlib import Path

import pytest
from dotenv import dotenv_values
from pymongo import MongoClient
from pymongo.errors import PyMongoError

from conftest import PASSWORD

BACKEND = Path(__file__).resolve().parents[1]
URL = (os.environ.get("TEST_MONGODB_URL") or dotenv_values(BACKEND / ".env").get("MONGODB_URL")
       or "mongodb://localhost:27017")
TEST_DB = "skillmap_test"           # never the app's own database

try:
    _client = MongoClient(URL, serverSelectionTimeoutMS=1500, tz_aware=True)
    _client.admin.command("ping")
except PyMongoError:
    pytest.skip(f"MongoDB isn't running at {URL}: the real-MongoDB tests are skipped (start the MongoDB service to "
                f"run them)", allow_module_level=True)

import app.mongo as mongo                                   # noqa: E402
import app.services.extraction_records as er               # noqa: E402
import app.services.evaluation_runs as ev                  # noqa: E402
from app.routers.chatbot import ChatRequest, save_exchange  # noqa: E402
from app.models.user import User                            # noqa: E402

REAL_RECORDS_COL = er._col          # kept before conftest's fixture swaps it for an in-memory stand-in


@pytest.fixture
def real(monkeypatch):
    """Point SkillMap at the empty `skillmap_test` database on the real server for one test."""
    assert "test" in TEST_DB
    _client.drop_database(TEST_DB)
    db = _client[TEST_DB]
    monkeypatch.setattr(mongo, "get_db", lambda: db)
    monkeypatch.setattr(mongo, "_indexes_done", False)
    monkeypatch.setattr(er, "_col", REAL_RECORDS_COL)
    monkeypatch.setitem(er._state, "indexes", False)
    monkeypatch.setitem(er._state, "down_until", 0.0)
    yield db
    _client.drop_database(TEST_DB)


def _user(db_session, email):
    return db_session.query(User).filter(User.email == email).one()


def _chat(user, question, session_id=None, mode="skill_development"):
    req = ChatRequest(mode=mode, messages=[{"role": "user", "content": question}], session_id=session_id,
                      target_skill="SQL")
    return save_exchange(req, user, f"Answer to: {question}")


def test_mongodb_really_builds_the_indexes_including_the_18_month_expiry(real):
    mongo.chat_sessions()
    chats = real["chat_sessions"].index_information()
    assert chats["chat_expiry"]["expireAfterSeconds"] == 548 * 24 * 3600          # 18 months after the last message
    assert any(i["key"] == [("user_id", 1), ("updated_at", -1)] for i in chats.values())
    er._col()
    records = real["extraction_records"].index_information()
    assert records["project_expiry"]["expireAfterSeconds"] == 548 * 24 * 3600
    assert records["project_expiry"]["partialFilterExpression"] == {"kind": "project"}   # job ad records are kept


def test_a_chat_is_saved_listed_reopened_continued_and_deleted(client, users, db, real):
    student, other = users.student(), users.student()
    me = _user(db, student)
    sid = _chat(me, "How do I learn SQL joins?")
    assert sid and real["chat_sessions"].count_documents({"_id": sid, "user_id": me.id}) == 1

    listed = client.get("/chatbot/sessions", headers=users.h(student)).json()
    assert [(c["id"], c["message_count"]) for c in listed] == [(sid, 2)]
    assert listed[0]["title"] == "How do I learn SQL joins?" and listed[0]["context"]["target_skill"] == "SQL"

    assert _chat(me, "And outer joins?", session_id=sid) == sid                 # continues the same chat
    opened = client.get(f"/chatbot/sessions/{sid}", headers=users.h(student)).json()
    assert [m["content"] for m in opened["messages"]] == [
        "How do I learn SQL joins?", "Answer to: How do I learn SQL joins?", "And outer joins?", "Answer to: And outer joins?"]
    saved = real["chat_sessions"].find_one({"_id": sid})
    assert saved["updated_at"].tzinfo is not None and saved["updated_at"].utcoffset() == timezone.utc.utcoffset(None)

    # another student can't open, continue or delete it (and isn't told it exists)
    assert client.get(f"/chatbot/sessions/{sid}", headers=users.h(other)).status_code == 404
    assert client.delete(f"/chatbot/sessions/{sid}", headers=users.h(other)).status_code == 404
    assert _chat(_user(db, other), "Hijack?", session_id=sid) != sid
    assert real["chat_sessions"].find_one({"_id": sid})["user_id"] == me.id

    assert client.delete(f"/chatbot/sessions/{sid}", headers=users.h(student)).status_code == 204
    assert client.get("/chatbot/sessions", headers=users.h(student)).json() == []


def test_download_my_data_and_delete_my_account_cover_everything_in_mongodb(client, users, db, real):
    student = users.student()
    me = _user(db, student)
    _chat(me, "Plan for learning Docker")
    rid = er.record("project", model="test", prompt_version="v", proposed=["Docker"], kept=["Docker"],
                    outcome="kept", source="Shop API", user_id=me.id)
    er.record("job", model="test", prompt_version="v", proposed=["SQL"], kept=["SQL"], outcome="kept", source="job-1")
    assert rid and real["extraction_records"].count_documents({"user_id": me.id}) == 1

    data = client.get("/auth/me/export", headers=users.h(student)).json()
    assert [c["title"] for c in data["ai_assistant_chats"]] == ["Plan for learning Docker"]
    assert [s["source"] for s in data["project_skill_suggestions"]] == ["Shop API"]

    r = client.post("/auth/me/delete", headers=users.h(student), json={"password": PASSWORD})
    assert r.status_code == 204
    assert real["chat_sessions"].count_documents({"user_id": me.id}) == 0
    assert real["extraction_records"].count_documents({"user_id": me.id}) == 0
    assert real["extraction_records"].count_documents({"kind": "job"}) == 1       # not hers: kept


def test_an_evaluation_run_is_saved_and_read_back(real):
    run_id = ev.record("Real MongoDB check", objective=1, method="test", dataset={"n": 3}, metrics={"f1": 0.5},
                       with_setup=False)
    runs = ev.all_runs()
    assert [(r["_id"], r["name"], r["metrics"]["f1"]) for r in runs] == [(run_id, "Real MongoDB check", 0.5)]
