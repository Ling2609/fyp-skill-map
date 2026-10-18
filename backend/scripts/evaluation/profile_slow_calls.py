"""
Where do the slow calls spend their time? (18 Oct, after E5 run 620b3ecd failed on POST /recommend/ and
GET /recommend/goal.) Diagnosis only, not an evaluation: it times nothing for the report.

The app runs inside this script (FastAPI test client, same start-up as uvicorn), with the same SE test student as
evaluate_response_times.py (saved as _perf_..., deleted at the end). Each slow call is made twice to warm up, then
5 times under Python's profiler (cProfile); the 30 functions with the most time are printed.

Run from backend/ with the venv active (stop your own backend first):
  python scripts/evaluation/profile_slow_calls.py
Writes profile_slow_calls.txt in backend/ (do not commit it).
"""
import cProfile
import io
import os
import pstats
import sys
import time

sys.path.append(".")
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

CALLS = [("POST", "/recommend/", {"top_n": 0, "role_filter": "", "category": ""}),
         ("GET", "/recommend/goal", None)]


def main():
    from fastapi.testclient import TestClient
    from app.database import SessionLocal
    from app.main import app
    from evaluate_response_times import make_student, remove_test_students
    db = SessionLocal()
    out = []
    try:
        remove_test_students(db)
        _, token, _ = make_student(db)
        with TestClient(app) as client:
            client.headers["Authorization"] = f"Bearer {token}"
            for method, url, body in CALLS:
                for _ in range(2):                                    # warm-up
                    assert client.request(method, url, json=body).status_code == 200
                prof = cProfile.Profile()
                t = time.perf_counter()
                prof.enable()
                for _ in range(5):
                    client.request(method, url, json=body)
                prof.disable()
                each = (time.perf_counter() - t) / 5
                s = io.StringIO()
                pstats.Stats(prof, stream=s).sort_stats("tottime").print_stats(30)
                out.append(f"===== {method} {url}: {each:.2f} s per call (5 calls, profiled) =====\n{s.getvalue()}")
    finally:
        remove_test_students(db)
        db.close()
    text = "\n".join(out)
    print(text)
    with open("profile_slow_calls.txt", "w", encoding="utf-8") as f:
        f.write(text)
    print("Written profile_slow_calls.txt: send it to Claude.")


if __name__ == "__main__":
    main()
