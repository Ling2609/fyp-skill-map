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
