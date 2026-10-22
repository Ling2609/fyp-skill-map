"""
Prepare the database for the browser (end-to-end) tests (22 Oct; system testing step 2, frontend/e2e/).

Empties a SEPARATE database and fills it with known accounts and jobs, so the Playwright tests click through the
real app without touching your own data:
  - e2e.student@example.com    a student with a programme and intake, no grades yet (the test enters one)
  - e2e.applicant@example.com  a student with grades who has applied for "Graduate Software Engineer"
  - e2e.employer@example.com   an approved employer (Kayu Digital Sdn Bhd) with 3 open jobs
  - e2e.admin@example.com      the career office
All use the password in E2E_PASSWORD below (frontend/e2e/helpers.js has the same).

Run from backend/ with the venv on (the database must exist first, see docs/testing/e2e.md):
    set E2E_DATABASE_URL in backend/.env, e.g.  E2E_DATABASE_URL=postgresql://postgres:<password>@localhost:5432/skillmap_e2e
    python scripts/tools/setup_e2e.py
It refuses any database whose name doesn't contain "e2e", so it can never empty your real one.
"""
import os
import subprocess
import sys
from pathlib import Path

from dotenv import dotenv_values
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

BACKEND = Path(__file__).resolve().parents[2]
E2E_PASSWORD = "Orchid-Lantern-42"
URL = os.environ.get("E2E_DATABASE_URL") or dotenv_values(BACKEND / ".env").get("E2E_DATABASE_URL", "")


def fail(msg):
    print(f"\n{msg}\n")
    sys.exit(2)


if not URL:
    fail("Set E2E_DATABASE_URL in backend/.env first, e.g.\n"
         "    E2E_DATABASE_URL=postgresql://postgres:<password>@localhost:5432/skillmap_e2e")
db_name = make_url(URL).database or ""
if "e2e" not in db_name.lower():
    fail(f'Refusing: the database "{db_name}" has no "e2e" in its name. This script empties the database it is '
         "given, so it only works on one made for the browser tests.")

# The app reads these at import: the e2e database, no AI keys (nothing here needs AI), no MongoDB writes
os.environ.update(DATABASE_URL=URL, MONGODB_URL="mongodb://localhost:1", RELATION_MODEL_DIR="",
                  GROQ_API_KEY="", GEMINI_API_KEY="", COHERE_API_KEY="", JSEARCH_KEY="")
sys.path.insert(0, str(BACKEND))

print(f"Emptying {db_name} ...")
try:
    eng = create_engine(URL, isolation_level="AUTOCOMMIT")
    with eng.connect() as c:
        c.execute(text("DROP SCHEMA public CASCADE"))
        c.execute(text("CREATE SCHEMA public"))
    eng.dispose()
except Exception as e:  # noqa: BLE001
    fail(f"Couldn't reach {db_name}: {e}\nCreate it first (docs/testing/e2e.md, step 1).")

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402  (creates the tables)

for name in ("migrate_admin_structure", "migrate_all_programmes", "migrate_intake_modules"):
    print(f"  {name}")
    out = subprocess.run([sys.executable, f"migrations/{name}.py"], cwd=BACKEND, capture_output=True, text=True,
                         env={**os.environ})
    if out.returncode:
        fail(f"{name} failed:\n{out.stdout}\n{out.stderr}")

# A new install's modules have no skills until the career office reviews them; give the SE Year 1-2 modules the
# browser tests use theirs (as a reviewed list would), so grades turn into skills
MODULE_SKILLS = {"SE-L1-001": ["Networking", "TCP/IP", "Network Troubleshooting"],
                 "SE-L1-003": ["SQL", "Database Design", "Relational Databases"],
                 "SE-L1-005": ["Python", "Programming", "Debugging"],
                 "SE-L2-003": ["Python", "Data Analysis", "Pandas"]}
