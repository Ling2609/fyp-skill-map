"""20 Nov: employers give a company website and SSM number at sign-up, so the career office can check the company is
real before approving it. The SSM number is required, the website optional (a small company may have none); bad formats are refused; the admin's list shows them with two checks."""
from conftest import PASSWORD


def _register(client, n, **extra):
    body = {"username": f"emp_d{n}", "first_name": "Jason", "last_name": "Ong", "email": extra.pop("email", f"jason{n}@tropika.com.my"),
            "password": PASSWORD, "role": "employer", "company_name": "Tropika Systems Sdn Bhd", "accept_privacy": True, **extra}
    return client.post("/auth/register", json=body)


def test_website_and_ssm_are_saved_and_shown_to_the_admin(client, users):
    r = _register(client, 1, company_website="tropika.com.my", company_ssm="2023 0101 2345")
    assert r.status_code in (200, 201), r.text
    admin = users.admin()
    row = next(u for u in client.get("/admin/users", params={"role": "employer", "status": "pending"}, headers=users.h(admin)).json()
               if u["email"] == "jason1@tropika.com.my")
    assert row["company_website"] == "https://tropika.com.my"
    assert row["company_ssm"] == "202301012345"
    assert row["email_matches_site"] is True and row["free_email"] is False


def test_ssm_is_required_and_the_website_optional(client, users):
    assert _register(client, 6).status_code == 422
    assert _register(client, 7, company_website="tropika.com.my").status_code == 422
    r = _register(client, 8, company_ssm="202301012347")
    assert r.status_code in (200, 201), r.text
    row = next(u for u in client.get("/admin/users", params={"role": "employer", "status": "pending"}, headers=users.h(users.admin())).json()
               if u["email"] == "jason8@tropika.com.my")
    assert row["company_website"] is None and row["email_matches_site"] is False


def test_a_gmail_address_is_flagged(client, users):
    assert _register(client, 2, email="jason.ong@gmail.com", company_website="tropika.com.my", company_ssm="202301012346").status_code in (200, 201)
    admin = users.admin()
    pending = client.get("/admin/dashboard", headers=users.h(admin)).json()["todo"]["pending_employers"]
    row = next(u for u in pending if u["email"] == "jason.ong@gmail.com")
    assert row["free_email"] is True and row["email_matches_site"] is False


def test_bad_formats_are_refused(client):
    assert _register(client, 3, company_ssm="ABC", company_website="tropika.com.my").status_code == 422
    assert _register(client, 4, company_website="not a website", company_ssm="202301012347").status_code == 422
    assert _register(client, 5, company_ssm="1234567-X", company_website="tropika.com.my").status_code in (200, 201)   # older SSM format


def test_students_rows_have_no_company_checks(client, users):
    admin, student = users.admin(), users.student(skills=())
    row = next(u for u in client.get("/admin/users", params={"role": "student"}, headers=users.h(admin)).json()
               if u["id"] == users.ids[student])
    assert "company_ssm" not in row
