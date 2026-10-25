"""
Demo data for SkillMap (25 Oct, her request: "seed different kinds of data so I don't need to add accounts, modules
and so on by hand"). Adds a small, realistic set of DEMO accounts to your own database, next to your data:

  8 students    programmes and intakes, grades for real modules, projects, certificates, experience, languages,
                career goals; 6 of them visible to employers, one brand new (no grades yet)
  3 employers   approved, with 5 jobs (required + nice-to-have skills, different "Decide by" dates)
  1 employer    waiting for the career office's approval
  applications  in every status (applied, shortlisted, accepted, not selected with a reason), one waiting 16 days,
                invitations (one open, one declined with a reason, one with no reply), and applications
                recorded on other sites (live jobs)

Everything goes through SkillMap's own API (the same checks as the app), with the skills given, so it makes NO AI
calls and costs no Groq tokens. Your modules and live jobs are used as they are; nothing of yours is changed.
Every demo account's email ends in @skillmap-demo.example.com, and --remove deletes them all (with their jobs,
applications and invitations).

Run from backend/ with the venv on (your usual DATABASE_URL in backend/.env; MongoDB may be on or off):
    python scripts/tools/seed_demo.py            add the demo data
    python scripts/tools/seed_demo.py --remove   delete every demo account and what belongs to it
Then restart your backend so the new jobs are in its job list. All demo accounts use the password DEMO_PASSWORD.
"""
import argparse
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)
# No AI is needed (every skill is given), so no key is used even if one is set
os.environ.update(GROQ_API_KEY="", GEMINI_API_KEY="", COHERE_API_KEY="", MISTRAL_API_KEY="")

DOMAIN = "skillmap-demo.example.com"    # example.com is reserved (RFC 2606): never a real mailbox
DEMO_PASSWORD = "Teal-Harbour-58"