_eng = create_engine(URL)
with _eng.begin() as c:
    for code, skills in MODULE_SKILLS.items():
        mid = c.execute(text("select id from modules where code=:c"), {"c": code}).scalar()
        if mid is None:
            fail(f"Module {code} isn't in the new install (did migrate_all_programmes run?)")
        for name in skills:
            c.execute(text("insert into module_skills (module_id, module_code, skill_name, extracted_by) "
                           "values (:m, :c, :n, 'e2e setup')"), {"m": mid, "c": code, "n": name})
        c.execute(text("update modules set skills_reviewed_at = now() where id=:m"), {"m": mid})
_eng.dispose()

from app.auth.utils import hash_password  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402


def ok(r, *codes):
    if r.status_code not in (codes or (200, 201)):
        fail(f"{r.request.method} {r.request.url.path} -> {r.status_code}: {r.text}")
    return r.json()


with TestClient(app) as client:
    def register(key, role, first, last, company=None):
        body = {"username": f"e2e_{key}", "first_name": first, "last_name": last, "email": f"e2e.{key}@example.com",
                "password": E2E_PASSWORD, "role": role, "accept_privacy": True}
        if company:
            body["company_name"] = company
        ok(client.post("/auth/register", json=body))
        token = ok(client.post("/auth/login", json={"email": body["email"], "password": E2E_PASSWORD}))["access_token"]
        return {"Authorization": f"Bearer {token}"}

    db = SessionLocal()
    db.add(User(username="e2e_admin", email="e2e.admin@example.com", first_name="Career", last_name="Office",
                hashed_password=hash_password(E2E_PASSWORD), role=UserRole.admin))
    db.commit()
    admin = {"Authorization": "Bearer " + ok(client.post("/auth/login", json={
        "email": "e2e.admin@example.com", "password": E2E_PASSWORD}))["access_token"]}

    employer = register("employer", "employer", "Mei", "Tan", company="Kayu Digital Sdn Bhd")
    emp_id = db.execute(text("select id from users where email='e2e.employer@example.com'")).scalar()
    ok(client.post(f"/admin/users/{emp_id}/approve", headers=admin))

    def study(h):
        s = ok(client.get("/profile/study", headers=h))
        prog = next(p for p in s["programmes"] if "Software Engineering" in p["name"])
        ok(client.put("/profile/study", headers=h, json={"programme_id": prog["id"],
                                                          "intake_id": prog["intakes"][0]["id"] if prog.get("intakes") else None}))

    student = register("student", "student", "Aina", "Rahman")
    study(student)
    applicant = register("applicant", "student", "Daniel", "Lim")
    study(applicant)
    ok(client.post("/profile/modules", headers=applicant, json={"grades": [
        {"module_code": "SE-L1-001", "grade": 3.7}, {"module_code": "SE-L1-003", "grade": 4.0},
        {"module_code": "SE-L1-005", "grade": 4.0}, {"module_code": "SE-L2-003", "grade": 3.3}]}))
    db.execute(text("update users set is_visible_to_employers=true where email='e2e.applicant@example.com'"))
    db.commit()

    cats = client.get("/jobs/subcategories", params={"include_past": True}, headers=employer).json()
    category = "Developers/Programmers" if "Developers/Programmers" in cats else (cats[0] if cats else "Developers/Programmers")
    jobs = []
    for title, req in (("Graduate Software Engineer", ("Python", "SQL", "Git")),
                       ("Junior Data Analyst", ("Python", "SQL", "Data Analysis")),
                       ("Junior Network Engineer", ("Networking", "TCP/IP", "Linux"))):
        jobs.append(ok(client.post("/employer/jobs", headers=employer, json={
            "title": title, "location": "Kuala Lumpur", "salary": "RM 3,500 - 4,500", "category": category,
            "description": f"Join Kayu Digital as a {title}. You will work with " + ", ".join(req)
                           + " in a small team, write clear code and learn from senior engineers every day.",
            "skills": [{"name": s, "level": "required", "quote": "", "group": ""} for s in req], "soft": []})))
    ok(client.post("/applications", headers=applicant, json={"job_id": jobs[0]["job_ref"]}))
    db.close()

print(f"""
Ready: {db_name} has 4 accounts and 3 open jobs (password {E2E_PASSWORD}).
Next: start the backend on this database and run the browser tests (docs/testing/e2e.md, steps 3-4).
""")
