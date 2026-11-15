"""Employer suspension must stop new recruitment without deleting its history."""
import pytest
from conftest import sql


def refs(client, users, student):
    r = client.post("/recommend/", headers=users.h(student), json={"top_n": 0})
    assert r.status_code == 200, r.text
    return {j["job_id"] for j in r.json()["recommendations"]}


@pytest.mark.parametrize("action", ["deactivate", "reject"])
def test_owner_status_blocks_new_applications_and_restores_visibility(client, users, post_job, db, action):
    admin, employer = users.admin(), users.employer()
    early, late = users.student(), users.student()
    job = post_job(employer)
    url = f"/admin/users/{users.ids[employer]}"
    h = users.h(early)
    r = client.post("/applications", headers=h, json={"job_id": job["job_ref"]})
    assert r.status_code == 200, r.text
    app_id = r.json()["id"]
    assert job["job_ref"] in refs(client, users, late)  # populate recommendation cache first

    r = client.post(f"{url}/{action}", headers=users.h(admin), json={"reason": "Account under review"})
    assert r.status_code == 200, r.text
    assert job["job_ref"] not in refs(client, users, late)
    fresh = client.get(f"/applications/job/{job['job_ref']}/open", headers=users.h(late)).json()
    assert fresh["taking_applications"] is False and fresh["closed"] is False
    gap = client.post("/skillgap/", headers=users.h(late), json={"job_id": job["job_ref"]})
    assert gap.status_code == 200, gap.text
    assert gap.json()["job"]["taking_applications"] is False
    denied = client.post("/applications", headers=users.h(late), json={"job_id": job["job_ref"]})
    assert denied.status_code == 400 and "employer" in denied.json()["detail"].lower()
    mine = client.get("/applications/mine", headers=h).json()
    saved = next(a for a in mine if a["id"] == app_id)
    assert saved["status"] == "applied" and saved["taking_applications"] is False
    assert sql(db, "select closed_at from jobs where id=:i", i=job["id"]).scalar() is None

    restore = "reactivate" if action == "deactivate" else "approve"
    r = client.post(f"{url}/{restore}", headers=users.h(admin), json={"reason": "Account review completed"})
    assert r.status_code == 200, r.text
    assert job["job_ref"] in refs(client, users, late)
    assert client.get(f"/applications/job/{job['job_ref']}/open", headers=users.h(late)).json()["taking_applications"] is True


def test_closed_job_stays_closed_after_owner_reactivation(client, users, post_job):
    admin, employer, student = users.admin(), users.employer(), users.student()
    job = post_job(employer)
    r = client.patch(f"/employer/jobs/{job['id']}", headers=users.h(employer),
                     json={"closed": True, "reason": "not_filling"})
    assert r.status_code == 200, r.text
    url = f"/admin/users/{users.ids[employer]}"
    for action in ("deactivate", "reactivate"):
        assert client.post(f"{url}/{action}", headers=users.h(admin),
                           json={"reason": "Review account access"}).status_code == 200
    state = client.get(f"/applications/job/{job['job_ref']}/open", headers=users.h(student)).json()
    assert state["closed"] is True and state["taking_applications"] is False
    assert job["job_ref"] not in refs(client, users, student)
