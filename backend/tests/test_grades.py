"""Module grades (13 Oct audit): only the pass grades the page offers are accepted, so a fail can't make a module's
skills count."""
from conftest import sql


def test_only_pass_grades_are_accepted(client, users, db):
    student = users.student(skills=())
    code = sql(db, "select code from modules order by code limit 1").scalar()
    for bad in (0.0, 1.0, 1.7, 3.5, 4.3):
        r = client.post("/profile/modules", headers=users.h(student), json={"grades": [{"module_code": code, "grade": bad}]})
        assert r.status_code == 422, (bad, r.text)
    r = client.post("/profile/modules", headers=users.h(student), json={"grades": [{"module_code": code, "grade": 2.0}]})
    assert r.status_code == 200, r.text


def test_changing_programme_removes_grades_only_after_confirming(client, users, db):
    """20 Oct (her bug report): grades of modules not in the new programme/intake kept counting. Now the change is
    refused with the list (409) until she confirms; a module in both lists keeps its grade."""
    student = users.student(skills=())
    h = users.h(student)
    se = sql(db, "select id from programmes where code = 'SE'").scalar()
    other = sql(db, "select p.id from programmes p where p.code <> 'SE' and exists (select 1 from programme_modules pm "
                    "where pm.programme_id = p.id) order by p.id limit 1").scalar()
    # study the SE programme (an intake, when SE has any)
    intake = sql(db, "select id from intakes where programme_id = :p order by id limit 1", p=se).scalar()
    assert client.put("/profile/study", headers=h, json={"programme_id": se, "intake_id": intake}).status_code == 200
    mine = {m["code"] for m in client.get("/modules/", headers=h).json()}
    other_intake = sql(db, "select id from intakes where programme_id = :p order by id limit 1", p=other).scalar()
    sql(db, "update users set programme_id = :p, intake_id = :i where id = :u", p=other, i=other_intake, u=users.ids[student])
    theirs = {m["code"] for m in client.get("/modules/", headers=h).json()}
    sql(db, "update users set programme_id = :p, intake_id = :i where id = :u", p=se, i=intake, u=users.ids[student])
    only_se, shared = sorted(mine - theirs), sorted(mine & theirs)
    assert only_se
    grades = [{"module_code": only_se[0], "grade": 3.0}] + ([{"module_code": shared[0], "grade": 4.0}] if shared else [])
    assert client.post("/profile/modules", headers=h, json={"grades": grades}).status_code == 200

    r = client.put("/profile/study", headers=h, json={"programme_id": other, "intake_id": other_intake})
    assert r.status_code == 409, r.text
    assert [m["code"] for m in r.json()["detail"]["modules"]] == [only_se[0]]
    assert sql(db, "select programme_id from users where id = :u", u=users.ids[student]).scalar() == se   # unchanged

    r = client.put("/profile/study", headers=h, json={"programme_id": other, "intake_id": other_intake, "remove_grades": True})
    assert r.status_code == 200, r.text
    left = {g["module_code"] for g in client.get("/profile/modules", headers=h).json()["grades"]}
    assert left == set(shared[:1])
