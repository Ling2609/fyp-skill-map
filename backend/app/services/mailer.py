"""
Sends account emails (4 Oct: "Forgot password" codes and the confirmation after a reset; 23 Nov: also the
registration code, and every email now has an HTML version beside the plain text).

Gmail SMTP with an app password, set in backend/.env as SMTP_USER and SMTP_PASSWORD. Without them nothing is sent
and the message is printed in the backend console instead, so the flow can still be tried locally; never leave it
like that for real users.

Two ways to send:
- send_email: in the background (FastAPI BackgroundTasks) for notices; a failure is only logged.
- send_email_now: in the request, for registration codes (23 Nov). It raises MailNotSent, so the caller knows the
  mail server did not accept the email and keeps the previous code.

Browser tests (E2E_OUTBOX=1, on the skillmap_e2e database only): emails are written to backend/.e2e_outbox/ instead,
so a test can read the code. check_outbox() stops the backend if E2E_OUTBOX is set on any other database.
"""
import re
import smtplib
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path

from sqlalchemy.engine import make_url

from app.config import settings

OUTBOX = Path(__file__).resolve().parents[2] / ".e2e_outbox"
E2E_DATABASE = "skillmap_e2e"


class MailNotSent(Exception):
    """The mail server did not accept the email."""


def mail_configured() -> bool:
    return bool(settings.smtp_user and settings.smtp_password)


def check_outbox():
    """Start-up check: the outbox is for the browser-test database only, never for real users' email."""
    if settings.e2e_outbox and make_url(settings.database_url).database != E2E_DATABASE:
        raise RuntimeError(f"E2E_OUTBOX is set, but the database is not {E2E_DATABASE}. The outbox is for the browser "
                           "tests only: remove E2E_OUTBOX from the environment / backend/.env.")


def _to_outbox(to: str, subject: str, body: str) -> None:
    OUTBOX.mkdir(exist_ok=True)
    safe = re.sub(r"[^a-z0-9@._-]+", "_", to.lower())
    (OUTBOX / f"{datetime.now():%Y%m%d_%H%M%S_%f}_{safe}.txt").write_text(f"To: {to}\nSubject: {subject}\n\n{body}",
                                                                           encoding="utf-8")


LOGO = Path(__file__).resolve().parents[1] / "assets" / "email-logo.png"


def _message(to: str, subject: str, body: str, html: str | None) -> EmailMessage:
    from app.services.account_emails import LOGO_CID
    msg = EmailMessage()
    msg["From"] = f"SkillMap <{settings.smtp_user}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)                       # plain text first: mail apps without HTML show this
    if html:
        msg.add_alternative(html, subtype="html")
        if f"cid:{LOGO_CID}" in html and LOGO.exists():
            # the logo travels inside the email (multipart/related), so no image is fetched from anywhere
            msg.get_payload()[1].add_related(LOGO.read_bytes(), "image", "png", cid=f"<{LOGO_CID}>",
                                             filename="skillmap.png", disposition="inline")
    return msg


def send_email_now(to: str, subject: str, body: str, html: str | None = None) -> None:
    """Sends in this request; raises MailNotSent if the mail server didn't accept it."""
    if settings.e2e_outbox:
        _to_outbox(to, subject, body)
        return
    if not mail_configured():
        if settings.production:
            # 24 Nov (deployment audit): never print an email (or its code) on a real server; never claim success
            raise MailNotSent("email is not set up")
        print(f"[mail not configured] to={to} | {subject}\n{body}")   # local development only
        return
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            smtp.starttls()
            smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(_message(to, subject, body, html))
    except Exception as e:
        print(f"[mail] sending to {to} failed: {e}")
        raise MailNotSent(str(e)) from e


def send_email(to: str, subject: str, body: str, html: str | None = None) -> None:
    """Runs in the background (BackgroundTasks): the request has already returned, so a failure is logged only."""
    try:
        send_email_now(to, subject, body, html)
    except MailNotSent:
        pass
