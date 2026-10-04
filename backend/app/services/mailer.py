"""
Sends plain-text emails (4 Oct: "Forgot password" codes and the confirmation after a reset).

Gmail SMTP with an app password, set in backend/.env as SMTP_USER and SMTP_PASSWORD. Without them nothing is sent
and the message is printed in the backend console instead, so the flow can still be tried locally; never leave it
like that for real users.
"""
import smtplib
from email.message import EmailMessage

from app.config import settings


def mail_configured() -> bool:
    return bool(settings.smtp_user and settings.smtp_password)


def send_email(to: str, subject: str, body: str) -> None:
    if not mail_configured():
        print(f"[mail not configured] to={to} | {subject}\n{body}")
        return
    msg = EmailMessage()
    msg["From"] = f"SkillMap <{settings.smtp_user}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            smtp.starttls()
            smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)
    except Exception as e:   # runs in the background: log it, the request has already returned
        print(f"[mail] sending to {to} failed: {e}")
