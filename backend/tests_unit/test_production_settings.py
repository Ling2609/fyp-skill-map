"""
24 Nov (deployment audit, item 2): with PRODUCTION=1 the backend refuses unsafe settings at start-up, and an email
that can't be sent is never printed (with its code) to the log.
"""
import unit_setup  # noqa: F401  (settings and the model stand-in, before the app is imported)
import pytest

from app.config import settings
from app.services import mailer
from app.services.production import check_production, production_problems

GOOD_DB = "postgresql+psycopg2://skillmap:A-long-real-db-password-42@db:5432/skillmap"


@pytest.fixture
def prod(monkeypatch):
    """A production configuration that is ready; each test breaks one thing."""
    monkeypatch.setattr(settings, "production", True)
    monkeypatch.setattr(settings, "smtp_user", "skillmap@example.com")
    monkeypatch.setattr(settings, "smtp_password", "app-password")
    monkeypatch.setattr(settings, "secret_key", "x" * 48)
    monkeypatch.setattr(settings, "e2e_outbox", False)
    monkeypatch.setattr(settings, "database_url", GOOD_DB)
    monkeypatch.setattr(settings, "ip_limit_multiplier", 1)
    return monkeypatch


def test_ready_production_settings_start(prod):
    assert production_problems() == []
    check_production()


@pytest.mark.parametrize("name, value, words", [
    ("smtp_password", "", "SMTP"),
    ("secret_key", "short-key", "SECRET_KEY"),
    ("e2e_outbox", True, "E2E_OUTBOX"),
    ("ip_limit_multiplier", 100, "IP_LIMIT_MULTIPLIER"),
    ("database_url", "postgresql+psycopg2://skillmap:skillmap_local@db:5432/skillmap", "database password"),
    ("database_url", "postgresql+psycopg2://skillmap@db:5432/skillmap", "database password"),
])
def test_each_unsafe_setting_stops_the_start(prod, name, value, words):
    prod.setattr(settings, name, value)
    with pytest.raises(RuntimeError) as e:
        check_production()
    assert words in str(e.value)


def test_all_problems_are_listed_at_once(prod):
    prod.setattr(settings, "smtp_user", "")
    prod.setattr(settings, "secret_key", "short")
    assert len(production_problems()) == 2


def test_local_development_is_unchanged(monkeypatch):
    monkeypatch.setattr(settings, "production", False)
    monkeypatch.setattr(settings, "smtp_user", "")
    check_production()                      # no exception: local development may run without email


def test_production_never_prints_an_email_it_cannot_send(prod, capsys):
    prod.setattr(settings, "smtp_password", "")
    with pytest.raises(mailer.MailNotSent):
        mailer.send_email_now("ann@example.com", "Your code", "Here is your code:\n\n    123456\n")
    assert "123456" not in capsys.readouterr().out


def test_development_still_prints_to_the_console(monkeypatch, capsys):
    monkeypatch.setattr(settings, "production", False)
    monkeypatch.setattr(settings, "e2e_outbox", False)
    monkeypatch.setattr(settings, "smtp_user", "")
    mailer.send_email_now("ann@example.com", "Your code", "    123456")
    assert "123456" in capsys.readouterr().out
