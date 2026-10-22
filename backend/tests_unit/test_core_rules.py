"""
Unit tests for the rules behind SkillMap's answers (22 Oct). Each one gives a single function a small, made-up input
and checks its output, so a failure points straight at the rule that broke.

  Objective 1, academic skills:    grade_weight (how strong a module grade is as evidence),
                                   check_quote (a skill read from an ad must be in the ad's own words)
  Objective 2, recommendation:     classify_seniority / job_level (senior roles are ranked lower)
  Objective 3, skill gap:          score_job (the "you have 1 of 3" and the % on Job Matches and Job Detail)
  Objective 4, AI assistant:       strip_unlisted_links (no made-up links in learning plans)
  Accounts / employers:            password_problem, _asks_for_more (after applying, a job can ask for less, not more)
"""
from types import SimpleNamespace as NS

import unit_setup  # noqa: F401  (settings and the model stand-in, before the app is imported)
import pytest

from app.services.job_requirements import JobSkillItem, score_job
from app.services.skill_profile import SELF_DECLARED_WEIGHT, grade_weight
from app.services.job_titles import classify_seniority, job_level
from app.services.evidence import check_quote
from app.services.learning_resources import strip_unlisted_links
from app.services.password_policy import password_problem


def item(name, level="required", skill_type="hard", group=None):
    return JobSkillItem(name=name, key=name.lower(), level=level, skill_type=skill_type, group=group)


# ── Objective 3: the match and the gap (score_job) ──────────────────────────────────────────────────────────────

def test_coverage_is_required_skills_she_has_out_of_all_required():
    # The example in the browser test: Python, SQL, Git required; she has Python only
    items = [item("Python"), item("SQL"), item("Git")]
    r = score_job(items, has=[True, False, False])
    assert (r["matched"], r["total"], r["coverage"], r["basis"]) == (1, 3, 33.3, "required")
    assert r["core_met"] == [True, False, False]          # which ones are the gap: SQL and Git


def test_either_or_skills_count_as_one_requirement_met_by_any_of_them():
    # "C# or Python" is one requirement, met with Python alone
    items = [item("C#", group="lang"), item("Python", group="lang"), item("SQL")]
    r = score_job(items, has=[False, True, False])
    assert (r["matched"], r["total"], r["coverage"]) == (1, 2, 50.0)


def test_nice_to_have_skills_are_not_in_the_percentage():
    items = [item("Python"), item("Docker", level="preferred"), item("Kubernetes", level="preferred")]
    r = score_job(items, has=[True, True, False])
    assert (r["matched"], r["total"], r["coverage"]) == (1, 1, 100.0)
    assert r["bonus_ratio"] == 0.5                           # ranking bonus only: has 1 of 2 nice-to-haves


def test_skills_learnt_in_the_role_and_soft_skills_are_never_a_gap():
    items = [item("Python"), item("Terraform", level="trained"), item("Teamwork", skill_type="soft")]
    r = score_job(items, has=[True, False, False])
    assert (r["matched"], r["total"]) == (1, 1)
    assert r["learn"] == ["Terraform"] and r["soft"] == ["Teamwork"]


@pytest.mark.parametrize("levels, basis", [
    (["unspecified", "unspecified"], "unspecified"),   # the ad requires nothing: its other listed skills are used
    (["preferred", "preferred"], "preferred"),         # only nice-to-haves: those are used
])
def test_an_ad_that_requires_nothing_is_scored_on_what_it_lists(levels, basis):
    items = [item("Python", level=levels[0]), item("SQL", level=levels[1])]
    r = score_job(items, has=[True, False])
    assert (r["basis"], r["matched"], r["total"], r["coverage"]) == (basis, 1, 2, 50.0)


def test_an_ad_with_no_skills_shows_zero_not_an_error():
    r = score_job([], has=[])
    assert (r["matched"], r["total"], r["coverage"]) == (0, 0, 0.0)


# ── Objective 1: how strong a grade is as evidence (grade_weight) ──────────────────────────────────────────────

@pytest.mark.parametrize("grade, weight", [(4.0, 1.0), (3.7, 0.9), (3.3, 0.8), (3.0, 0.7), (2.7, 0.6), (2.0, 0.5)])
def test_grade_weight_follows_the_grade_scale(grade, weight):
    assert grade_weight(grade) == weight


def test_a_better_grade_never_counts_less_and_an_A_counts_more_than_a_self_declared_skill():
    grades = [2.0, 2.3, 2.7, 3.0, 3.3, 3.7, 4.0]
    weights = [grade_weight(g) for g in grades]
    assert weights == sorted(weights)
    assert grade_weight(4.0) > SELF_DECLARED_WEIGHT


