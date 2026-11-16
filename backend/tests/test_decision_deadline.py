"""Overdue decision promises pause new intake, not existing review or outcomes."""
from datetime import datetime, timedelta, timezone
from conftest import sql


def expire(db, job):
    sql(db, "update jobs set decide_by=:d where id=:i", d=datetime.now(timezone.utc)-timedelta(seconds=1), i=job["id"])


def refs(client, users, student):
    r=client.post("/recommend/", headers=users.h(student), json={"top_n":0})
    assert r.status_code == 200, r.text
    return {j["job_id"] for j in r.json()["recommendations"]}


def test_expired_job_leaves_warm_cache_and_blocks_direct_apply_without_rejecting_existing(client,users,post_job,db):
    employer, early, late=users.employer(),users.student(),users.student()
    job=post_job(employer)
    r=client.post("/applications",headers=users.h(early),json={"job_id":job["job_ref"]})
    assert r.status_code==200,r.text
    app_id=r.json()["id"]
    assert job["job_ref"] in refs(client,users,late)
    expire(db,job)
    assert job["job_ref"] not in refs(client,users,late)
    state=client.get(f"/applications/job/{job['job_ref']}/open",headers=users.h(late)).json()
    assert not state["taking_applications"] and state["deadline_passed"] and not state["closed"]
    gap=client.post("/skillgap/",headers=users.h(late),json={"job_id":job["job_ref"]}).json()
    assert not gap["job"]["taking_applications"] and gap["job"]["deadline_passed"]
    r=client.post("/applications",headers=users.h(late),json={"job_id":job["job_ref"]})
    assert r.status_code==400 and "decision date" in r.json()["detail"]
    mine=client.get("/applications/mine",headers=users.h(early)).json()
    application=next(a for a in mine if a["id"]==app_id)
    assert application["status"]=="applied" and not application["job_closed"]
    assert application["progress"]["nudge"]=="no_decision"
    assert sql(db,"select applications_stopped_at from jobs where id=:i",i=job["id"]).scalar() is None
    # An overdue job still allows review and a real decision.
    r=client.patch(f"/employer/applications/{app_id}",headers=users.h(employer),json={"status":"shortlisted"})
    assert r.status_code==200,r.text
    r=client.patch(f"/employer/applications/{app_id}",headers=users.h(employer),json={"status":"accepted"})
    assert r.status_code==200,r.text


def test_expiry_hides_old_invitations_and_blocks_single_and_bulk_invites(client,users,post_job,db):
    employer, student, another=users.employer(),users.student(visible=True),users.student(visible=True)
    job=post_job(employer)
    body={"job_id":job["id"],"student_id":users.ids[student]}
    assert client.post("/employer/invitations",headers=users.h(employer),json=body).status_code==200
    expire(db,job)
    assert not any(i["job_ref"]==job["job_ref"] for i in client.get("/applications/invitations",headers=users.h(student)).json())
    body["student_id"]=users.ids[another]
    assert client.post("/employer/invitations",headers=users.h(employer),json=body).status_code==400
    assert client.post("/employer/invitations/bulk",headers=users.h(employer),json={"job_id":job["id"],"student_ids":[users.ids[another]]}).status_code==400
    assert client.get(f"/employer/jobs/{job['id']}/graduates",headers=users.h(employer)).json()==[]


def test_overdue_resume_and_extension_cannot_bypass_pause(client,users,post_job,db):
    employer=users.employer()
    job=post_job(employer)
    expire(db,job)
    h=users.h(employer)
    assert client.patch(f"/employer/jobs/{job['id']}",headers=h,json={"stopped":False}).status_code==400
    assert client.post(f"/employer/jobs/{job['id']}/extend",headers=h,json={"days":7,"reason":"More time to review"}).status_code==400
    row=next(j for j in client.get("/employer/jobs",headers=h).json() if j["id"]==job["id"])
    assert row["status"]=="open" and row["stopped"] and row["deadline_passed"]
