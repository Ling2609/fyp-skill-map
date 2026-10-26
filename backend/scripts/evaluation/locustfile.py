"""
Load test, the student side (26 Oct, system testing step 2). Run by scripts/evaluation/evaluate_load.py; you do not
start this file yourself.

One simulated student = one signed-in student (tokens made by the runner) who opens the pages the frontend opens, with
the calls each page waits for (the same list as E5 response times, so the two tests are comparable):
  Job Matches   POST /recommend/, GET /profile/skills, GET /jobs/subcategories
  Job Detail    POST /skillgap/ (one of the jobs just listed), GET /jobs/{id}/description
  Dashboard     GET /recommend/goal, GET /recommend/fit
  every page    GET /auth/me (the app asks who is signed in on each page)
Pages are visited at random (Job Detail most often), with a pause between them to read: LOAD_WAIT_MIN..LOAD_WAIT_MAX s.
"""
import itertools
import json
import os
import random
from urllib.parse import quote

from locust import HttpUser, between, task

TOKEN_FILE = os.environ.get("LOAD_TOKENS", "")
if not TOKEN_FILE:
    raise SystemExit("LOAD_TOKENS is not set: run scripts/evaluation/evaluate_load.py, it starts this file itself.")
with open(TOKEN_FILE, encoding="utf-8") as f:
    TOKENS = json.load(f)
WAIT = (float(os.environ.get("LOAD_WAIT_MIN", "3")), float(os.environ.get("LOAD_WAIT_MAX", "10")))
_next_student = itertools.count()


class Student(HttpUser):
    wait_time = between(*WAIT)

    def on_start(self):
        token = TOKENS[next(_next_student) % len(TOKENS)]
        self.client.headers["Authorization"] = f"Bearer {token}"
        self.jobs: list[str] = []

    def who_am_i(self):
        self.client.get("/auth/me", name="GET /auth/me")

    @task(4)
    def job_matches(self):
        self.who_am_i()
        with self.client.post("/recommend/", json={"top_n": 0, "role_filter": "", "category": ""},
                              name="POST /recommend/", catch_response=True) as r:
            if r.status_code == 200:
                self.jobs = [j["job_id"] for j in r.json().get("recommendations", [])[:10]]
                if not self.jobs:
                    r.failure("no job recommendations for this student")
        self.client.get("/profile/skills", name="GET /profile/skills")
        self.client.get("/jobs/subcategories", name="GET /jobs/subcategories")

    @task(5)
    def job_detail(self):
        if not self.jobs:                       # a student opens a job from the list, so list first
            self.job_matches()
            if not self.jobs:
                return
        job = random.choice(self.jobs)
        self.who_am_i()
        self.client.post("/skillgap/", json={"job_id": job}, name="POST /skillgap/")
        self.client.get(f"/jobs/{quote(job, safe='')}/description", name="GET /jobs/{id}/description")

    @task(3)
    def dashboard(self):
        self.who_am_i()
        self.client.get("/recommend/goal", name="GET /recommend/goal")
        self.client.get("/recommend/fit", name="GET /recommend/fit")
