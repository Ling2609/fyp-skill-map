"""E6 (19 Oct): the reading rules for qualification, field, languages, citizenship and salary, and the evaluation
pipeline (sample -> labels -> score) on a throwaway database."""
import csv
import json
import os
import sys

from app.services.ad_requirements import read_ad

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "scripts", "evaluation"))
import evaluate_ad_requirements as e6  # noqa: E402

from conftest import sql  # noqa: E402

AD = ("Requirements: Bachelor's or Master's degree in Computer Science, IT or related field. Fluent in English and "
      "Mandarin. Malaysians only. Salary: RM 3,500 - RM 4,500 per month.")


def test_rules():
    r = read_ad(AD)
    assert r["qualification"]["level"] == "bachelor"                    # the lowest level accepted
    assert "Computer Science" in r["field"]["field"]
    assert r["languages"]["languages"] == ["English", "Mandarin"]
    assert r["citizenship"]["quote"].startswith("Malaysians only")
    assert r["salary"]["salary"] == "RM 3,500 – RM 4,500"
    assert read_ad(AD, salary_field="RM 4,000")["salary"] is None       # the job's own salary field wins
    assert read_ad("Master's degree or above in AI.")["qualification"]["level"] == "master"
    assert read_ad("Diploma/Degree in IT.")["qualification"]["level"] == "diploma"
    none = read_ad("Scrum Master experience. Master data management. MSC Status company. Chinese New Year bonus.")
    assert all(v is None for v in none.values())
    assert read_ad("Salary RM 2800   RM 3200 Job Responsibilities")["salary"]["salary"] == "RM 2800 – RM 3200"


