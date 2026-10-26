"""
Load test (26 Oct 2026, system testing step 2): how many students can use SkillMap at the same time before pages get slow?

Plan, fixed on 26 Oct BEFORE any number was seen:
  - the real server, started by the script exactly as the README starts it: ONE uvicorn process (port 8078), no
    --reload. Outside services are switched off for the run (Gemini key blank: a description that was never tidied
    uses the plain rule-based layout, so no outside call is measured; the AI services are not part of SkillMap's own
    capacity). PostgreSQL and the job data are yours, as in E5
  - test students: 2 per programme profile of step 4 (up to 20), saved as _load_<random> with their modules and
    grades, removed at the end (and at the next start if a run stops). Each simulated student signs in with a token
    made by the script (sign-in itself, bcrypt, is not what is being measured)
  - what a simulated student does: scripts/evaluation/locustfile.py (the pages and calls of E5, random order, a
    pause between pages to read). Before every stage each test student asks for Job Matches once, so the stage is
    warm; the first call after a start is E5's cold test, not this one
  - stages (3 minutes each, users start over about 10 s, the first 10 s after that are not counted):
        5, 10, 20 students   pause 3-10 s between pages   rule: 0 failed calls AND every call's p95 under 1 s
        40 students          same pause                   rule: 0 failed calls AND every call's p95 under 10 s
        stress: 20 students  pause 0.2-0.5 s             no rule, reported (shows where the server gives in)
    1 s and 10 s are Nielsen's response-time limits (nngroup.com), as in E5. A call needs at least 10 answers in a
    stage to be judged
  - verdict: PASS if all four rule stages pass. "Comfortable capacity" = the most students in a rule stage that
    still keep every p95 under 1 s
  - limits (state in the report): one machine that also runs the load generator and the database (this makes the
    server look slower than it would on its own); one worker process; no network delay; pauses are assumed, not
    measured from real students; the AI assistant, GitHub and e-mail are not part of this test

Run from backend/ with the venv active (PostgreSQL running; MongoDB optional, it only saves the run record):
  pip install -r requirements-dev.txt
  python scripts/evaluation/evaluate_load.py
Writes ../docs/evidence/performance/load/: stage_*_stats.csv (Locust's own tables), summary.txt
"""
import csv
import json
import os
import platform
import random
import secrets
import statistics
import subprocess
import sys
import time

sys.path.append(".")
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

OUT = "../docs/evidence/performance/load"
PORT = 8078
BASE = f"http://127.0.0.1:{PORT}"
STAGE_SECONDS, RAMP_SECONDS, PER_PROFILE, MIN_CALLS = 180, 10, 2, 10
FAST_MS, SLOW_MS = 1000, 10000
STAGES = [   # name, students, (pause min, pause max), p95 limit in ms (None = reported only, no rule)
    dict(name="5 students", users=5, wait=(3, 10), limit_ms=FAST_MS),
    dict(name="10 students", users=10, wait=(3, 10), limit_ms=FAST_MS),
    dict(name="20 students", users=20, wait=(3, 10), limit_ms=FAST_MS),
    dict(name="40 students", users=40, wait=(3, 10), limit_ms=SLOW_MS),
    dict(name="stress: 20 students, no reading time", users=20, wait=(0.2, 0.5), limit_ms=None),
]
CALLS = ["GET /auth/me", "POST /recommend/", "GET /profile/skills", "GET /jobs/subcategories", "POST /skillgap/",
         "GET /jobs/{id}/description", "GET /recommend/goal", "GET /recommend/fit"]


def path(name):
    return os.path.join(OUT, name)


def remove_test_students(db):
    from app.models.user import User
    for u in db.query(User).filter(User.username.like("\\_load\\_%")).all():
        db.delete(u)                     # user_modules go with it (ON DELETE CASCADE)
    db.commit()


def make_students(db, per_profile=PER_PROFILE) -> list[dict]:
    """per_profile students for every programme profile of step 4; returns [{id, token, profile}]."""
    from evaluate_ranking import profiles
    from app.auth.utils import create_access_token
    from app.models.programme import Programme
    from app.models.user import User
    from app.models.user_module import UserModule
    out = []
    for prof in profiles(db):
        programme_id = db.query(Programme.id).filter(Programme.code == prof["id"]).scalar()
        for _ in range(per_profile):
            tag = secrets.token_hex(4)
            u = User(username=f"_load_{tag}", first_name="Load", last_name="Test", email=f"_load_{tag}@example.invalid",
                     hashed_password="-", is_active=True, programme_id=programme_id)
            db.add(u)
            db.flush()
            for m in prof["modules"]:
                db.add(UserModule(user_id=u.id, module_code=m["code"], grade=m["grade"]))
            db.commit()
            token = create_access_token({"sub": str(u.id), "role": "student", "pwd": 0})   # as at sign-in
            out.append({"id": u.id, "token": token, "profile": prof["id"]})
    return out


