"""
E5 response times (18 Oct, evaluation step 5): how long does a student wait for the server on Job Matches, Job Detail
and the Dashboard, the first time after a start (cold) and afterwards (warm)?

Plan, fixed on 18 Oct BEFORE any number was seen (references.md "Response times"):
  - the calls each page waits for (found in the frontend):
      Job Matches  POST /recommend/ (all jobs), GET /profile/skills, GET /jobs/subcategories
      Job Detail   POST /skillgap/ (one job), GET /jobs/{id}/description
      Dashboard    GET /recommend/goal, GET /recommend/fit
  - a real server: the script starts uvicorn itself (port 8077), so "cold" really is the first call after a start.
    Startup time (until the API answers) is reported too; the relationship model then loads in the background
    (app/main.py), so the first /recommend/ may wait for it, as a real first student would
  - one test student, the BSc (Hons) Software Engineering profile of step 4 (same modules and grades, seed 1). The
    server is a separate process, so this student must be saved for the run: username _perf_<random>, removed at
    the end (and any leftover _perf_ student is removed at the next start)
  - ROUNDS = 3 starts. Each round: every call once (cold), then each call WARM = 20 more times. Job Detail is timed on
    the student's top 5 jobs in turn (a student opens several jobs). Warm results of the 3 rounds are pooled
  - a job description that has never been tidied calls Gemini (an outside service) once and is then stored; those
    calls are reported apart ("first view") and kept out of the pass rule
  - pass rule: every call's warm p95 under 1 s and every cold call under 10 s (Nielsen's 1 s and 10 s response-time
    limits, nngroup.com). Times are the server's answer as seen by a client on the same machine: browser drawing
    time is not included (report limitation)

Run from backend/ with the venv active (PostgreSQL running; MongoDB optional, it only saves the run record):
  python scripts/evaluation/evaluate_response_times.py
Writes ../docs/evidence/performance/: response_times.csv (every call), summary.txt
"""
import csv
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

OUT = "../docs/evidence/performance"
PORT, ROUNDS, WARM, JOBS = 8077, 3, 20, 5
WARM_LIMIT, COLD_LIMIT = 1.0, 10.0
BASE = f"http://127.0.0.1:{PORT}"
CALLS = [   # (page, label, method, path, body); {job} = one of the student's top jobs
    ("Job Matches", "POST /recommend/", "POST", "/recommend/", {"top_n": 0, "role_filter": "", "category": ""}),
    ("Job Matches", "GET /profile/skills", "GET", "/profile/skills", None),
    ("Job Matches", "GET /jobs/subcategories", "GET", "/jobs/subcategories", None),
    ("Job Detail", "POST /skillgap/", "POST", "/skillgap/", {"job_id": "{job}"}),
    ("Job Detail", "GET /jobs/{id}/description", "GET", "/jobs/{job}/description", None),
    ("Dashboard", "GET /recommend/goal", "GET", "/recommend/goal", None),
    ("Dashboard", "GET /recommend/fit", "GET", "/recommend/fit", None),
]


def path(name):
    return os.path.join(OUT, name)


def remove_test_students(db):
    from app.models.user import User
    for u in db.query(User).filter(User.username.like("\\_perf\\_%")).all():
        db.delete(u)                     # user_modules go with it (ON DELETE CASCADE)
    db.commit()


def make_student(db) -> tuple[int, str, int]:
    """The SE profile of step 4, saved as a test student; returns (id, token, modules)."""
    from evaluate_ranking import profiles
    from app.auth.utils import create_access_token
    from app.models.user import User
    from app.models.user_module import UserModule
    from app.models.programme import Programme
    se = next((p for p in profiles(db) if p["id"] == "SE"), None)
    if not se:
        sys.exit("Programme SE not found in the database.")
    tag = secrets.token_hex(4)
    u = User(username=f"_perf_{tag}", first_name="Perf", last_name="Test", email=f"_perf_{tag}@example.invalid",
             hashed_password="-", is_active=True,
             programme_id=db.query(Programme.id).filter(Programme.code == "SE").scalar())
    db.add(u)
    db.flush()
    for m in se["modules"]:
        db.add(UserModule(user_id=u.id, module_code=m["code"], grade=m["grade"]))
    db.commit()
    token = create_access_token({"sub": str(u.id), "role": "student", "pwd": 0})   # as at sign-in (auth._login_token)
    return u.id, token, len(se["modules"])


def start_server():
    proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(PORT), "--log-level", "warning"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
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


def call(client, method, url, body):
    t = time.perf_counter()
    r = client.request(method, url, json=body)
    secs = time.perf_counter() - t
    return r, secs


def fill(text, job):
    return text.replace("{job}", job) if isinstance(text, str) else text


