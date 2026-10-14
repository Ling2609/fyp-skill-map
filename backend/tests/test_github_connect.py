"""Connect GitHub (14 Oct): signing in to GitHub proves which accounts are a student's own; a project's repo shows
whether one of them owns it or contributed to it; import lists only her accounts' repos; never blocks saving.
GitHub itself is replaced by fixed answers."""
import json
from urllib.parse import parse_qs, urlparse

import pytest

from conftest import PASSWORD, sql


class Reply:
    def __init__(self, status, body):
        self.status_code, self._body, self.headers = status, body, {}

    def json(self):
        return self._body


@pytest.fixture
def github(monkeypatch):
    """A fake GitHub: who signs in, who owns / contributed to which repo, and each account's repos."""
    import app.services.github_repo as gr
    from app.config import settings
    monkeypatch.setattr(settings, "github_client_id", "test-client")
    monkeypatch.setattr(settings, "github_client_secret", "test-secret")
    world = {"signin": {"id": 101, "login": "Ling2609"},
             "contributors": {"team/capstone": ["Ling2609", "friend"], "someone/weather-app": ["someone"]},
             "repos": {"Ling2609": [{"name": "fyp-skill-map", "html_url": "https://github.com/Ling2609/fyp-skill-map"}],
                       "lingwl-apu": [{"name": "uni-lab", "html_url": "https://github.com/lingwl-apu/uni-lab"}]}}

    def fake_get(url, **params):
        if world.get("down"):                       # GitHub unreachable / over its limit
            return Reply(503, {})
        path = urlparse(url).path.strip("/").split("/")
        if path[0] == "repos" and path[-1] == "contributors":
            people = world["contributors"].get(f"{path[1]}/{path[2]}")
            return Reply(200, [{"login": x} for x in people]) if people is not None else Reply(404, {})
        if path[0] == "repos" and path[-1] == "languages":
            return Reply(200, {"Python": 100})
        if path[0] == "users":
            return Reply(200, world["repos"].get(path[1], []))
        return Reply(404, {})
    monkeypatch.setattr(gr, "_get", fake_get)
    monkeypatch.setattr(gr, "exchange_code", lambda code, uri: dict(world["signin"]))
    import app.routers.github_connect as gc
    monkeypatch.setattr(gc, "exchange_code", lambda code, uri: dict(world["signin"]))
    return world


def _connect(client, users, student, world, login, gid):
    world["signin"] = {"id": gid, "login": login}
    url = client.get("/profile/github/connect-url", headers=users.h(student)).json()["url"]
    state = parse_qs(urlparse(url).query)["state"][0]
    return client.post("/profile/github/connect", headers=users.h(student), json={"code": "abc", "state": state})


def _project(client, users, student, url):
    r = client.post("/profile/projects", headers=users.h(student), json={
        "name": url.rsplit("/", 1)[-1], "description": "A project built with Python and Flask.", "github_url": url,
        "skills": {"Python": "Added by you"}})
    assert r.status_code == 201, r.text
    return r.json()


def test_not_set_up_says_so(client, users, monkeypatch):
    # 15 Oct: blank the app's id and secret here, so the test doesn't depend on whether backend/.env has them
    from app.config import settings
    monkeypatch.setattr(settings, "github_client_id", "")
    monkeypatch.setattr(settings, "github_client_secret", "")
    student = users.student(skills=())
    r = client.get("/profile/github/connect-url", headers=users.h(student))
    assert r.status_code == 503 and "GITHUB_CLIENT_ID" in r.json()["detail"]


def test_connect_check_repos_and_disconnect(client, users, github):
    student = users.student(skills=())
    # before connecting: any repo is "not linked"
    assert _project(client, users, student, "https://github.com/Ling2609/fyp-skill-map")["repo_check"] == "not_linked"
    r = _connect(client, users, student, github, "Ling2609", 101)
    assert r.status_code == 200 and r.json()["connected"] == "Ling2609" and r.json()["newly_yours"] == 1
    projects = client.get("/profile/projects", headers=users.h(student)).json()
    assert (projects[0]["repo_check"], projects[0]["repo_check_as"]) == ("yours", "Ling2609")   # re-checked on connect
    # a team repo she committed to counts; someone else's doesn't, but is still saved
    assert _project(client, users, student, "https://github.com/team/capstone")["repo_check"] == "yours"
    other = _project(client, users, student, "https://github.com/someone/weather-app")
    assert other["repo_check"] == "not_linked"
    # the form's live check
    r = client.post("/profile/github/check", headers=users.h(student), json={"url": "https://github.com/someone/weather-app"})
    assert r.json() == {"status": "not_linked", "as": None, "connected": True}
    # employers see it
    showcase = client.get("/profile/showcase", headers=users.h(student)).json()
    assert {p["name"]: p["repo_check"] for p in showcase["projects"]}["weather-app"] == "not_linked"
    assert showcase["links"]["github"] == "https://github.com/Ling2609"
    # 15 Oct: employers get only the positive badge ("not linked" may just mean an account she hasn't connected)
    from app.models.user import User
    from app.services.showcase import build_showcase
    users.db.expire_all()
    seen = build_showcase(users.db.get(User, users.ids[student]), users.db, for_employer=True)
    assert {p["name"]: p["repo_check"] for p in seen["projects"]} == {
        "fyp-skill-map": "yours", "capstone": "yours", "weather-app": None}
    # disconnecting: her repos are not linked any more
    acc = client.get("/profile/github/accounts", headers=users.h(student)).json()["accounts"][0]
    client.delete(f"/profile/github/accounts/{acc['id']}", headers=users.h(student))
    assert {p["repo_check"] for p in client.get("/profile/projects", headers=users.h(student)).json()} == {"not_linked"}