def start_server():
    env = {**os.environ, "GEMINI_API_KEY": ""}           # no outside call during the run (see the plan above)
    proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(PORT), "--log-level", "warning"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, env=env)
    import httpx
    t0 = time.perf_counter()
    while time.perf_counter() - t0 < 600:
        if proc.poll() is not None:
            sys.exit(f"The server stopped while starting:\n{proc.stderr.read()[-2000:]}")
        try:
            if httpx.get(BASE + "/openapi.json", timeout=2).status_code == 200:
                return proc, time.perf_counter() - t0
        except httpx.HTTPError:
            pass
        time.sleep(0.25)
    proc.kill()
    sys.exit("The server did not answer within 10 minutes.")


def stop_server(proc):
    proc.terminate()
    try:
        proc.wait(timeout=20)
    except subprocess.TimeoutExpired:
        proc.kill()


def warm_up(students):
    """Every test student asks for Job Matches once (the first one waits for the relationship model to load)."""
    import httpx
    for s in students:
        t0 = time.perf_counter()
        with httpx.Client(base_url=BASE, headers={"Authorization": f"Bearer {s['token']}"}, timeout=600) as c:
            while True:
                r = c.post("/recommend/", json={"top_n": 0, "role_filter": "", "category": ""})
                if r.status_code == 200 and r.json().get("recommendations"):
                    break
                if r.status_code != 200 or time.perf_counter() - t0 > 600:
                    sys.exit(f"Warm-up failed for a test student: {r.status_code} {r.text[:300]}")
                time.sleep(1)


def parse_stats(csv_path) -> dict:
    """Locust's *_stats.csv -> {call: {requests, failures, median_ms, p95_ms, max_ms, rps}} (+ 'Aggregated')."""
    out = {}
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            out[row["Name"]] = {"requests": int(row["Request Count"]), "failures": int(row["Failure Count"]),
                                "median_ms": float(row["Median Response Time"]), "p95_ms": float(row["95%"]),
                                "max_ms": float(row["Max Response Time"]), "rps": float(row["Requests/s"])}
    return out


def judge(stage, stats) -> tuple[bool | None, list[str]]:
    """The rule fixed beforehand. Returns (passed, problems); passed is None for the stress stage (no rule)."""
    if stage["limit_ms"] is None:
        return None, []
    problems = []
    agg = stats.get("Aggregated", {})
    if agg.get("failures", 0):
        problems.append(f"{agg['failures']} of {agg['requests']} calls failed")
    for name in CALLS:
        s = stats.get(name)
        if not s or s["requests"] < MIN_CALLS:
            problems.append(f"{name}: only {s['requests'] if s else 0} calls (need {MIN_CALLS})")
        elif s["p95_ms"] >= stage["limit_ms"]:
            problems.append(f"{name}: p95 {s['p95_ms'] / 1000:.2f} s (limit {stage['limit_ms'] / 1000:g} s)")
    return not problems, problems