# ── The demo people ───────────────────────────────────────────────────────────────────────────────────────────────
# programme: words looked for in your programme names (first match wins, else your first programme)
# grades: how many of the intake's reviewed modules get a grade, and the grades used in turn (A=4.0 ... C=2.0)
STUDENTS = [
    dict(key="izzah", first="Nurul Izzah", last="Ahmad", programme=("Software Engineering",), n_grades=12,
         grades=(4.0, 3.7, 4.0, 3.3), visible=True, goal=("Developers", "Software"), city="Kuala Lumpur",
         headline="Final-year Software Engineering student who enjoys backend work",
         projects=[("Campus Event Booking API", "A REST API built with Java and Spring Boot for booking campus rooms. "
                    "Data is stored in MySQL and the code is versioned with Git.",
                    {"Java": "built with Java", "Spring Boot": "Spring Boot", "MySQL": "stored in MySQL",
                     "Git": "versioned with Git"})],
         certs=[("AWS Certified Cloud Practitioner", "Amazon Web Services", ["AWS", "Cloud Computing"])],
         experience=dict(kind="work", category="internship", role="Software Engineering Intern",
                         organisation="Tropika Systems Sdn Bhd", start_month="2026-03", end_month="2026-08",
                         description="Wrote unit tests in Java and fixed SQL queries for the billing service.",
                         skills=["Java", "SQL", "Unit Testing"])),
    dict(key="jiahui", first="Tan", last="Jia Hui", programme=("Software Engineering",), n_grades=12,
         grades=(3.7, 3.3, 3.7, 3.0), visible=True, goal=("Data", "Database"), city="Petaling Jaya",
         headline="Data-minded student: SQL, Python and dashboards",
         projects=[("Hawker Sales Dashboard", "Cleaned two years of hawker stall sales with Python and pandas, "
                    "stored them in PostgreSQL and built a Power BI dashboard for the owners.",
                    {"Python": "with Python", "Pandas": "pandas", "PostgreSQL": "in PostgreSQL",
                     "Power BI": "a Power BI dashboard"})]),
    dict(key="arvind", first="Arvind", last="Raj", programme=("Computer Science", "Software Engineering"),
         n_grades=10, grades=(3.0, 2.7, 3.3, 3.0), visible=True, goal=("Developers", "Software"), city="Ipoh",
         headline="Computer Science student learning web development",
         projects=[("Recipe Finder Web App", "A web app in JavaScript and React that searches recipes by "
                    "ingredient, using a public REST API.",
                    {"JavaScript": "in JavaScript", "React": "React", "REST API": "a public REST API"})]),
    dict(key="weijie", first="Chong", last="Wei Jie", programme=("Software Engineering",), n_grades=11,
         grades=(3.3, 3.7, 3.0, 3.3), visible=True, goal=("Developers", "Software"), city="Johor Bahru",
         headline="Software Engineering student, Java and testing",
         projects=[("Library Fines Tracker", "A desktop app in Java that tracks library loans and fines, with "
                    "JUnit tests and a SQLite database.",
                    {"Java": "in Java", "JUnit": "JUnit tests", "SQLite": "a SQLite database"})]),
    dict(key="farah", first="Farah", last="Aqilah", programme=("Data", "Information Technology"), n_grades=10,
         grades=(4.0, 3.7, 3.7, 3.3), visible=True, goal=("Data", "Database"), city="Shah Alam",
         headline="IT student interested in data analysis",
         projects=[("Flood Alerts Analysis", "Analysed Malaysian flood records with Python and visualised the "
                    "results in Tableau to show the most affected districts.",
                    {"Python": "with Python", "Tableau": "in Tableau", "Data Analysis": "Analysed"})],
         certs=[("Google Data Analytics Certificate", "Google", ["Data Analysis", "SQL", "Spreadsheets"])]),
    dict(key="kaixin", first="Lim", last="Kai Xin", programme=("Software Engineering",), n_grades=12,
         grades=(3.7, 4.0, 3.3, 3.7), visible=True, goal=("Network", "Cloud", "System"), city="Penang",
         headline="Interested in cloud and Linux servers",
         projects=[("Home Lab Server", "Set up a Linux home server with Docker containers and Nginx, monitored "
                    "with Grafana.",
                    {"Linux": "a Linux home server", "Docker": "Docker containers", "Nginx": "Nginx",
                     "Grafana": "Grafana"})],
         experience=dict(kind="activity", category="club", role="Technical Lead",
                         organisation="APU Cloud Computing Club", start_month="2025-09", end_month=None,
                         description="Ran monthly Linux and Docker workshops for first-year students.",
                         skills=["Linux", "Docker", "Teaching"])),
    dict(key="hafiz", first="Muhammad", last="Hafiz", programme=("Cyber", "Security", "Information Technology"),
         n_grades=10, grades=(3.0, 3.3, 2.7, 3.0), visible=False, goal=("Security", "Network"), city="Kuantan",
         headline="", projects=[]),
    dict(key="priya", first="Priya", last="Devi", programme=("Software Engineering",), n_grades=0, grades=(),
         visible=False, goal=None, city="", headline="", projects=[]),
]

EMPLOYERS = [
    dict(key="lumen", first="Siti", last="Rahmah", company="Lumen Analytics Sdn Bhd", approved=True, jobs=[
        dict(title="Graduate Data Analyst", category=("Data", "Database", "Business"), decide_days=30,
             required=("SQL", "Python", "Power BI"), nice=("Tableau",),
             text="Turn sales and operations data into clear dashboards for our retail clients. You will write SQL, "
                  "clean data in Python and build Power BI reports; Tableau is a plus."),
        dict(title="Junior Data Engineer", category=("Data", "Database"), decide_days=45,
             required=("Python", "SQL", "ETL"), nice=("Docker",),
             text="Help build the pipelines behind our analytics: Python and SQL ETL jobs on PostgreSQL, run in Docker. "
                  "Fresh graduates welcome."),
    ]),
    dict(key="tropika", first="Jason", last="Ong", company="Tropika Systems Sdn Bhd", approved=True, jobs=[
        dict(title="Graduate Software Engineer", category=("Developers", "Software"), decide_days=21,
             required=("Java", "SQL", "Git"), nice=("Spring Boot", "Docker"),
             text="Join our payments team building Java services. You will write SQL, review code in Git and learn "
                  "Spring Boot and Docker from senior engineers."),
        dict(title="Junior QA Tester", category=("Testing", "Quality", "Developers"), decide_days=14,
             required=("Software Testing", "SQL"), nice=("Selenium",),
             text="Plan and run tests for our web apps, check data with SQL and help automate tests with Selenium."),
    ]),
    dict(key="kenari", first="Aiman", last="Hakim", company="Kenari Cloud Sdn Bhd", approved=True, jobs=[
        dict(title="Junior Cloud Support Engineer", category=("Network", "System", "Cloud", "Support"), decide_days=30,
             required=("Linux", "Networking", "AWS"), nice=("Docker",),
             text="Support our customers' AWS workloads: Linux servers, networking and monitoring. Docker is a plus."),
    ]),
    dict(key="bayu", first="Grace", last="Lee", company="Bayu Digital Sdn Bhd", approved=False, jobs=[]),
]

