"""E5 response times (18 Oct): the test student is saved and removed again, and the pass rule fixed beforehand
(warm p95 under 1 s, every cold call under 10 s; Gemini first views kept out) is applied as written."""
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "scripts", "evaluation"))
import evaluate_response_times as ert  # noqa: E402

from conftest import sql  # noqa: E402


def rows_for(warm_secs, cold_secs=0.5, first_view=None):
    rows = []
    for page, label, *_ in ert.CALLS:
        rows.append({"round": 1, "kind": "cold", "page": page, "call": label, "job": "", "seconds": cold_secs, "status": 200, "note": ""})
        rows += [{"round": 1, "kind": "warm", "page": page, "call": label, "job": "", "seconds": s, "status": 200, "note": ""}
                 for s in warm_secs]
    if first_view:
        rows.append({"round": 1, "kind": "cold", "page": "Job Detail", "call": "GET /jobs/{id}/description", "job": "x",
                     "seconds": first_view, "status": 200, "note": "first view (Gemini)"})
    return rows


def test_p95():
    assert ert.p95(list(range(1, 21))) == 19
    assert ert.p95([0.2]) == 0.2


def test_pass_rule():
    fast = [0.05] * 19 + [0.9]
    assert ert.summarise(rows_for(fast), [3.0])[2].startswith("PASS")
    slow = [0.05] * 18 + [1.2, 1.3]                     # p95 is 1.2 s
    assert ert.summarise(rows_for(slow), [3.0])[2].startswith("FAIL")
    assert ert.summarise(rows_for(fast, cold_secs=11), [3.0])[2].startswith("FAIL")
    # a 15 s Gemini first view is reported but not in the rule
    lines, metrics, verdict = ert.summarise(rows_for(fast, first_view=15.0), [3.0])
    assert verdict.startswith("PASS")
    assert metrics["calls"]["GET /jobs/{id}/description"]["first_view_gemini"] == [15.0]
    assert any("first view" in ln for ln in lines)


def test_test_student_saved_then_removed(db):
    if not sql(db, "select 1 from programmes where code = 'SE'").first():
        return                                          # no seed programmes in this database
    uid, token, n = ert.make_student(db)
    assert token and sql(db, "select username from users where id = :i", i=uid).scalar().startswith("_perf_")
    assert sql(db, "select count(*) from user_modules where user_id = :i", i=uid).scalar() == n
    ert.remove_test_students(db)
    assert sql(db, "select count(*) from users where id = :i", i=uid).scalar() == 0
    assert sql(db, "select count(*) from user_modules where user_id = :i", i=uid).scalar() == 0