def run_stage(stage, index, token_file, server_pid):
    prefix = path(f"stage_{index}")
    cmd = [sys.executable, "-m", "locust", "-f", os.path.join(os.path.dirname(os.path.abspath(__file__)), "locustfile.py"),
           "--headless", "-u", str(stage["users"]), "-r", str(max(1, stage["users"] // RAMP_SECONDS)),
           "-t", f"{STAGE_SECONDS + RAMP_SECONDS}s", "--reset-stats", "--host", BASE, "--csv", prefix,
           "--only-summary", "--loglevel", "WARNING"]
    env = {**os.environ, "LOAD_TOKENS": token_file, "LOAD_WAIT_MIN": str(stage["wait"][0]), "LOAD_WAIT_MAX": str(stage["wait"][1])}
    proc = subprocess.Popen(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    cpu = []
    try:
        import psutil
        server = psutil.Process(server_pid)
        server.cpu_percent(None)
        while proc.poll() is None:
            time.sleep(2)
            cpu.append(server.cpu_percent(None))
    except ImportError:
        pass
    out = proc.communicate()[0]
    if proc.returncode not in (0, 1):                # Locust exits 1 when some calls failed: that is a result, not a crash
        sys.exit(f"Locust stopped with code {proc.returncode}:\n{out[-2000:]}")
    stats = parse_stats(prefix + "_stats.csv")
    return stats, ({"mean": round(statistics.mean(cpu)), "max": round(max(cpu))} if cpu else None)


def summarise(results, startup) -> tuple[list[str], dict, str]:
    """results = [(stage, stats, cpu)]. The table, the metrics and the verdict."""
    names = [st["name"] for st, _, _ in results]
    lines = ["Load test: students using SkillMap at the same time (one uvicorn process, client on the same machine)",
             f"Each stage {STAGE_SECONDS} s counted after {RAMP_SECONDS} s of starting users; server start until it answered: {startup:.1f} s\n"]
    lines.append(f"{'Stage':<42}{'calls':>7}{'calls/s':>9}{'failed':>8}{'server CPU mean/max %':>24}   result")
    metrics, rule_ok, comfortable = {"startup_s": round(startup, 1), "stages": {}}, [], 0
    for stage, stats, cpu in results:
        ok, problems = judge(stage, stats)
        agg = stats.get("Aggregated", {})
        cpu_s = f"{cpu['mean']} / {cpu['max']}" if cpu else "n/a"
        res = "no rule (stress)" if ok is None else ("pass" if ok else "FAIL")
        lines.append(f"{stage['name']:<42}{agg.get('requests', 0):>7}{agg.get('rps', 0):>9.1f}{agg.get('failures', 0):>8}{cpu_s:>24}   {res}")
        metrics["stages"][stage["name"]] = {"users": stage["users"], "wait_s": stage["wait"], "ok": ok, "problems": problems, "cpu": cpu,
                                            "calls": {k: v for k, v in stats.items()}}
        if ok is not None:
            rule_ok.append(ok)
            if ok and stage["limit_ms"] == FAST_MS:
                comfortable = max(comfortable, stage["users"])
    lines.append("\np95 per call (seconds)")
    lines.append(f"{'Call':<30}" + "".join(f"{n.split(':')[0][:12]:>14}" for n in names))
    for c in CALLS:
        lines.append(f"{c:<30}" + "".join(f"{(s.get(c, {}).get('p95_ms', 0) / 1000):>14.3f}" for _, s, _ in results))
    for stage, stats, _ in results:
        ok, problems = judge(stage, stats)
        for p in problems:
            lines.append(f"  {stage['name']}: {p}")
    metrics["comfortable_students"] = comfortable
    verdict = ((f"PASS: every rule stage met its limit (1 s up to 20 students, 10 s at 40); every call's p95 stayed under 1 s up to "
                f"{comfortable} students") if rule_ok and all(rule_ok) else
               f"FAIL: at least one rule stage broke its limit; every call's p95 stayed under 1 s up to {comfortable} students")
    return lines, metrics, verdict


def machine() -> dict:
    info = {"os": platform.platform(), "cpu": platform.processor() or platform.machine(), "cores": os.cpu_count(),
            "python": platform.python_version()}
    try:
        import psutil
        info["ram_gb"] = round(psutil.virtual_memory().total / 2**30, 1)
    except ImportError:
        pass
    try:
        import locust
        info["locust"] = locust.__version__
    except ImportError:
        pass
    return info


def main():
    try:
        import locust  # noqa: F401
    except ImportError:
        sys.exit("Locust is not installed: pip install -r requirements-dev.txt")
    from app.database import SessionLocal
    os.makedirs(OUT, exist_ok=True)
    random.seed(0)
    db = SessionLocal()
    results, token_file = [], path("_tokens.json")
    try:
        remove_test_students(db)
        students = make_students(db)
        if not students:
            sys.exit("No test students could be made (no programmes found in the database).")
        with open(token_file, "w", encoding="utf-8") as f:
            json.dump([s["token"] for s in students], f)
        print(f"{len(students)} test students from {len({s['profile'] for s in students})} programme profiles.")
        proc, startup = start_server()
        print(f"Server ready after {startup:.1f} s. Warming up ...")
        try:
            for i, stage in enumerate(STAGES, 1):
                warm_up(students)
                print(f"Stage {i}/{len(STAGES)}: {stage['name']} ({STAGE_SECONDS + RAMP_SECONDS} s) ...")
                stats, cpu = run_stage(stage, i, token_file, proc.pid)
                results.append((stage, stats, cpu))
        finally:
            stop_server(proc)
    finally:
        remove_test_students(db)          # the test students never stay in the database
        db.close()
        if os.path.exists(token_file):
            os.remove(token_file)          # tokens are only for this run

    lines, metrics, verdict = summarise(results, startup)
    info = machine()
    lines.append(f"\n{verdict} (the rule fixed beforehand)")
    lines.append("Machine: " + ", ".join(f"{k} {v}" for k, v in info.items()))
    text = "\n".join(lines)
    print("\n" + text)
    with open(path("summary.txt"), "w", encoding="utf-8") as f:
        f.write(text + "\n")
    from app.services.evaluation_runs import record
    record("Load test", objective=2,
           method=f"one uvicorn process started by the script; Locust stages of {STAGE_SECONDS} s with 5, 10, 20 and 40 students "
                  "(pause 3-10 s) and a 20-student stress stage; test students from the step 4 programme profiles; "
                  "client on the same machine; Gemini off",
           dataset={"students": len(students), "stage_seconds": STAGE_SECONDS, "machine": info},
           metrics=metrics, verdict=verdict, files=[path(f"stage_{i}_stats.csv") for i in range(1, len(STAGES) + 1)])
    print(f"Written {path('summary.txt')} and the Locust tables in {OUT}.")


if __name__ == "__main__":
    main()
