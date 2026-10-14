"""Sign-up, sign-in and who may call what."""
from conftest import PASSWORD, sql


def test_employer_must_give_a_company_name(client):
    r = client.post("/auth/register", json={"username": "nocomp", "first_name": "A", "last_name": "B",
                                            "email": "nocomp@example.com", "password": PASSWORD, "role": "employer"})
    assert r.status_code == 422 and "company" in r.text.lower()


def test_admin_cannot_be_chosen_at_sign_up(client):
    r = client.post("/auth/register", json={"username": "sneaky", "first_name": "A", "last_name": "B",
                                            "email": "sneaky@example.com", "password": PASSWORD, "role": "admin"})
    assert r.status_code == 422


def test_same_email_twice_is_refused(client, users):
    email = users.register("student")
    r = client.post("/auth/register", json={"username": "other1", "first_name": "A", "last_name": "B",
                                            "email": email, "password": PASSWORD, "role": "student", "accept_privacy": True})
    assert r.status_code in (400, 409) and "email" in r.text.lower()


def test_wrong_password_is_refused(client, users):
    email = users.register("student")
    assert client.post("/auth/login", json={"email": email, "password": "Wrong-Password-99"}).status_code == 401


def test_deactivated_account_old_token_stops_working(client, users, db):
    email = users.student()
    h = users.h(email)
    assert client.get("/applications/mine", headers=h).status_code == 200
    sql(db, "update users set is_active=false where id=:i", i=users.ids[email])
    assert client.get("/applications/mine", headers=h).status_code in (401, 403)
    sql(db, "update users set is_active=true where id=:i", i=users.ids[email])


def test_role_checks(client, users):
    student, employer, admin = users.student(), users.employer(), users.admin()
    assert client.get("/admin/users", headers=users.h(student)).status_code == 403
    assert client.get("/admin/users", headers=users.h(employer)).status_code == 403
    assert client.get("/admin/users", headers=users.h(admin)).status_code == 200
    assert client.get("/employer/dashboard", headers=users.h(student)).status_code == 403
    assert client.get("/applications/mine", headers=users.h(employer)).status_code == 403
    assert client.get("/employer/dashboard").status_code == 401


def test_employer_waiting_or_rejected_cannot_use_employer_pages(client, users):
    waiting = users.employer(approved=False)
    assert client.get("/employer/dashboard", headers=users.h(waiting)).status_code == 403
    rejected = users.employer(approved=False)
    r = client.post(f"/admin/users/{users.ids[rejected]}/reject", headers=users.h(users.admin()), json={"reason": "Not a real company"})
    assert r.status_code == 200, r.text
    assert client.get("/employer/dashboard", headers=users.h(rejected)).status_code == 403


def test_sign_up_needs_the_privacy_notice_accepted(client, db):
    """14 Oct (PDPA notice and choice): no account without ticking the notice; the time it was accepted is kept."""
    body = {"username": "notick", "first_name": "A", "last_name": "B", "email": "notick@example.com",
            "password": PASSWORD, "role": "student"}
    r = client.post("/auth/register", json=body)
    assert r.status_code == 400 and "privacy notice" in r.text
    assert client.post("/auth/register", json={**body, "accept_privacy": True}).status_code in (200, 201)
    assert sql(db, "select privacy_accepted_at is not null from users where username='notick'").scalar()