def test_several_accounts_and_one_owner_per_github_account(client, users, github):
    student, other = users.student(skills=()), users.student(skills=())
    assert _connect(client, users, student, github, "Ling2609", 201).status_code == 200
    assert _connect(client, users, student, github, "lingwl-apu", 202).status_code == 200
    repos = client.get("/profile/github/repos", headers=users.h(student)).json()["repos"]
    assert {(r["name"], r["account"]) for r in repos} == {("fyp-skill-map", "Ling2609"), ("uni-lab", "lingwl-apu")}
    assert _project(client, users, student, "https://github.com/lingwl-apu/uni-lab")["repo_check_as"] == "lingwl-apu"
    # the same GitHub account can't be claimed by another student
    assert _connect(client, users, other, github, "Ling2609", 201).status_code == 409


def test_import_needs_a_connected_account_and_typed_link_is_ignored(client, users, github):
    student = users.student(skills=())
    r = client.get("/profile/github/repos", headers=users.h(student), params={"account": "torvalds"})
    assert r.status_code == 400 and "Connect" in r.json()["detail"]
    about = client.get("/profile/about", headers=users.h(student)).json()
    about["github_url"] = "https://github.com/torvalds"
    client.put("/profile/about", headers=users.h(student), json=about)
    assert client.get("/profile/showcase", headers=users.h(student)).json()["links"]["github"] is None


def test_state_is_bound_to_the_student_and_cannot_sign_in(client, users, github):
    student, other = users.student(skills=()), users.student(skills=())
    url = client.get("/profile/github/connect-url", headers=users.h(student)).json()["url"]
    state = parse_qs(urlparse(url).query)["state"][0]
    r = client.post("/profile/github/connect", headers=users.h(other), json={"code": "abc", "state": state})
    assert r.status_code == 400
    # the state is signed with the same key as sign-in tokens but has no "sub": it can't be used to sign in
    assert client.get("/profile/about", headers={"Authorization": f"Bearer {state}"}).status_code == 401


def test_export_and_delete_include_connected_accounts(client, users, github, monkeypatch):
    import app.mongo

    class Chats:
        def find(self, q):
            return self

        def sort(self, *a):
            return []

        def delete_many(self, q):
            pass
    monkeypatch.setattr(app.mongo, "chat_sessions", lambda: Chats())
    student = users.student(skills=())
    _connect(client, users, student, github, "Ling2609", 301)
    data = json.loads(client.get("/auth/me/export", headers=users.h(student)).content)
    assert data["github_accounts"][0]["login"] == "Ling2609"
    sid = users.ids[student]
    assert client.post("/auth/me/delete", headers=users.h(student), json={"password": PASSWORD}).status_code == 204
    assert sql(users.db, "select count(*) from github_accounts where user_id=:i", i=sid).scalar() == 0


def test_github_down_never_shows_an_old_badge_on_a_new_link(client, users, github):
    """15 Oct (outside audit): when GitHub can't answer, a result is kept only for the same repo and while the account
    that proved it is still connected; otherwise no badge (unknown), never an old "yours"."""
    student = users.student(skills=())
    _connect(client, users, student, github, "Ling2609", 401)
    _connect(client, users, student, github, "lingwl-apu", 402)
    team = _project(client, users, student, "https://github.com/team/capstone")
    assert team["repo_check"] == "yours"
    github["down"] = True
    # same link, GitHub down: kept
    body = {"name": "capstone", "description": "A project built with Python and Flask, edited.",
            "github_url": "https://github.com/team/capstone", "skills": {"Python": "Added by you"}}
    assert client.put(f"/profile/projects/{team['id']}", headers=users.h(student), json=body).json()["repo_check"] == "yours"
    # another link, GitHub down: unknown, not the old "yours"
    body["github_url"] = "https://github.com/someone/weather-app"
    r = client.put(f"/profile/projects/{team['id']}", headers=users.h(student), json=body).json()
    assert (r["repo_check"], r["repo_check_as"]) == (None, None)
    # the account that proved it is disconnected while GitHub is down: the badge goes
    body["github_url"] = "https://github.com/team/capstone"
    github["down"] = False
    assert client.put(f"/profile/projects/{team['id']}", headers=users.h(student), json=body).json()["repo_check_as"] == "Ling2609"
    github["down"] = True
    acc = [a for a in client.get("/profile/github/accounts", headers=users.h(student)).json()["accounts"] if a["login"] == "Ling2609"][0]
    client.delete(f"/profile/github/accounts/{acc['id']}", headers=users.h(student))
    p = [x for x in client.get("/profile/projects", headers=users.h(student)).json() if x["id"] == team["id"]][0]
    assert p["repo_check"] is None
