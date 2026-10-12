"""The career office approving employers, with a history of who decided what."""
from conftest import sql


def test_approve_moves_employer_out_of_waiting(client, users, db):
    admin, employer = users.admin(), users.employer(approved=False)
    waiting = client.get("/admin/users", params={"role": "employer", "status": "pending"}, headers=users.h(admin)).json()
    assert any(u["id"] == users.ids[employer] for u in waiting)
    assert client.post(f"/admin/users/{users.ids[employer]}/approve", headers=users.h(admin)).status_code == 200
    waiting = client.get("/admin/users", params={"role": "employer", "status": "pending"}, headers=users.h(admin)).json()
    assert all(u["id"] != users.ids[employer] for u in waiting)
    assert sql(db, "select count(*) from admin_actions where target_user_id=:i", i=users.ids[employer]).scalar() == 1


def test_deactivate_needs_a_reason(client, users):
    admin, student = users.admin(), users.student()
    assert client.post(f"/admin/users/{users.ids[student]}/deactivate", headers=users.h(admin), json={"reason": ""}).status_code in (400, 422)
    assert client.post(f"/admin/users/{users.ids[student]}/deactivate", headers=users.h(admin), json={"reason": "Left the university"}).status_code == 200
    assert client.post(f"/admin/users/{users.ids[student]}/reactivate", headers=users.h(admin), json={"reason": "Came back"}).status_code == 200


def test_admin_cannot_deactivate_themselves(client, users):
    admin = users.admin()
    r = client.post(f"/admin/users/{users.ids[admin]}/deactivate", headers=users.h(admin), json={"reason": "testing myself"})
    assert r.status_code in (400, 403)