# ── Objective 1: a skill read from an ad must be quoted from it (check_quote) ──────────────────────────────────

AD = "We are hiring a graduate. You must have strong Python skills and experience with SQL databases."


def test_a_quote_that_is_in_the_ad_is_accepted():
    found, score, _ = check_quote("strong Python skills", AD)
    assert found and score == 1.0


def test_a_quote_that_is_not_in_the_ad_is_rejected():
    found, _, _ = check_quote("five years of Kubernetes administration", AD)
    assert not found


def test_each_part_of_a_quote_with_dots_must_be_in_the_ad():
    assert check_quote("strong Python skills ... experience with SQL databases", AD)[0]
    assert not check_quote("strong Python skills ... experience with Kubernetes clusters", AD)[0]


# ── Objective 2: senior roles are ranked lower (classify_seniority, job_level) ─────────────────────────────────

@pytest.mark.parametrize("title, level", [
    ("Graduate Software Engineer", "junior"),
    ("Software Engineer", "unspecified"),
    ("Senior Associate, Data", "senior"),        # checked from the most senior down: senior, not junior
    ("Senior Manager, IT", "manager"),           # and manager, not senior
    ("Lead Developer", "lead"),
])
def test_level_is_read_from_the_title(title, level):
    assert classify_seniority(title) == level


def test_a_title_without_a_level_is_senior_when_the_ad_asks_for_many_years():
    assert job_level("Software Engineer", "You have 8+ years of software experience.") == "senior"
    assert job_level("Software Engineer", "Minimum 2 years of relevant experience.") == "unspecified"


# ── Objective 4: no made-up links in learning plans (strip_unlisted_links) ─────────────────────────────────────

def test_a_made_up_link_is_removed_but_its_words_stay():
    text, removed = strip_unlisted_links("Read [the SQL guide](https://made-up-site.example/sql) first.")
    assert text == "Read the SQL guide first." and removed == 1


def test_a_checked_link_is_kept():
    text, removed = strip_unlisted_links("Start with [AWS](https://aws.amazon.com/getting-started).")
    assert "https://aws.amazon.com/getting-started" in text and removed == 0


# ── Accounts: password rules (password_problem) ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("password, problem", [
    ("short1", "at least"),
    ("password123!", "harder to guess"),         # a common password with numbers added
    ("ling2609-garden", "username"),             # contains the username
    ("Orchid-Lantern-42", None),                 # a few random words: fine
])
def test_password_rules(password, problem):
    msg = password_problem(password, username="ling2609", email="ling@example.com")
    assert (msg is None) if problem is None else (problem in msg)


# ── Employers: after someone applies, a job can ask for less, not more (_asks_for_more) ───────────────────────

class _Query:
    def __init__(self, rows):
        self.rows = rows

    def filter(self, *conditions):
        return self

    def first(self):
        return self.rows[0] if self.rows else None

    def __iter__(self):
        return iter(self.rows)


class _StandInDatabase:
    """Answers the two questions the rule asks: has anyone applied, and which skills does the job require now."""
    def __init__(self, applied, required_now):
        self.applied, self.required = applied, [NS(skill_name=s) for s in required_now]

    def query(self, what):
        from app.models.job import JobSkill
        return _Query(self.required if what is JobSkill else ([1] if self.applied else []))


def _edit(required=(), qualification="", field="", languages=()):
    skills = [(name, NS(level="required")) for name in required]
    return NS(min_qualification=qualification, study_field=field, languages=list(languages)), skills


JOB = NS(id=1, min_qualification="bachelor", study_field="Computer Science", languages=["English"])


def test_before_anyone_applies_the_job_can_change_freely():
    from app.routers.employer import _asks_for_more
    data, skills = _edit(required=["Python", "SQL", "Docker"], qualification="master", languages=["English", "Mandarin"])
    assert _asks_for_more(JOB, data, skills, _StandInDatabase(applied=False, required_now=["Python", "SQL"])) == []


def test_after_applying_asking_for_less_is_allowed():
    from app.routers.employer import _asks_for_more
    data, skills = _edit(required=["Python"], qualification="diploma", field="Computer Science", languages=["English"])
    assert _asks_for_more(JOB, data, skills, _StandInDatabase(applied=True, required_now=["Python", "SQL"])) == []


def test_after_applying_asking_for_more_is_refused_and_says_what():
    from app.routers.employer import _asks_for_more
    data, skills = _edit(required=["Python", "SQL", "Docker"], qualification="master", field="Data Science",
                         languages=["English", "Mandarin"])
    more = _asks_for_more(JOB, data, skills, _StandInDatabase(applied=True, required_now=["Python", "SQL"]))
    assert more == ["Docker as a required skill", "a higher qualification", "a field of study", "Mandarin as a language"]
