"""Limits on what one request may cost (27 Nov, deployment audit).

Two client-side numbers reached the server without a ceiling:
  - the AI Assistant accepted 40 messages of 4,000 characters and sent all of them to Groq (~160,000 characters a
    call, most of a free daily allowance), so only the last 20 turns are sent;
  - GET /jobs/ read a job's skills row by row and took any `limit`, so the number is capped at 100.
The model is replaced by a stand-in that records what it was sent, so these tests need no API key.
"""
import pytest

from app.routers import chatbot


class FakeGroq:
    """Stands in for the Groq client: keeps the messages it was given and answers with a fixed reply."""
    def __init__(self):
        self.sent = None
        self.chat = self
        self.completions = self

    def create(self, **kw):
        self.sent = kw["messages"]
        msg = type("M", (), {"content": "Short answer."})
        return type("R", (), {"choices": [type("C", (), {"message": msg, "finish_reason": "stop"})]})


@pytest.fixture
def groq(monkeypatch):
    fake = FakeGroq()
    monkeypatch.setattr(chatbot, "get_client", lambda: fake)
    monkeypatch.setattr(chatbot, "save_exchange", lambda req, user, reply: None)   # no MongoDB in tests
    return fake


def test_only_the_last_20_turns_reach_the_model(client, users, groq):
    student = users.student()
    messages = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"turn {i}"} for i in range(40)]
    r = client.post("/chatbot/", headers=users.h(student), json={"mode": "career_counsellor", "messages": messages})
    assert r.status_code == 200, r.text
    turns = [m for m in groq.sent if m["role"] in ("user", "assistant")]
    assert len(turns) == chatbot.MAX_HISTORY_MESSAGES
    assert turns[-1]["content"] == "turn 39"          # the newest turn is kept
    assert turns[0]["content"] == "turn 20"           # the oldest ten are dropped


def test_a_short_conversation_is_sent_whole(client, users, groq):
    student = users.student()
    messages = [{"role": "user", "content": "hello"}, {"role": "assistant", "content": "hi"}]
    assert client.post("/chatbot/", headers=users.h(student),
                       json={"mode": "career_counsellor", "messages": messages}).status_code == 200
    assert [m["content"] for m in groq.sent if m["role"] in ("user", "assistant")] == ["hello", "hi"]


def test_jobs_list_limit_has_a_ceiling(client):
    assert client.get("/jobs/", params={"limit": 100}).status_code == 200
    assert client.get("/jobs/", params={"limit": 101}).status_code == 422
    assert client.get("/jobs/", params={"limit": 100000}).status_code == 422
    assert client.get("/jobs/", params={"limit": 0}).status_code == 422
