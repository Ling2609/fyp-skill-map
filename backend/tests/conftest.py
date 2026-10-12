"""
SkillMap regression tests (12 Oct 2026; from an outside audit: "the biggest project-wide risk is no repeatable
regression suite"). They run the real API (FastAPI TestClient) on a THROWAWAY PostgreSQL database that is dropped
and created again at the start of every run, so your real data is never touched.

Run from backend/ with the venv active:   python -m pytest
By default it uses the server, user and password of DATABASE_URL in backend/.env with the database name
"skillmap_test" (made for the run; your own database is never touched). To use another throwaway database, set
TEST_DATABASE_URL first (Git Bash: export TEST_DATABASE_URL="postgresql://user:password@localhost:5432/skillmap_test").

Safety: the database name must contain "test", and it is never the DATABASE_URL in backend/.env.
What is NOT tested here: the quality of skill extraction and matching (that is the evaluation in
docs/evidence/). The sentence-embedding model is replaced by a small word-hashing stand-in and the relationship
model is off, so tests are fast, need no downloads or API keys, and give the same answer every time; skills with
the same name still match exactly (the A8 exact-match step), which is all these flows need.
"""
import os
import re
import subprocess
import sys
import types
import zlib
from pathlib import Path

import numpy as np
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

BACKEND = Path(__file__).resolve().parents[1]
TEST_URL = os.environ.get("TEST_DATABASE_URL", "")
if not TEST_URL:
    # 12 Oct (her first run): typing the password into a command is error-prone, so by default the tests use the
    # same server, user and password as DATABASE_URL in backend/.env, with the database name "skillmap_test"
    from dotenv import dotenv_values
    main_url = os.environ.get("DATABASE_URL") or dotenv_values(BACKEND / ".env").get("DATABASE_URL", "")
    if not main_url:
        pytest.exit("No DATABASE_URL in backend/.env and no TEST_DATABASE_URL set (see tests/conftest.py).", returncode=2)
    u = make_url(main_url)
    TEST_URL = u.set(database="skillmap_test", drivername="postgresql+psycopg2" if u.drivername == "postgresql" else u.drivername
                     ).render_as_string(hide_password=False)
_url = make_url(TEST_URL)
if "test" not in (_url.database or ""):
    pytest.exit(f'TEST_DATABASE_URL must name a database with "test" in it (got "{_url.database}").', returncode=2)

# Settings for the app under test: environment variables win over backend/.env (pydantic-settings)
os.environ.update(DATABASE_URL=TEST_URL, SECRET_KEY="test-secret", MONGODB_URL="mongodb://localhost:1",
                  RELATION_MODEL_DIR="", GROQ_API_KEY="", GEMINI_API_KEY="", COHERE_API_KEY="", JSEARCH_KEY="",
                  SMTP_USER="", SMTP_PASSWORD="")
sys.path.insert(0, str(BACKEND))


class _WordHashEmbedder:
    """Stand-in for SBERT: a fixed vector from the words, so the same text always gives the same vector."""
    def _v(self, t):
        v = np.zeros(64)
        for w in re.findall(r"[a-z0-9+#]+", (t or "").lower()):
            v[zlib.crc32(w.encode()) % 64] += 1
        return v + 1e-3

    def embed(self, t):
        return self._v(t)

    def embed_cached(self, texts):
        return np.stack([self._v(t) for t in texts]) if texts else np.zeros((0, 64))


_stub = types.ModuleType("app.nlp.embedder")
_stub.get_embedder = lambda: _WordHashEmbedder()
sys.modules["app.nlp.embedder"] = _stub


def _fresh_database():
    """Make the test database empty (a brand-new install every run). If it exists, its tables are wiped by
    recreating the "public" schema, which needs no special right; if it doesn't, it is created, which needs the
    CREATEDB right (12 Oct: her app's database user doesn't have it, so the message says how to make it once)."""
    from sqlalchemy.exc import OperationalError, ProgrammingError
    try:
        eng = create_engine(_url, isolation_level="AUTOCOMMIT")
        with eng.connect() as c:
            c.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
            c.execute(text("CREATE SCHEMA public"))
        eng.dispose()
        return
    except OperationalError as e:
        if f'"{_url.database}" does not exist' not in str(e):
            raise
    try:
        admin = create_engine(_url.set(database="postgres"), isolation_level="AUTOCOMMIT")
        with admin.connect() as c:
            c.execute(text(f'CREATE DATABASE "{_url.database}"'))
        admin.dispose()
    except ProgrammingError:
        pytest.exit(f'The database user "{_url.username}" may not create databases. Make the test database once, '
                    f'in pgAdmin (Query Tool on any database, signed in as postgres) or psql, then run the tests again:\n'
                    f'    CREATE DATABASE {_url.database} OWNER {_url.username};', returncode=2)


