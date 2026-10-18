"""18 Oct (her finding): an employer post that said only "test ttttt..." was shown on Job Detail as a full invented
advert. Now: an employer's post is shown as written (no AI), and a Gemini answer for a live advert is used only when
every bullet is found in the advert."""
import json

import app.routers.jobs as jobs_router
from app.services.description_check import grounded_share, ungrounded

from conftest import sql

INVENTED = ["## Responsibilities",
            "Design, develop, and maintain high-quality software solutions as part of an agile engineering team.",
            "## Benefits", "Access to a comprehensive health, dental, and vision insurance package."]


def test_the_check():
    assert len(ungrounded(INVENTED, "test\n" + "t" * 80)) == 2          # both bullets invented, headers skipped
    ad = "Requirements:  Degree in Computer Science.  Strong SQL and Python skills.  Teamworkand communication."
    tidy = ["## Requirements", "Degree in Computer Science.", "Strong SQL and Python skills.", "Teamwork and communication."]
    assert ungrounded(tidy, ad) == []                                    # the ad's own words (spacing fixed) pass
    assert grounded_share("Free gym membership and dental insurance.", ad) == 0
    assert ungrounded(["The internship lasts three to six months."], "Internship: 3-6 months, hybrid.") == []


class Boom:
    def format_job_description(self, *a):
        raise AssertionError("an employer's post must not go to the AI")


class Inventor:
    def format_job_description(self, *a):
        return INVENTED


def test_employer_post_is_shown_as_written(client, users, post_job, monkeypatch):
    monkeypatch.setattr(jobs_router, "get_extractor", lambda: Boom())
    employer, student = users.employer(), users.student()
    job = post_job(employer)
    r = client.get(f"/jobs/{job['job_ref']}/description", headers=users.h(student))
    assert r.status_code == 200, r.text
    text = " ".join(r.json()["bullets"])
    assert "Build REST APIs in Python" in text and "dental" not in text


def test_invented_answer_for_a_live_ad_is_dropped(client, users, db, monkeypatch):
    monkeypatch.setattr(jobs_router, "get_extractor", lambda: Inventor())
    student = users.student()
    ad = "Junior Developer.  Requirements:  Python and SQL.  Good English."
    sql(db, "insert into jobs (job_id, job_title, company, location, description, source) "
            "values ('live_grounding_t', 'Junior Developer', 'Acme', 'Kuala Lumpur', :d, 'live')", d=ad)
    r = client.get("/jobs/live_grounding_t/description", headers=users.h(student))
    bullets = r.json()["bullets"]
    assert "dental" not in " ".join(bullets).lower()                   # Gemini's invention is not shown
    assert any("Python and SQL" in b for b in bullets)                   # the ad's own text is
    saved = sql(db, "select formatted_description from jobs where job_id='live_grounding_t'").scalar()
    assert "dental" not in (saved or "")
    assert json.loads(saved) == bullets
