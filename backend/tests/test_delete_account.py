"""Delete my account (13 Oct): a student's own data goes, with the password asked again; other people's data stays."""
import pytest

from conftest import PASSWORD, sql


class FakeChats:
    def __init__(self):
        self.deleted = []

    def delete_many(self, query):
        self.deleted.append(query)


@pytest.fixture
def chats(monkeypatch):
    import app.mongo
    fake = FakeChats()
    monkeypatch.setattr(app.mongo, "chat_sessions", lambda: fake)
    return fake


def test_student_deletes_their_account_and_data(client, users, post_job, db, chats):
    employer, student, other = users.employer(), users.student(visible=True), users.student(visible=True)
    job = post_job(employer)
    client.post("/applications", headers=users.h(student), json={"job_id": job["job_ref"]})
    client.post("/applications", headers=users.h(other), json={"job_id": job["job_ref"]})
    sid, oid = users.ids[student], users.ids[other]

    assert client.post("/auth/me/delete", headers=users.h(student), json={"password": "wrong"}).status_code == 400
    assert sql(db, "select count(*) from users where id=:i", i=sid).scalar() == 1      # wrong password: nothing gone

    r = client.post("/auth/me/delete", headers=users.h(student), json={"password": PASSWORD})
    assert r.status_code == 204, r.text
    assert chats.deleted == [{"user_id": sid}]
    for table, col in (("users", "id"), ("applications", "student_id"), ("user_projects", "user_id"),
                       ("job_invitations", "student_id"), ("user_modules", "user_id")):
        assert sql(db, f"select count(*) from {table} where {col}=:i", i=sid).scalar() == 0, table
    # the other student's application, the employer and the job are untouched
    assert sql(db, "select count(*) from applications where student_id=:i", i=oid).scalar() == 1
    assert client.get("/employer/jobs", headers=users.h(employer)).status_code == 200
    # the old sign-in no longer works
    assert client.get("/auth/me", headers=users.h(student)).status_code == 401
    assert client.post("/auth/login", json={"email": student, "password": PASSWORD}).status_code in (400, 401)


def test_employers_and_admins_ask_the_career_office(client, users, chats):
    employer, admin = users.employer(), users.admin()
    for who in (employer, admin):
        r = client.post("/auth/me/delete", headers=users.h(who), json={"password": PASSWORD})
        assert r.status_code == 403
    assert chats.deleted == []


def test_nothing_is_deleted_when_chat_history_cannot_be_reached(client, users, db, monkeypatch):
    import app.mongo
    from pymongo.errors import ServerSelectionTimeoutError

    class Down:
        def delete_many(self, query):
            raise ServerSelectionTimeoutError("down")
    monkeypatch.setattr(app.mongo, "chat_sessions", lambda: Down())
    student = users.student()
    r = client.post("/auth/me/delete", headers=users.h(student), json={"password": PASSWORD})
    assert r.status_code == 503
    assert sql(db, "select count(*) from users where id=:i", i=users.ids[student]).scalar() == 1