# Who applies where and what happens next: (student, employer, job title, status, extra)
APPLICATIONS = [
    ("izzah", "tropika", "Graduate Software Engineer", "accepted", {}),
    ("jiahui", "lumen", "Graduate Data Analyst", "shortlisted", {}),
    ("arvind", "tropika", "Graduate Software Engineer", "rejected", {"reason": "missing_skills"}),
    ("weijie", "tropika", "Junior QA Tester", "applied", {"days_ago": 16}),        # waiting long
    ("farah", "lumen", "Graduate Data Analyst", "applied", {}),                    # new, not opened
    ("jiahui", "lumen", "Junior Data Engineer", "applied", {"days_ago": 3}),
]
# (student, employer, job, what the student did): open / declined with a reason / no answer for 15 days ("No reply")
INVITES = [("kaixin", "kenari", "Junior Cloud Support Engineer", "open"),
           ("farah", "lumen", "Junior Data Engineer", "declined"),
           ("arvind", "lumen", "Graduate Data Analyst", "no_reply")]
OUTSIDE = ["hafiz", "izzah"]                    # "Yes, I applied" on a live job from another site


def email(key):
    return f"{key}@{DOMAIN}"


def first_match(options, words):
    for w in words:
        for o in options:
            if w.lower() in o.lower():
                return o
    return None


def remove():
    from app.database import SessionLocal
    from app.models.application import Application, ApplicationEvent, JobInvitation, OutsideApplication
    from app.models.job import Job, JobSkill
    from app.models.user import User
    from app.routers.auth import delete_student_data
    db = SessionLocal()
    users = db.query(User).filter(User.email.like(f"%@{DOMAIN}")).all()
    if not users:
        print("No demo accounts found: nothing to remove.")
        return
    job_ids = [j for (j,) in db.query(Job.id).filter(Job.posted_by_user_id.in_([u.id for u in users]))]
    if job_ids:
        app_ids = [a for (a,) in db.query(Application.id).filter(Application.job_id.in_(job_ids))]
        if app_ids:
            db.query(ApplicationEvent).filter(ApplicationEvent.application_id.in_(app_ids)).delete(synchronize_session=False)
        for model in (Application, JobInvitation, OutsideApplication):
            db.query(model).filter(model.job_id.in_(job_ids)).delete(synchronize_session=False)
        db.query(JobSkill).filter(JobSkill.job_id.in_(job_ids)).delete(synchronize_session=False)
        db.query(Job).filter(Job.id.in_(job_ids)).delete(synchronize_session=False)
    for u in users:
        try:                                   # MongoDB: the AI's suggestions and chats (none are made here; tidy anyway)
            from app.mongo import chat_sessions
            from app.services.extraction_records import delete_for_user
            chat_sessions().delete_many({"user_id": u.id})
            delete_for_user(u.id)
        except Exception:  # noqa: BLE001  (MongoDB off: nothing of the demo is there)
            pass
        delete_student_data(u, db)             # every row about the account, child rows first (also for employers)
    db.commit()
    db.close()
    print(f"Removed {len(users)} demo accounts and {len(job_ids)} demo jobs (with their applications and invitations).")


