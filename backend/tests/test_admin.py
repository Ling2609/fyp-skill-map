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


def test_dashboard_lists_recent_activity(client, users):
    """20 Nov: the newest sign-ups and admin decisions, newest first."""
    admin = users.admin()
    users.employer(approved=False)
    recent = client.get("/admin/dashboard", headers=users.h(admin)).json()["recent"]
    assert recent and {"kind", "at", "name", "role"} <= set(recent[0])
    assert [r["at"] for r in recent] == sorted((r["at"] for r in recent), reverse=True)


def test_not_approved_employers_have_their_own_filter(client, users):
    """20 Nov: a rejected employer is listed under Not approved, with the reason in its history."""
    admin = users.admin()
    email = users.employer(approved=False)
    emp_id = next(u["id"] for u in client.get("/admin/users", params={"role": "employer", "status": "pending"}, headers=users.h(admin)).json()
                  if u["email"] == email)
    assert client.post(f"/admin/users/{emp_id}/reject", headers=users.h(admin), json={"reason": "No SSM number"}).status_code == 200
    assert client.get("/admin/users/counts", headers=users.h(admin)).json()["not_approved"] >= 1
    rows = client.get("/admin/users", params={"role": "employer", "status": "rejected"}, headers=users.h(admin)).json()
    assert emp_id in [r["id"] for r in rows]
    hist = client.get(f"/admin/users/{emp_id}/history", headers=users.h(admin)).json()
    assert "No SSM number" in str(hist)
