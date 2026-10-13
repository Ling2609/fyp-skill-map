"""The AI Assistant's learning plan (13 Oct): only checked links reach the student, every plan ends with putting the
work on My Profile, and "Download plan (PDF)" gives a printable page. The language model is replaced by a stand-in
that returns a fixed reply, so these tests need no API key."""
import pytest

from app.routers import chatbot
from app.services import learning_resources as L

RESOURCES = {"skills": [
    {"skill": "Docker", "aliases": ["containers"], "resources": [
        {"name": "Docker: Get started", "url": "https://docs.docker.com/get-started/", "provider": "Docker",
         "kind": "docs", "cost": "free", "checked": "2026-10-13", "ok": True},
        {"name": "Broken page", "url": "https://example.com/gone", "provider": "Example", "kind": "docs",
         "cost": "free", "checked": "2026-10-13", "ok": False}]},
    {"skill": "Java", "aliases": [], "resources": []},
]}

PLAN = """### Learning plan: Docker
Docker is nice to have for this job.

#### Resources
- **Docker: Get started** (Docker, free): [the guide](https://docs.docker.com/get-started/)
- **A made-up course** [here](https://www.youtube.com/watch?v=made-up) and https://example.com/gone.

#### Your plan
| Step | What to do | Time | Done when |
|---|---|---|---|
| 1. Basics | Run a container | 1 week (5 h) | You can list running containers |

#### Show it: portfolio project
Package your Java API with Docker."""


@pytest.fixture(autouse=True)
def resource_list(monkeypatch):
    monkeypatch.setattr(L, "_load", lambda path=None: RESOURCES)


class FakeGroq:
    """Stands in for the Groq client: remembers what it was sent and answers with `reply`."""
    def __init__(self, reply):
        self.reply, self.sent = reply, None
        self.chat = self
        self.completions = self

    def create(self, **kw):
        self.sent = kw["messages"]
        msg = type("M", (), {"content": self.reply})
        return type("R", (), {"choices": [type("C", (), {"message": msg, "finish_reason": "stop"})]})


@pytest.fixture
def groq(monkeypatch):
    fake = FakeGroq(PLAN)
    monkeypatch.setattr(chatbot, "get_client", lambda: fake)
    monkeypatch.setattr(chatbot, "save_exchange", lambda req, user, reply: None)   # no MongoDB in the tests
    return fake


def test_only_checked_links_stay():
    text, removed = L.strip_unlisted_links(PLAN)
    assert "https://docs.docker.com/get-started/" in text            # on the list and opened: kept
    assert "youtube.com" not in text and "example.com" not in text    # made up / failed its check: removed
    assert "**A made-up course** here and." in text                           # the words of a removed link stay
    assert removed == 2


def test_plan_gets_the_my_profile_step_and_only_checked_links(client, users, groq):
    student = users.student(skills=("Java",))
    r = client.post("/chatbot/", headers=users.h(student), json={
        "mode": "skill_development", "messages": [{"role": "user", "content": "I want to learn Docker"}],
        "hours_per_week": 3})
    assert r.status_code == 200, r.text
    reply = r.json()["reply"]
    assert "youtube.com" not in reply
    assert "| Add it to SkillMap |" in reply and reply.index("| 1. Basics") < reply.index("| Add it to SkillMap")
    context = next(m["content"] for m in groq.sent if m["role"] == "system" and m["content"].startswith("User context"))
    assert "Hours a week the user can spend learning: 3" in context
    assert "https://docs.docker.com/get-started/" in context and "example.com/gone" not in context


def test_hours_a_week_are_limited(client, users, groq):
    student = users.student()
    r = client.post("/chatbot/", headers=users.h(student), json={
        "mode": "skill_development", "messages": [{"role": "user", "content": "plan"}], "hours_per_week": 100})
    assert r.status_code == 422


def test_download_plan_as_pdf(client, users, post_job):
    employer, student = users.employer(), users.student(skills=("Python",))
    job = post_job(employer, required=("Python", "Docker"))
    r = client.post("/chatbot/plan-pdf", headers=users.h(student), json={"content": PLAN, "job_id": job["job_ref"]})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf" and r.content.startswith(b"%PDF")
    assert 'filename="learning-plan-docker.pdf"' in r.headers["content-disposition"]
    # a message that isn't a plan has nothing to print
    r = client.post("/chatbot/plan-pdf", headers=users.h(student), json={"content": "Hello"})
    assert r.status_code == 400
    # signed in only
    assert client.post("/chatbot/plan-pdf", json={"content": PLAN}).status_code == 401


def test_search_links_work_for_any_skill(client, users, groq):
    # A search page opens whatever the words, so it is allowed for every skill; a video or course page is not
    text, removed = L.strip_unlisted_links("[Search Coursera](https://www.coursera.org/search?query=Kotlin) and "
                                           "[a video](https://www.youtube.com/watch?v=made-up)")
    assert "coursera.org/search?query=Kotlin" in text and "watch?v=" not in text and removed == 1
    assert L.search_links("C#")[0].endswith("query=C%23")          # "#" would cut the address short
    # A skill that isn't on the list gets search links in the context
    student = users.student()
    client.post("/chatbot/", headers=users.h(student), json={
        "mode": "skill_development", "messages": [{"role": "user", "content": "plan"}], "target_skill": "Kotlin"})
    context = next(m["content"] for m in groq.sent if m["role"] == "system" and m["content"].startswith("User context"))
    assert "https://www.coursera.org/search?query=Kotlin" in context


def test_a_link_opened_by_hand_counts():
    # A site that blocks robots can't be checked by the script (ok = None); a date in checked_by_hand lets it through
    entry = {"skill": "Linux", "resources": [
        {"url": "https://a.example/", "ok": None, "checked_by_hand": "2026-10-13"},
        {"url": "https://b.example/", "ok": None, "checked_by_hand": None},
        {"url": "https://c.example/", "ok": False, "checked_by_hand": "2026-10-13"}]}     # failed later: not shown
    assert [r["url"] for r in L.checked(entry)] == ["https://a.example/"]