def add():
    from fastapi.testclient import TestClient
    from sqlalchemy import text
    from app.database import SessionLocal
    from app.main import app
    from app.models.job import Job
    from app.models.module import Module, ModuleSkill
    from app.models.user import User
    from app.routers.modules import module_codes_for

    db = SessionLocal()
    if db.query(User).filter(User.email.like(f"%@{DOMAIN}")).first():
        print("Demo accounts are already there. Run with --remove first to start again.")
        return

    with TestClient(app) as client:
        def ok(r, *codes):
            if r.status_code not in (codes or (200, 201, 204)):
                sys.exit(f"\n{r.request.method} {r.request.url.path} -> {r.status_code}: {r.text}\n")
            return r.json() if r.content else None

        def register(key, role, first, last, company=None):
            body = {"username": f"demo_{key}", "first_name": first, "last_name": last, "email": email(key),
                    "password": DEMO_PASSWORD, "role": role, "accept_privacy": True}
            if company:
                body["company_name"] = company
            ok(client.post("/auth/register", json=body))
            if role == "employer":
                return None
            return login(key)

        def login(key):
            t = ok(client.post("/auth/login", json={"email": email(key), "password": DEMO_PASSWORD}))["access_token"]
            return {"Authorization": f"Bearer {t}"}

        cats = ok(client.get("/jobs/subcategories", params={"include_past": True}))
        # ── Employers and their jobs ──
        jobs, emp_h = {}, {}
        for e in EMPLOYERS:
            register(e["key"], "employer", e["first"], e["last"], company=e["company"])
            if not e["approved"]:
                continue                             # stays "waiting for approval" for the career office
            db.execute(text("update users set employer_status='approved' where email=:e"), {"e": email(e["key"])})
            db.commit()
            emp_h[e["key"]] = h = login(e["key"])
            for j in e["jobs"]:
                skills = ([{"name": s, "level": "required", "quote": "", "group": ""} for s in j["required"]]
                          + [{"name": s, "level": "preferred", "quote": "", "group": ""} for s in j["nice"]])
                posted = ok(client.post("/employer/jobs", headers=h, json={
                    "title": j["title"], "location": "Kuala Lumpur", "salary": "RM 3,200 - 4,200",
                    "category": first_match(cats, j["category"]) or (cats[0] if cats else "Developers/Programmers"),
                    "description": j["text"], "skills": skills, "soft": [], "decide_days": j["decide_days"],
                    "min_qualification": "bachelor", "study_field": "Computer Science, IT or related",
                    "languages": ["English"]}), 200)
                jobs[(e["key"], j["title"])] = posted
        # ── Students ──
        stu_h, stu_id = {}, {}
        for s in STUDENTS:
            h = stu_h[s["key"]] = register(s["key"], "student", s["first"], s["last"])
            stu_id[s["key"]] = db.execute(text("select id from users where email=:e"), {"e": email(s["key"])}).scalar()
            study = ok(client.get("/profile/study", headers=h))
            names = [p["name"] for p in study["programmes"]]
            if not names:
                sys.exit("\nNo programmes in your database yet: add one in the career office's Academics page first.\n")
            prog = next(p for p in study["programmes"] if p["name"] == (first_match(names, s["programme"]) or names[0]))
            intake = prog["intakes"][0]["id"] if prog.get("intakes") else None
            ok(client.put("/profile/study", headers=h, json={"programme_id": prog["id"], "intake_id": intake}))
            if s["n_grades"]:
                codes = module_codes_for(db, prog["id"], intake) or set()
                with_skills = sorted({c for (c,) in db.query(Module.code).join(ModuleSkill, ModuleSkill.module_id == Module.id)
                                      .filter(Module.code.in_(codes))})
                picked = with_skills[:s["n_grades"]]
                if picked:
                    ok(client.post("/profile/modules", headers=h, json={"grades": [
                        {"module_code": c, "grade": s["grades"][i % len(s["grades"])]} for i, c in enumerate(picked)]}))
            for name, desc, skills in s.get("projects", []):
                ok(client.post("/profile/projects", headers=h, json={"name": name, "description": desc, "skills": skills}))
            for name, issuer, skills in s.get("certs", []):
                ok(client.post("/profile/certifications", headers=h,
                               json={"cert_name": name, "issuer": issuer, "skills": skills, "suggested": False}))
            if s.get("experience"):
                x = s["experience"]
                ok(client.post("/profile/experiences", headers=h, json={**x, "added": x["skills"]}))
            if s["headline"] or s["visible"]:
                ok(client.put("/profile/about", headers=h, json={
                    "headline": s["headline"], "visible_to_employers": s["visible"], "show_grades_to_employers": s["visible"],
                    "city": s["city"], "available_from": "2027-01",
                    "languages": [{"language": "English", "level": "full_professional"},
                                  {"language": "Malay", "level": "native"}]}))
            if s["goal"]:
                goal = first_match(cats, s["goal"])
                if goal:
                    ok(client.put("/profile/goal", headers=h, json={"category": goal}))
        # ── Applications, statuses, invitations ──
        for who, emp, title, status, extra in APPLICATIONS:
            job = jobs[(emp, title)]
            ok(client.post("/applications", headers=stu_h[who], json={"job_id": job["job_ref"]}))
            app_id = db.execute(text("select id from applications where job_id=:j and student_id=:s"),
                                {"j": job["id"], "s": stu_id[who]}).scalar()
            if status != "applied":
                ok(client.patch(f"/employer/applications/{app_id}", headers=emp_h[emp],
                                json={"status": status, **({"reason": extra["reason"]} if "reason" in extra else {})}))
            if extra.get("days_ago"):
                when = datetime.now(timezone.utc) - timedelta(days=extra["days_ago"])
                db.execute(text("update applications set created_at=:w, sent_at=:w where id=:a"), {"w": when, "a": app_id})
                db.execute(text("update application_events set created_at=:w where application_id=:a"), {"w": when, "a": app_id})
                db.commit()
        for who, emp, title, outcome in INVITES:
            inv = ok(client.post("/employer/invitations", headers=emp_h[emp],
                                 json={"job_id": jobs[(emp, title)]["id"], "student_id": stu_id[who]}))
            if outcome == "declined":
                ok(client.patch(f"/applications/invitations/{inv['id']}", headers=stu_h[who],
                                json={"dismissed": True, "reason": "have_offer"}))
            elif outcome == "no_reply":
                db.execute(text("update job_invitations set created_at = now() - interval '15 days' where id=:i"),
                           {"i": inv["id"]})
                db.commit()
        live = [j for (j,) in db.query(Job.job_id).filter(Job.source == "live").order_by(Job.id.desc()).limit(len(OUTSIDE))]
        for who, ref in zip(OUTSIDE, live):
            ok(client.post("/applications/outside", headers=stu_h[who], json={"job_id": ref}))
    db.close()

    print(f"""
Demo data added: {len(STUDENTS)} students, {sum(1 for e in EMPLOYERS if e['approved'])} employers with {len(jobs)} jobs,
1 employer waiting for approval, {len(APPLICATIONS)} applications, {len(INVITES)} invitations (open, declined, no reply), {len(live)} other-site record{'' if len(live) == 1 else 's'}.

Sign in with any of these (password {DEMO_PASSWORD}):
  students   {', '.join(email(s['key']) for s in STUDENTS[:3])} ...
             (izzah: accepted; jiahui: shortlisted; arvind: not selected; weijie: waiting 16 days;
              kaixin: invited; farah: declined one; arvind: didn't answer one;
              priya: brand new, no grades)
  employers  {email('tropika')} (Tropika Systems), {email('lumen')} (Lumen Analytics), {email('kenari')}
  waiting    {email('bayu')} (approve it as the career office)
Restart your backend so the new jobs show in Job Matches. Remove it all with:  python scripts/tools/seed_demo.py --remove
""")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Add or remove SkillMap demo data (accounts ending @skillmap-demo.example.com)")
    ap.add_argument("--remove", action="store_true", help="delete every demo account and what belongs to it")
    remove() if ap.parse_args().remove else add()
