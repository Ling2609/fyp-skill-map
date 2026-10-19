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
