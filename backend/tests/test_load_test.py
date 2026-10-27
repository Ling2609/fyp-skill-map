"""Load test (26 Oct): the pass rule fixed beforehand is applied as written (0 failed calls and every call's p95 under
1 s up to 20 students, 10 s at 40; the stress stage has no rule), Locust's table is read correctly, and the test
students are saved and removed again. The load itself is run by scripts/evaluation/evaluate_load.py, not here."""
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "scripts", "evaluation"))
import evaluate_load as el  # noqa: E402

HEADER = "Type,Name,Request Count,Failure Count,Median Response Time,Average Response Time,Min Response Time,Max Response Time,Average Content Size,Requests/s,Failures/s,50%,95%\n"


def stats_for(p95_ms=200, requests=50, failures=0, skip=()):
    out = {c: {"requests": requests, "failures": 0, "median_ms": 50.0, "p95_ms": float(p95_ms), "max_ms": 900.0, "rps": 1.0}
           for c in el.CALLS if c not in skip}
    out["Aggregated"] = {"requests": requests * len(out), "failures": failures, "median_ms": 50.0, "p95_ms": float(p95_ms),
                         "max_ms": 900.0, "rps": 5.0}
    return out


def test_parse_locust_table(tmp_path):
    f = tmp_path / "stage_stats.csv"
    f.write_text(HEADER + "POST,POST /recommend/,40,1,180,190,60,950,100,3.5,0.1,180,310\n"
                 ",Aggregated,40,1,180,190,60,950,100,3.5,0.1,180,310\n", encoding="utf-8")
    s = el.parse_stats(f)
    assert s["POST /recommend/"] == {"requests": 40, "failures": 1, "median_ms": 180.0, "p95_ms": 310.0, "max_ms": 950.0, "rps": 3.5}
    assert s["Aggregated"]["failures"] == 1


def test_rule_one_second_stages():
    stage = {"limit_ms": el.FAST_MS}
    assert el.judge(stage, stats_for(p95_ms=999)) == (True, [])
    ok, problems = el.judge(stage, stats_for(p95_ms=1000))                 # not under 1 s
    assert not ok and "p95 1.00 s" in problems[0]


def test_rule_ten_second_stage_is_looser():
    assert el.judge({"limit_ms": el.SLOW_MS}, stats_for(p95_ms=4000))[0] is True
    assert el.judge({"limit_ms": el.SLOW_MS}, stats_for(p95_ms=10000))[0] is False


def test_any_failed_call_fails_the_stage():
    ok, problems = el.judge({"limit_ms": el.FAST_MS}, stats_for(failures=1))
    assert not ok and "failed" in problems[0]


def test_a_call_with_too_few_answers_is_not_judged_as_fine():
    ok, problems = el.judge({"limit_ms": el.FAST_MS}, stats_for(requests=el.MIN_CALLS - 1))
    assert not ok and all("only" in p for p in problems)
    ok, problems = el.judge({"limit_ms": el.FAST_MS}, stats_for(skip=("GET /recommend/fit",)))
    assert not ok and "GET /recommend/fit: only 0 calls" in problems[0]


def test_stress_stage_has_no_rule():
    assert el.judge({"limit_ms": None}, stats_for(p95_ms=60000, failures=9))[0] is None


def test_verdict_and_comfortable_capacity():
    fast, slow = stats_for(p95_ms=300), stats_for(p95_ms=1500)
    s5, s10, s20, s40, stress = el.STAGES
    lines, metrics, verdict = el.summarise([(s5, fast, None), (s10, fast, None), (s20, slow, None), (s40, slow, None), (stress, slow, None)], 4.0)
    assert verdict.startswith("FAIL") and metrics["comfortable_students"] == 10     # 20 students broke the 1 s rule
    assert any("20 students" in ln and "POST /recommend/" in ln for ln in lines)
    lines, metrics, verdict = el.summarise([(s5, fast, None), (s10, fast, None), (s20, fast, None), (s40, slow, None), (stress, slow, None)], 4.0)
    assert verdict.startswith("PASS") and metrics["comfortable_students"] == 20     # 1.5 s is fine at 40 students (limit 10 s)
    # the stress stage can be as bad as it likes: it never decides the verdict
    assert el.summarise([(s5, fast, None), (s10, fast, None), (s20, fast, None), (s40, fast, None), (stress, stats_for(p95_ms=90000, failures=50), None)], 4.0)[2].startswith("PASS")


def test_test_students_saved_then_removed(db):
    from conftest import sql
    if not sql(db, "select 1 from programmes where code = 'SE'").first():
        return                                          # no seed programmes in this database
    students = el.make_students(db, per_profile=1)
    ids = [s["id"] for s in students]
    assert students and all(s["token"] for s in students)
    assert all(sql(db, "select username from users where id = :i", i=i).scalar().startswith("_load_") for i in ids)
    assert all(sql(db, "select count(*) from user_modules where user_id = :i", i=i).scalar() > 0 for i in ids)
    el.remove_test_students(db)
    for i in ids:
        assert sql(db, "select count(*) from users where id = :i", i=i).scalar() == 0
        assert sql(db, "select count(*) from user_modules where user_id = :i", i=i).scalar() == 0


def test_na_from_locust_does_not_stop_the_script_and_is_reported(tmp_path):
    f = tmp_path / "stage_stats.csv"
    f.write_text(HEADER + "GET,GET /recommend/fit,0,0,N/A,N/A,N/A,N/A,0,0,0,N/A,N/A\n"
                 "POST,POST /recommend/,20,20,N/A,N/A,N/A,N/A,0,1,1,N/A,N/A\n", encoding="utf-8")
    s = el.parse_stats(f)
    assert s["GET /recommend/fit"]["p95_ms"] is None and s["POST /recommend/"]["failures"] == 20
    stats = stats_for()
    stats["POST /recommend/"] = s["POST /recommend/"]
    ok, problems = el.judge({"limit_ms": el.FAST_MS}, stats)
    assert not ok and "20 calls, 20 failed, no answer times" in problems[0]
    lines, _, verdict = el.summarise([(el.STAGES[0], stats, None)], 1.0)          # the table still prints
    assert verdict.startswith("FAIL") and any("n/a" in ln for ln in lines)
