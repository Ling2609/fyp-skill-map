"""26 Nov 2026 (Google Cloud): Gmail refuses SMTP logins from the server, so a sending service (Brevo) may be used. Its
login is not an email address, so the From address comes from SMTP_FROM when set, else SMTP_USER as before."""
from app.config import settings
from app.services import mailer


def test_from_is_the_smtp_user_by_default(monkeypatch):
    monkeypatch.setattr(settings, "smtp_user", "skillmap.office@gmail.com")
    monkeypatch.setattr(settings, "smtp_from", "")
    assert mailer._message("a@example.com", "Hi", "body", None)["From"] == "SkillMap <skillmap.office@gmail.com>"


def test_smtp_from_wins_when_set(monkeypatch):
    monkeypatch.setattr(settings, "smtp_user", "9a1b2c001@smtp-brevo.com")
    monkeypatch.setattr(settings, "smtp_from", "skillmap.office@gmail.com")
    assert mailer._message("a@example.com", "Hi", "body", None)["From"] == "SkillMap <skillmap.office@gmail.com>"
