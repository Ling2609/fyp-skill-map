"""
Does limiting numpy's maths library to one core change any answer? (18 Oct, E5 fix 2.) A different number of
threads can, in principle, change the last digit of a sum, so this checks it on the real data instead of assuming.

The app runs inside this script (same start-up as uvicorn, so the limit of one thread is on), with the SE test
student of evaluate_response_times.py (saved as _perf_..., deleted at the end). Each call is made with one thread,
then again with every core, and the two JSON answers are compared exactly:
  POST /recommend/ (all jobs), GET /recommend/goal, GET /recommend/fit, POST /skillgap/ for the top 10 jobs
It also prints which maths libraries numpy and PyTorch loaded and how many threads each uses.

Run from backend/ with the venv active (stop your own backend first):
  python scripts/evaluation/check_blas_threads.py
"""
import json
import os
import sys

sys.path.append(".")
sys.path.append(os.path.dirname(os.path.abspath(__file__)))


def answers(client, jobs):
    out = {"recommend": client.post("/recommend/", json={"top_n": 0, "role_filter": "", "category": ""}).json(),
           "goal": client.get("/recommend/goal").json(), "fit": client.get("/recommend/fit").json()}
    for j in jobs:
        out[f"skillgap {j}"] = client.post("/skillgap/", json={"job_id": j}).json()
    return out


def first_difference(a, b, where=""):
    if type(a) is not type(b):
        return f"{where}: {a!r} vs {b!r}"
    if isinstance(a, dict):
        for k in sorted(set(a) | set(b), key=str):
            if k not in a or k not in b:
                return f"{where}.{k}: only in one answer"
            d = first_difference(a[k], b[k], f"{where}.{k}")
            if d:
                return d
    elif isinstance(a, list):
        if len(a) != len(b):
            return f"{where}: {len(a)} vs {len(b)} items"
        for i, (x, y) in enumerate(zip(a, b)):
            d = first_difference(x, y, f"{where}[{i}]")
            if d:
                return d
    elif a != b:
        return f"{where}: {a!r} vs {b!r}"
    return None


def main():
    from fastapi.testclient import TestClient
    from threadpoolctl import threadpool_info, threadpool_limits
    from app.database import SessionLocal
    from app.main import app
    from evaluate_response_times import make_student, remove_test_students
    db = SessionLocal()
    try:
        remove_test_students(db)
        _, token, _ = make_student(db)
        with TestClient(app) as client:
            client.headers["Authorization"] = f"Bearer {token}"
            r = client.post("/recommend/", json={"top_n": 0, "role_filter": "", "category": ""})
            assert r.status_code == 200, r.text
            jobs = [x["job_id"] for x in r.json()["recommendations"][:10]]
            print("Maths libraries loaded (one thread for BLAS):")
            for lib in threadpool_info():
                print(f"  {lib['user_api']:7} {lib['internal_api']:9} threads {lib['num_threads']:>3}  {os.path.basename(lib['filepath'])}")
            one = answers(client, jobs)
            with threadpool_limits(limits=os.cpu_count(), user_api="blas"):
                every = answers(client, jobs)
    finally:
        remove_test_students(db)
        db.close()
    diffs = {k: first_difference(one[k], every[k], k) for k in one}
    bad = {k: d for k, d in diffs.items() if d}
    print(f"\nCompared {len(one)} answers ({len(one['recommend']['recommendations'])} job matches, "
          f"{len(jobs)} skill gaps), one thread vs {os.cpu_count()} threads:")
    if bad:
        for k, d in bad.items():
            print(f"  DIFFERENT {d}")
    else:
        print("  IDENTICAL: every job, score, matched skill and gap is the same")
    with open("check_blas_threads.txt", "w", encoding="utf-8") as f:
        json.dump({"identical": not bad, "differences": bad, "answers_compared": len(one)}, f, indent=1)
    print("Written check_blas_threads.txt: send the lines above to Claude.")


if __name__ == "__main__":
    main()
