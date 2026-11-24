"""
Production start-up check (24 Nov 2026, deployment audit item 2).

On a real server PRODUCTION=1 is set. Then the backend refuses to start, listing every problem at once, when:
  - email isn't set up (SMTP_USER / SMTP_PASSWORD): verification and reset codes would never reach anyone;
  - SECRET_KEY is shorter than 32 bytes (RFC 7518 3.2 for HS256; locally this is only a warning);
  - the browser-test outbox (E2E_OUTBOX) is on;
  - the database URL has no password, or the local Docker default ("skillmap_local").
Without PRODUCTION the backend behaves as before (local development: emails are printed to the console).
"""
from sqlalchemy.engine import make_url

from app.config import settings

LOCAL_DEFAULT_PASSWORDS = {"skillmap_local", "password", "postgres", "admin", "changeme"}


def production_problems() -> list[str]:
    from app.services.mailer import mail_configured
    problems = []
    if not mail_configured():
        problems.append("SMTP_USER and SMTP_PASSWORD are not set, so verification and reset codes can't be emailed.")
    if len((settings.secret_key or "").encode()) < 32:
        problems.append("SECRET_KEY is shorter than 32 characters. Make one with: "
                        'python -c "import secrets; print(secrets.token_urlsafe(48))"')
    if settings.ip_limit_multiplier > 1:
        problems.append("IP_LIMIT_MULTIPLIER is above 1. It is for tests and local browser runs only.")
    if settings.e2e_outbox:
        problems.append("E2E_OUTBOX is on. It is for the browser tests only.")
    try:
        password = make_url(settings.database_url).password
    except Exception:   # noqa: BLE001 — an unreadable URL is reported, not crashed on
        password = None
    if not password or str(password) in LOCAL_DEFAULT_PASSWORDS:
        problems.append("The database password is missing or a local default. Set POSTGRES_PASSWORD / DATABASE_URL.")
    return problems


def check_production():
    if not settings.production:
        return
    problems = production_problems()
    if problems:
        raise RuntimeError("PRODUCTION=1, but the settings are not ready:\n  - " + "\n  - ".join(problems))
