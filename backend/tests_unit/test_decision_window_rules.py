from datetime import datetime, timedelta, timezone
from types import SimpleNamespace as NS
import unit_setup  # noqa: F401
import pytest
from sqlalchemy import Column, DateTime, Integer, MetaData, String, Table, create_engine
from sqlalchemy.orm import Session
from app.models.job import Job
from app.services.employer_availability import decision_window_open, decision_open_clause

NOW = datetime(2026, 11, 30, 12, 0, tzinfo=timezone.utc)


@pytest.mark.parametrize("source,deadline,expected", [
    ("employer", NOW + timedelta(microseconds=1), True),
    ("employer", NOW, False),
    ("employer", NOW - timedelta(microseconds=1), False),
    ("employer", None, True),
    ("live", NOW - timedelta(days=1), True),
    ("dataset", NOW - timedelta(days=1), True),
])
def test_python_and_discovery_sql_agree_at_deadline(source, deadline, expected):
    engine = create_engine("sqlite:///:memory:")
    meta = MetaData()
    table = Table("jobs", meta, Column("id", Integer, primary_key=True), Column("source", String), Column("decide_by", DateTime))
    meta.create_all(engine)
    with Session(engine) as db:
        db.execute(table.insert().values(id=1, source=source, decide_by=deadline.replace(tzinfo=None) if deadline else None))
        assert bool(db.query(Job.id).filter(decision_open_clause(NOW)).all()) is expected
        assert decision_window_open(NS(source=source, decide_by=deadline), NOW) is expected
    engine.dispose()


def test_naive_legacy_timestamp_is_interpreted_as_utc():
    job = NS(source="employer", decide_by=NOW.replace(tzinfo=None))
    assert decision_window_open(job, NOW) is False
    assert decision_window_open(job, NOW-timedelta(seconds=1)) is True


def test_timezone_offset_represents_same_instant():
    local = NOW.astimezone(timezone(timedelta(hours=8)))
    assert not decision_window_open(NS(source="employer", decide_by=local), NOW)
    assert decision_window_open(NS(source="employer", decide_by=local+timedelta(seconds=1)), NOW)