def run_migration(name: str) -> str:
    """Run one migrations/<name>.py against the test database, as an installer would; returns its output."""
    out = subprocess.run([sys.executable, f"migrations/{name}.py"], cwd=BACKEND, capture_output=True, text=True,
                         env={**os.environ}, timeout=300)
    assert out.returncode == 0, f"{name} failed:\n{out.stdout}\n{out.stderr}"
    return out.stdout


_fresh_database()
from fastapi.testclient import TestClient  # noqa: E402  (after the settings above)
from app.main import app  # noqa: E402  (creates the tables: the "empty database" install path)

PASSWORD = "Orchid-Lantern-42"


@pytest.fixture(scope="session")
def client():
    # The data a new install needs (README "Database migrations"): programmes, modules and intakes
    for name in ("migrate_admin_structure", "migrate_all_programmes", "migrate_intake_modules"):
        run_migration(name)
    with TestClient(app) as c:          # runs the start-up checks, as `uvicorn app.main:app` does
        yield c


@pytest.fixture(scope="session")
def db():
    from app.database import SessionLocal
    s = SessionLocal()
    yield s
    s.close()


def sql(db, query, **params):
    db.rollback()
    r = db.execute(text(query), params)
    db.commit()
    return r


class Users:
    """Makes accounts through the API (as the app's own pages do) and remembers their tokens."""
    def __init__(self, client, db):
        self.client, self.db, self.tokens, self.ids, self.n = client, db, {}, {}, 0

    def _login(self, email):
        r = self.client.post("/auth/login", json={"email": email, "password": PASSWORD})
        assert r.status_code == 200, r.text
        self.tokens[email] = {"Authorization": f"Bearer {r.json()['access_token']}"}
        return self.tokens[email]

    def h(self, email):
        return self.tokens.get(email) or self._login(email)

    def register(self, role="student", company=None):
        self.n += 1
        email = f"{role}{self.n}@example.com"
        body = {"username": f"{role}{self.n}", "first_name": role.title(), "last_name": f"No{self.n}", "email": email,
                "password": PASSWORD, "role": role}
        if company:
            body["company_name"] = company
        r = self.client.post("/auth/register", json=body)
        assert r.status_code in (200, 201), r.text
        self.ids[email] = sql(self.db, "select id from users where email=:e", e=email).scalar()
        return email

    def admin(self):
        from app.auth.utils import hash_password
        self.n += 1
        email = f"admin{self.n}@example.com"
        from app.models.user import User, UserRole   # as scripts/tools/create_admin.py does (no sign-up for admins)
        self.db.rollback()
        self.db.add(User(username=f"admin{self.n}", email=email, first_name="Career", last_name="Office",
                         hashed_password=hash_password(PASSWORD), role=UserRole.admin))
        self.db.commit()
        self.ids[email] = sql(self.db, "select id from users where email=:e", e=email).scalar()
        return email

    def employer(self, approved=True, company="Kayu Digital Sdn Bhd"):
        email = self.register("employer", company=company)
        if approved:
            r = self.client.post(f"/admin/users/{self.ids[email]}/approve", headers=self.h(self.admin()))
            assert r.status_code == 200, r.text
        return email

    def student(self, skills=("Python", "SQL"), visible=False):
        """A student with a project that shows these skills (no AI call: the skills are given, "Added by you")."""
        email = self.register("student")
        if skills:
            r = self.client.post("/profile/projects", headers=self.h(email), json={
                "name": "Shop API", "description": "An online shop backend with a database.",
                "skills": {s: "Added by you" for s in skills}})
            assert r.status_code == 201, r.text
        if visible:
            sql(self.db, "update users set is_visible_to_employers=true where id=:i", i=self.ids[email])
        return email


@pytest.fixture(scope="session")
def users(client, db):
    return Users(client, db)


@pytest.fixture
def post_job(client, users):
    """Publish a job for an employer with the given required skills (the employer's own check of the skills)."""
    def make(employer, title="Graduate Software Engineer", required=("Python", "SQL")):
        cats = client.get("/jobs/subcategories", params={"include_past": True}, headers=users.h(employer)).json()
        r = client.post("/employer/jobs", headers=users.h(employer), json={
            "title": title, "location": "Kuala Lumpur", "salary": "", "category": cats[0] if cats else "Developers/Programmers",
            "description": "Build REST APIs in Python and write SQL every day. " * 3,
            "skills": [{"name": s, "level": "required", "quote": "", "group": ""} for s in required], "soft": []})
        assert r.status_code == 200, r.text
        return r.json()
    return make
