"""The goal picker's career comparison (13 Oct): GET /recommend/fit lists every career (job category) with how many of
its most-asked skills the student has, best fit first, also when she already has a goal."""
GOOD, POOR = "Fit Test Good Fits", "Fit Test Poor Fits"


def _post(client, users, employer, category, required):
    r = client.post("/employer/jobs", headers=users.h(employer), json={
        "title": "Engineer", "location": "Kuala Lumpur", "salary": "", "category": category,
        "description": "Build and run services for our customers every day. " * 3,
        "skills": [{"name": s, "level": "required", "quote": "", "group": ""} for s in required], "soft": []})
    assert r.status_code == 200, r.text


def test_careers_best_fit_first_with_a_goal_set(client, users):
    employer, student = users.employer(), users.student(skills=("Python", "Docker"))
    for _ in range(3):                                   # a career needs a few jobs before it is compared
        _post(client, users, employer, GOOD, ("Python", "Docker"))
        _post(client, users, employer, POOR, ("Haskell", "Python"))
    assert client.put("/profile/goal", headers=users.h(student), json={"category": POOR}).status_code == 200

    r = client.get("/recommend/fit", headers=users.h(student))
    assert r.status_code == 200, r.text
    fit = {b["category"]: (b["have"], b["of"]) for b in r.json()["best_fit"]}
    assert fit[GOOD] == (2, 2) and fit[POOR] == (1, 2)
    order = [b["category"] for b in r.json()["best_fit"]]
    assert order.index(GOOD) < order.index(POOR)        # best fit first, even though her goal is the other one
    assert {GOOD, POOR} <= {c["name"] for c in r.json()["categories"]}


def test_fit_needs_a_profile_and_a_login(client, users):
    assert client.get("/recommend/fit").status_code == 401
    assert client.get("/recommend/fit", headers=users.h(users.student(skills=()))).status_code == 400