def test_sample_and_score(db, tmp_path, monkeypatch):
    long = " Build and test services with the team every day." * 8
    for i, (desc, salary) in enumerate([(AD + long, ""), ("Diploma in IT. Good English." + long, "RM 3,000"),
                                        ("No requirements listed." + long, "")]):
        sql(db, "insert into jobs (job_id, job_title, company, location, description, source, salary) "
                "values (:j, 'Dev', 'Acme', 'KL', :d, 'live', :s)", j=f"live_e6_{i}", d=desc, s=salary)
    step4 = tmp_path / "judging.json"
    step4.write_text(json.dumps({"pairs": [{"pair": "SE|live_e6_2"}]}))      # a step-4 ad is never sampled
    monkeypatch.setattr(e6, "OUT", str(tmp_path / "out"))
    monkeypatch.setattr(e6, "STEP4", str(step4))
    e6.sample()
    ads = e6.load("ads.json")["ads"]
    ids = {a["job_id"] for a in ads}
    assert "live_e6_2" not in ids and {"live_e6_0", "live_e6_1"} <= ids
    # the author's labels: right for the first ad; the second ad's language deliberately differs from the rules
    rows = list(csv.DictReader(open(e6.path("labels_author.csv"), encoding="utf-8-sig")))
    for r in rows:
        job = next(a for a in ads if a["id"] == r["id"])["job_id"]
        if job == "live_e6_0":
            r.update(qualification="bachelor", field="Computer Science, IT or related", languages="English, Mandarin",
                     citizenship="yes", salary="RM 3,500 - 4,500")
        elif job == "live_e6_1":
            r.update(qualification="diploma", field="IT", languages="English, Malay", citizenship="no", salary="")
        else:
            r.update(qualification="none", field="none", languages="none", citizenship="no", salary="none")
    with open(e6.path("labels_author.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    e6.score()
    text = open(e6.path("scores.txt"), encoding="utf-8").read()
    n = len(ads)
    assert f"qualification{'':<1}" in text and "languages" in text
    per = list(csv.DictReader(open(e6.path("per_ad.csv"), encoding="utf-8-sig")))
    lang_wrong = [p for p in per if p["languages ok"] == "NO"]
    assert len(lang_wrong) == 1                                              # only the deliberate difference
    assert all(p["qualification ok"] == "yes" for p in per)
    assert len(per) == n


def test_fixes_after_e6():
    """Misses found in E6 and fixed afterwards (19 Oct). Not re-measured: E6's numbers are for the frozen rules."""
    assert read_ad("B.S in Engineering, Physics or related fields.")["qualification"]["level"] == "bachelor"   # A22
    assert "Physics" in read_ad("B.S in Engineering, Physics or related fields.")["field"]["field"]
    assert read_ad("University/University of Applied Sciences or equivalent experience")["qualification"]["level"] == "bachelor"
    assert read_ad("Our clients include BS Group.")["qualification"] is None             # "BS" alone is not a degree
    assert read_ad("Graduated from the National University of Singapore.")["qualification"] is None
    langs = read_ad("Clear communication in English; Chinese capability is advantageous.")["languages"]["languages"]
    assert langs == ["English", "Mandarin"]                                                 # A25
    year = read_ad("Annual salary ranging from MYR 108000 to MYR 144000.")["salary"]
    assert year["period"] == "year" and year["salary"] == "MYR 108000 – MYR 144000"
    assert read_ad("Pay: RM2,000.00 - RM3,000.00 per month")["salary"]["period"] == "month"


def _gap(client, users, student, ref):
    r = client.post("/skillgap/", headers=users.h(student), json={"job_id": ref})
    assert r.status_code == 200, r.text
    return r.json()["job"]["requirements"]


def test_live_job_requirements_read_by_the_rules_without_citizenship(client, users, db):
    student = users.student()
    text = ("Build REST APIs in Python and write SQL every day. Requirements: Diploma or Degree in Computer Science. "
            "Good command of English and Bahasa Malaysia. Malaysians only. Salary: RM 3,000 - RM 3,800 per month.")
    sql(db, "insert into jobs (job_id, job_title, company, location, description, source, salary) "
            "values ('live_e6_show', 'Dev', 'Acme', 'KL', :d, 'live', '')", d=text)
    jid = sql(db, "select id from jobs where job_id='live_e6_show'").scalar()
    sql(db, "insert into job_skills (job_id, job_ref, skill_name) values (:j, 'live_e6_show', 'Python')", j=jid)
    req = _gap(client, users, student, "live_e6_show")
    assert req["qualification"]["level"] == "diploma"
    assert "Computer Science" in req["field"]["field"]
    assert req["languages"]["languages"] == ["English", "Malay"]
    assert req["salary"]["salary"] == "RM 3,000 – RM 3,800" and req["salary"]["period"] == "month"
    assert "citizenship" not in req                                                  # E6: not shown


def test_skillmap_post_requirements_come_from_the_employers_fields(client, users):
    """Option F (19 Oct): a SkillMap post shows only what the employer chose, never what the rules read."""
    employer, student = users.employer(), users.student()
    cats = client.get("/jobs/subcategories", params={"include_past": True}, headers=users.h(employer)).json()
    body = {"title": "Graduate Engineer", "location": "Kuala Lumpur", "salary": "",
            "category": cats[0] if cats else "Developers/Programmers",
            "description": "Build REST APIs in Python and write SQL. Master's degree in Physics. Fluent Japanese. " * 2,
            "skills": [{"name": s, "level": "required", "quote": "", "group": ""} for s in ("Python", "SQL")], "soft": []}
    job = client.post("/employer/jobs", headers=users.h(employer), json=body).json()
    req = _gap(client, users, student, job["job_ref"])
    assert all(v is None for v in req.values())                     # nothing chosen: no pills, the text isn't read
    assert client.post("/employer/jobs", headers=users.h(employer),
                       json={**body, "min_qualification": "x" * 41}).status_code == 400
    assert client.post("/employer/jobs", headers=users.h(employer),
                       json={**body, "languages": ["12345"]}).status_code == 400
    # "Other" (her rule): a qualification and a language in the employer's own words
    other = client.post("/employer/jobs", headers=users.h(employer),
                        json={**body, "min_qualification": "SPM with credit in English", "languages": ["hokkien", "english"]})
    assert other.status_code == 200, other.text
    req = _gap(client, users, student, other.json()["job_ref"])
    assert req["qualification"] == {"level": "other", "name": "SPM with credit in English", "quote": None}
    assert req["languages"]["languages"] == ["English", "hokkien"]
    edit = {"description": body["description"], "salary": "", "skills": body["skills"], "soft": [],
            "min_qualification": "advanced_diploma", "study_field": "  Computer Science,  IT or related ",
            "languages": ["Mandarin", "English", "Mandarin"]}
    r = client.put(f"/employer/jobs/{job['id']}", headers=users.h(employer), json=edit)
    assert r.status_code == 200, r.text
    saved = client.get(f"/employer/jobs/{job['id']}/edit", headers=users.h(employer)).json()
    assert (saved["min_qualification"], saved["study_field"], saved["languages"]) == (
        "advanced_diploma", "Computer Science, IT or related", ["English", "Mandarin"])
    req = _gap(client, users, student, job["job_ref"])
    assert req["qualification"] == {"level": "advanced_diploma", "name": "Advanced Diploma", "quote": None}
    assert req["field"]["field"] == "Computer Science, IT or related"
    assert req["languages"]["languages"] == ["English", "Mandarin"]
    assert req["salary"] is None


def test_no_requirements_on_past_postings(client, users, db):
    """2024 JobStreet past postings are market data, not jobs to apply to: no pills (her call, 19 Oct)."""
    student = users.student()
    sql(db, "insert into jobs (job_id, job_title, company, location, description, source, salary) "
            "values ('js_e6_past', 'Dev', 'Acme', 'KL', 'Degree in Computer Science. Fluent English.', 'jobstreet', '')")
    jid = sql(db, "select id from jobs where job_id='js_e6_past'").scalar()
    sql(db, "insert into job_skills (job_id, job_ref, skill_name) values (:j, 'js_e6_past', 'Python')", j=jid)
    gap = client.post("/skillgap/", headers=users.h(student), json={"job_id": "js_e6_past"})
    assert gap.status_code == 200, gap.text
    assert gap.json()["job"]["requirements"] is None


def test_skills_gained_in_the_role_are_listed_not_counted(client, users):
    """19 Oct (her T1, wording G1): a skill the employer puts under "Gained in the role" is sent to Job Detail for its
    own card and never counts in the %."""
    employer, student = users.employer(), users.student(skills=("Python", "Jira"))
    cats = client.get("/jobs/subcategories", params={"include_past": True}, headers=users.h(employer)).json()
    body = {"title": "Graduate Engineer", "location": "Kuala Lumpur", "salary": "",
            "category": cats[0] if cats else "Developers/Programmers",
            "description": "Build REST APIs in Python every day. You will learn our SAP setup and Jira on the job. " * 2,
            "skills": [{"name": "Python", "level": "required", "quote": "", "group": ""},
                       {"name": "SAP", "level": "trained", "quote": "", "group": ""},
                       {"name": "Jira", "level": "trained", "quote": "", "group": ""}], "soft": []}
    job = client.post("/employer/jobs", headers=users.h(employer), json=body)
    assert job.status_code == 200, job.text
    gap = client.post("/skillgap/", headers=users.h(student), json={"job_id": job.json()["job_ref"]}).json()
    # her review (19 Oct): checked like every other skill: Jira she has (ticked), SAP she doesn't (Learn)
    assert {g["job_skill"]: g["has"] for g in gap["learn_on_job"]} == {"SAP": False, "Jira": True}
    assert gap["summary"]["job_skills_total"] == 1                                   # only Python counts
    assert not {"SAP", "Jira"} & {m["job_skill"] for m in gap["missing_skills"] + gap["matched_skills"]}
