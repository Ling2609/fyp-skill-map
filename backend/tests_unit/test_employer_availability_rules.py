"""Exercise the production availability predicates against an isolated in-memory database."""
from types import SimpleNamespace
import unit_setup  # noqa: F401
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from app.models.job import Job
from app.services.employer_availability import employer_available, owner_available_clause


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as c:
        c.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, role TEXT, is_active BOOLEAN, employer_status TEXT)"))
        c.execute(text("CREATE TABLE jobs (id INTEGER PRIMARY KEY, source TEXT, posted_by_user_id INTEGER)"))
    with Session(engine) as session:
        yield session
    engine.dispose()


@pytest.mark.parametrize("source,owner_id,role,active,status,expected", [
    ("employer", 1, "employer", True, "approved", True),
    ("employer", 1, "employer", False, "approved", False),
    ("employer", 1, "employer", True, "pending", False),
    ("employer", 1, "employer", True, "rejected", False),
    ("employer", 1, "student", True, "approved", False),
    ("employer", None, "employer", True, "approved", False),
    ("employer", 999, "employer", True, "approved", False),
    ("live", None, "employer", False, "rejected", True),
    ("dataset", None, "employer", False, "rejected", True),
])
def test_read_and_sql_listing_filter_agree(db, source, owner_id, role, active, status, expected):
    db.execute(text("INSERT INTO users VALUES (1, :r, :a, :s)"), {"r": role, "a": active, "s": status})
    db.execute(text("INSERT INTO jobs VALUES (1, :s, :u)"), {"s": source, "u": owner_id})
    db.commit()
    job = SimpleNamespace(source=source, posted_by_user_id=owner_id)
    assert employer_available(job, db) is expected
    assert bool(db.query(Job.id).filter(owner_available_clause()).all()) is expected


def test_reactivation_is_seen_without_restarting_or_reusing_stale_owner_state(db):
    db.execute(text("INSERT INTO users VALUES (1, 'employer', 1, 'approved')"))
    job = SimpleNamespace(source="employer", posted_by_user_id=1)
    assert employer_available(job, db) is True
    db.execute(text("UPDATE users SET is_active=0 WHERE id=1"))
    assert employer_available(job, db) is False
    db.execute(text("UPDATE users SET is_active=1 WHERE id=1"))
    assert employer_available(job, db) is True