def one_round(rnd, token, rows):
    import httpx
    from urllib.parse import quote
    proc, startup = start_server()
    print(f"Round {rnd}: server ready after {startup:.1f} s")
    try:
        with httpx.Client(base_url=BASE, headers={"Authorization": f"Bearer {token}"}, timeout=600) as client:
            jobs = []
            for page, label, method, p, body in CALLS:
                job = jobs[0] if jobs else ""
                r, secs = call(client, method, fill(p, quote(job, safe="")), {k: fill(v, job) for k, v in body.items()} if body else None)
                if r.status_code != 200:
                    sys.exit(f"{label} answered {r.status_code}: {r.text[:300]}")
                extra = ""
                if label == "POST /recommend/":
                    jobs = [j["job_id"] for j in r.json()["recommendations"][:JOBS]]
                    if not jobs:
                        sys.exit("The test student got no job recommendations.")
                if label.startswith("GET /jobs/{id}") and not r.json().get("cached"):
                    extra = "first view (Gemini)"
                rows.append({"round": rnd, "kind": "cold", "page": page, "call": label, "job": job if "{job}" in p or (body and "{job}" in str(body)) else "",
                             "seconds": round(secs, 4), "status": r.status_code, "note": extra})
            for page, label, method, p, body in CALLS:
                for k in range(WARM):
                    job = jobs[k % len(jobs)]
                    r, secs = call(client, method, fill(p, quote(job, safe="")), {kk: fill(v, job) for kk, v in body.items()} if body else None)
                    if r.status_code != 200:
                        sys.exit(f"{label} answered {r.status_code}: {r.text[:300]}")
                    note = "first view (Gemini)" if label.startswith("GET /jobs/{id}") and not r.json().get("cached") else ""
                    rows.append({"round": rnd, "kind": "warm", "page": page, "call": label,
                                 "job": job if "{job}" in p or (body and "{job}" in str(body)) else "",
                                 "seconds": round(secs, 4), "status": r.status_code, "note": note})
    finally:
        stop_server(proc)
    return startup


def p95(xs):
    xs = sorted(xs)
    return xs[max(0, int(round(0.95 * len(xs))) - 1)]


def summarise(rows, startups):
    """The table, the metrics and the verdict (the rule fixed beforehand)."""
    lines, metrics, ok = [], {"startup_s": [round(s, 1) for s in startups], "calls": {}}, True
    lines.append("E5 response times: server answer times seen by a client on the same machine (seconds)")
    lines.append(f"{ROUNDS} server starts; cold = first call after each start; warm = {WARM} calls per round, pooled\n")
    lines.append(f"Server start until the API answers: {', '.join(f'{s:.1f}' for s in startups)} s\n")
    lines.append(f"{'Page / call':<44}{'cold (each start)':<22}{'warm median':>12}{'warm p95':>10}{'warm max':>10}")
    for page, label, *_ in CALLS:
        cold = [r["seconds"] for r in rows if r["call"] == label and r["kind"] == "cold" and not r["note"]]
        warm = [r["seconds"] for r in rows if r["call"] == label and r["kind"] == "warm" and not r["note"]]
        first = [r["seconds"] for r in rows if r["call"] == label and r["note"]]
        m = {"cold": cold, "warm_median": round(statistics.median(warm), 3) if warm else None,
             "warm_p95": round(p95(warm), 3) if warm else None, "warm_max": round(max(warm), 3) if warm else None,
             "first_view_gemini": first}
        metrics["calls"][label] = m
        call_ok = (not warm or m["warm_p95"] < WARM_LIMIT) and all(c < COLD_LIMIT for c in cold)
        ok &= call_ok
        cold_s = ", ".join(f"{c:.2f}" for c in cold) or "-"
        lines.append(f"{page + ' · ' + label:<44}{cold_s:<22}{m['warm_median'] or 0:>12.3f}{m['warm_p95'] or 0:>10.3f}"
                     f"{m['warm_max'] or 0:>10.3f}{'' if call_ok else '   <- over the limit'}")
        if first:
            lines.append(f"{'':<44}first view of an untidied description (calls Gemini): {', '.join(f'{x:.2f}' for x in first)} s (not in the rule)")
    verdict = (f"PASS: every warm p95 under {WARM_LIMIT:g} s and every cold call under {COLD_LIMIT:g} s" if ok else
               f"FAIL: at least one call over the limit (warm p95 {WARM_LIMIT:g} s, cold {COLD_LIMIT:g} s)")
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
        import torch
        info["gpu"] = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "none (CPU)"
    except ImportError:
        pass
    return info


def main():
    from app.database import SessionLocal
    os.makedirs(OUT, exist_ok=True)
    random.seed(0)
    db = SessionLocal()
    rows, startups = [], []
    try:
        remove_test_students(db)
        uid, token, n_mod = make_student(db)
        print(f"Test student {uid} (Software Engineering profile, {n_mod} modules). {ROUNDS} rounds, {WARM} warm calls each.")
        for rnd in range(1, ROUNDS + 1):
            startups.append(one_round(rnd, token, rows))
    finally:
        remove_test_students(db)          # the test student never stays in the database
        db.close()

    with open(path("response_times.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    lines, metrics, verdict = summarise(rows, startups)
    info = machine()
    lines.append(f"\n{verdict} (the rule fixed beforehand)")
    lines.append("Machine: " + ", ".join(f"{k} {v}" for k, v in info.items()))
    text = "\n".join(lines)
    print("\n" + text)
    with open(path("summary.txt"), "w", encoding="utf-8") as f:
        f.write(text + "\n")
    from app.services.evaluation_runs import record
    record("E5 response times", objective=2,
           method=f"uvicorn started by the script {ROUNDS} times; each call once cold, then {WARM} warm calls per start; "
                  "SE test student; client on the same machine; Gemini first views reported apart",
           dataset={"rounds": ROUNDS, "warm_per_round": WARM, "jobs_opened": JOBS, "machine": info},
           metrics=metrics, verdict=verdict, files=[path("response_times.csv")])
    print(f"Written {path('response_times.csv')} and {path('summary.txt')}.")


if __name__ == "__main__":
    main()
