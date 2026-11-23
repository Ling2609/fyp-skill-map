"""23 Nov: registration email verification (skillmap-design/email-verification-spec.md v3).

A new account can't sign in until its owner enters the 6-digit code emailed to it. These tests use the real API on
the throwaway test database; the email itself is caught (not sent) so the code can be read.
"""
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient

from conftest import PASSWORD, run_migration, sql

CODE_LINE = re.compile(r"^\s{4}(\d{6})$", re.M)


@pytest.fixture(autouse=True, scope="module")
def tidy_codes_afterwards(db):
    """These tests leave used and expired codes behind; delete them afterwards as the backend's own start-up tidy
    does (delete_old_codes), so later tests (test_install reruns migrate_account_security, which tidies too) start
    from a clean table."""
    yield
    sql(db, "delete from password_reset_otps where used or expires_at < now()")


@pytest.fixture
def mailbox(monkeypatch):
    """Catches every registration-code email: [(to, subject, text, html)]."""
    from app.services import email_verification
    sent = []

    def fake_send(to, subject, text, html=None):
        sent.append((to, subject, text, html))
    monkeypatch.setattr(email_verification, "send_email_now", fake_send)
    return sent


def code_in(mail) -> str:
    return CODE_LINE.search(mail[2]).group(1)


def sign_up(client, n, role="student"):
    body = {"username": f"ver{n}", "first_name": "Wei", "last_name": "Ling", "email": f"ver{n}@example.com",
            "password": PASSWORD, "role": role, "accept_privacy": True}
    if role == "employer":
        body.update(company_name="Kayu Digital Sdn Bhd", company_website="kayudigital.com.my", company_ssm="202301012345")
    r = client.post("/auth/register", json=body)
    assert r.status_code == 201, r.text
    return body["email"], r.json()


def sign_in(client, email):
    return client.post("/auth/login", json={"email": email, "password": PASSWORD})


def age_sends(db, email, seconds=61):
    """Moves this account's send records back in time (instead of waiting for the cooldown)."""
    sql(db, "update email_code_sends set sent_at = sent_at - make_interval(secs => :s) "
            "where user_id = (select id from users where email = :e)", s=seconds, e=email)


# ── register, verify, sign in ─────────────────────────────────────────────────────────────────────────────────

def test_a_new_account_is_unverified_and_gets_a_code(client, db, mailbox):
    email, body = sign_up(client, 1)
    assert sql(db, "select email_verified_at from users where email=:e", e=email).scalar() is None
    assert body["ticket"] and body["verification"]["result"] == "sent"
    assert len(mailbox) == 1 and mailbox[0][0] == email and code_in(mailbox[0])
    assert "access_token" not in body                              # registering never signs in


def test_signing_in_before_verifying_gives_no_session(client, mailbox):
    email, _ = sign_up(client, 2)
    r = sign_in(client, email)
    assert r.status_code == 403
    d = r.json()["detail"]
    assert d["code"] == "email_not_verified" and d["ticket"] and "access_token" not in r.json()
    assert d["verification"]["result"] == "reused"                 # the code from sign-up still works: none sent
    assert len(mailbox) == 1


def test_a_wrong_password_is_answered_as_before(client, mailbox):
    email, _ = sign_up(client, 3)
    r = client.post("/auth/login", json={"email": email, "password": "wrong-password-123"})
    assert r.status_code == 401 and r.json()["detail"] == "Invalid credentials"   # nothing about verification


def test_the_right_code_verifies_without_a_session_then_sign_in_works(client, db, mailbox):
    email, body = sign_up(client, 4)
    r = client.post("/auth/verify-email", json={"ticket": body["ticket"], "code": code_in(mailbox[0])})
    assert r.status_code == 200 and r.json()["verified"] is True and "access_token" not in r.json()
    assert sql(db, "select email_verified_at from users where email=:e", e=email).scalar() is not None
    assert sign_in(client, email).status_code == 200


def test_a_pasted_code_with_spaces_or_a_dash_works(client, mailbox):
    _, body = sign_up(client, 5)
    c = code_in(mailbox[0])
    r = client.post("/auth/verify-email", json={"ticket": body["ticket"], "code": f" {c[:3]}-{c[3:]} "})
    assert r.status_code == 200, r.text


def test_wrong_codes_are_counted_and_the_fifth_wrong_one_ends_the_code(client, mailbox):
    _, body = sign_up(client, 6)
    good = code_in(mailbox[0])
    bad = "000000" if good != "000000" else "111111"
    for i in range(5):
        r = client.post("/auth/verify-email", json={"ticket": body["ticket"], "code": bad})
        assert r.status_code == 400 and r.json()["detail"]["tries_left"] == 4 - i   # the page can say how many
    r = client.post("/auth/verify-email", json={"ticket": body["ticket"], "code": good})
    assert r.status_code == 400 and "Too many wrong tries" in r.json()["detail"]["message"]   # even the right one now
    assert r.json()["detail"]["tries_left"] == 0


def test_an_exhausted_code_is_not_reused_at_sign_in(client, db, mailbox):
    email, body = sign_up(client, 7)
    for _ in range(5):
        client.post("/auth/verify-email", json={"ticket": body["ticket"], "code": "999999" if code_in(mailbox[0]) != "999999" else "888888"})
    age_sends(db, email)
    d = sign_in(client, email).json()["detail"]
    assert d["verification"]["result"] == "sent" and len(mailbox) == 2      # a fresh code, not the exhausted one


def test_an_expired_code_is_refused(client, db, mailbox):
    email, body = sign_up(client, 8)
    sql(db, "update password_reset_otps set expires_at = now() - interval '1 second' "
            "where user_id = (select id from users where email=:e)", e=email)
    r = client.post("/auth/verify-email", json={"ticket": body["ticket"], "code": code_in(mailbox[0])})
    assert r.status_code == 400


def test_registration_codes_last_10_minutes_and_reset_codes_15(client, db, users, mailbox):
    email, _ = sign_up(client, 9)
    mins = sql(db, "select extract(epoch from expires_at - created_at) / 60 from password_reset_otps "
                   "where user_id = (select id from users where email=:e) and purpose='register'", e=email).scalar()
    assert 9.9 < float(mins) <= 10.05
    other = users.student(skills=())
    client.post("/auth/forgot-password", json={"identifier": other})
    mins = sql(db, "select extract(epoch from expires_at - now()) / 60 from password_reset_otps "
                   "where user_id = :i and purpose='reset'", i=users.ids[other]).scalar()
    assert 14.5 < float(mins) <= 15.05


# ── the ticket ───────────────────────────────────────────────────────────────────────────────────────────────

def test_the_ticket_is_rechecked_every_time(client, db, mailbox):
    from app.config import settings
    email, body = sign_up(client, 10)
    t = body["ticket"]
    assert client.post("/auth/verify-email/resend", json={"ticket": t + "x"}).status_code == 400        # tampered
    claims = jwt.decode(t, settings.secret_key + "|verify-email", algorithms=[settings.algorithm])
    old = jwt.encode({**claims, "exp": datetime.now(timezone.utc) - timedelta(seconds=1)},
                     settings.secret_key + "|verify-email", algorithm=settings.algorithm)
    assert client.post("/auth/verify-email/resend", json={"ticket": old}).status_code == 400            # expired
    sql(db, "update users set email = 'changed10@example.com' where email = :e", e=email)
    r = client.post("/auth/verify-email", json={"ticket": t, "code": code_in(mailbox[0])})
    assert r.status_code == 400 and "expired" in r.json()["detail"]                                      # email changed


def test_a_ticket_for_a_verified_or_deleted_account_is_refused(client, db, mailbox):
    email, body = sign_up(client, 11)
    assert client.post("/auth/verify-email", json={"ticket": body["ticket"], "code": code_in(mailbox[0])}).status_code == 200
    assert client.post("/auth/verify-email/resend", json={"ticket": body["ticket"]}).status_code == 400   # verified
    email2, body2 = sign_up(client, 12)
    sql(db, "delete from users where email = :e", e=email2)
    assert client.post("/auth/verify-email/resend", json={"ticket": body2["ticket"]}).status_code == 400  # deleted


# ── sending: reuse, Send again, cooldown, daily limit ──────────────────────────────────────────────────────────

def test_send_again_replaces_the_code_after_the_cooldown(client, db, mailbox):
    email, body = sign_up(client, 13)
    first = code_in(mailbox[0])
    r = client.post("/auth/verify-email/resend", json={"ticket": body["ticket"]}).json()
    assert r["result"] == "limited" and r["limit"] == "cooldown" and len(mailbox) == 1   # within 60 s: no send
    nxt = datetime.fromisoformat(r["next_send_at"])
    assert 50 < (nxt - datetime.now(timezone.utc)).total_seconds() <= 60
    age_sends(db, email)
    r = client.post("/auth/verify-email/resend", json={"ticket": body["ticket"]}).json()
    assert r["result"] == "sent" and len(mailbox) == 2
    second = code_in(mailbox[1])
    if first != second:   # the old code no longer works
        assert client.post("/auth/verify-email", json={"ticket": body["ticket"], "code": first}).status_code == 400
    assert client.post("/auth/verify-email", json={"ticket": body["ticket"], "code": second}).status_code == 200


def test_five_accepted_emails_a_day_then_the_real_next_time(client, db, mailbox):
    email, body = sign_up(client, 14)                 # accepted email 1
    for _ in range(4):                                # 2..5
        age_sends(db, email)
        assert client.post("/auth/verify-email/resend", json={"ticket": body["ticket"]}).json()["result"] == "sent"
    age_sends(db, email)
    r = client.post("/auth/verify-email/resend", json={"ticket": body["ticket"]}).json()
    assert r["result"] == "limited" and r["limit"] == "daily" and len(mailbox) == 5
    oldest = sql(db, "select min(sent_at) from email_code_sends where accepted and user_id = "
                     "(select id from users where email=:e)", e=email).scalar()
    assert abs((datetime.fromisoformat(r["next_send_at"]) - (oldest + timedelta(hours=24))).total_seconds()) < 1
    # the limit stops sending, not verifying: the latest code still works
    assert r["expires_at"] is not None
    assert client.post("/auth/verify-email", json={"ticket": body["ticket"], "code": code_in(mailbox[-1])}).status_code == 200


def test_a_failed_send_keeps_the_old_code_and_does_not_use_up_the_day(client, db, mailbox, monkeypatch):
    from app.services import email_verification
    from app.services.mailer import MailNotSent
    email, body = sign_up(client, 15)
    good = code_in(mailbox[0])
    age_sends(db, email)

    def broken(*a, **k):
        raise MailNotSent("smtp down")
    monkeypatch.setattr(email_verification, "send_email_now", broken)
    r = client.post("/auth/verify-email/resend", json={"ticket": body["ticket"]}).json()
    assert r["result"] == "send_failed" and r["expires_at"] is not None          # previous code still usable
    rows = sql(db, "select accepted from email_code_sends where user_id = (select id from users where email=:e) "
                   "order by sent_at", e=email).fetchall()
    assert [a for (a,) in rows] == [True, False]                                  # counted as an attempt only
    r = client.post("/auth/verify-email/resend", json={"ticket": body["ticket"]}).json()
    assert r["result"] == "limited" and r["limit"] == "cooldown"                  # cooldown after a failure too
    assert client.post("/auth/verify-email", json={"ticket": body["ticket"], "code": good}).status_code == 200


def test_mail_accepted_but_storing_fails_is_reported_and_counted(client, db, mailbox, monkeypatch):
    import app.routers.auth as auth
    email, body = sign_up(client, 16)
    age_sends(db, email)

    def broken_hash(*a, **k):
        raise RuntimeError("database write failed")
    monkeypatch.setattr(auth, "_code_hash", broken_hash)
    r = client.post("/auth/verify-email/resend", json={"ticket": body["ticket"]}).json()
    assert r["result"] == "store_failed" and len(mailbox) == 2
    accepted = sql(db, "select count(*) from email_code_sends where accepted and user_id = "
                       "(select id from users where email=:e)", e=email).scalar()
    assert accepted == 2                                                          # the accepted email counts


# ── at the same moment ───────────────────────────────────────────────────────────────────────────────────────

def _together(fn, n):
    """Runs fn(i) n times at once, each on its own client (its own database session)."""
    from app.main import app
    start = threading.Barrier(n)

    def run(i):
        c = TestClient(app)
        start.wait()
        return fn(c, i)
    with ThreadPoolExecutor(n) as pool:
        return list(pool.map(run, range(n)))


def test_two_send_agains_at_once_send_one_email(client, db, mailbox, monkeypatch):
    from app.services import email_verification
    email, body = sign_up(client, 17)
    age_sends(db, email)
    slow = []

    def slow_send(to, subject, text, html=None):
        time.sleep(0.3)
        slow.append(text)
    monkeypatch.setattr(email_verification, "send_email_now", slow_send)
    results = _together(lambda c, i: c.post("/auth/verify-email/resend", json={"ticket": body["ticket"]}).json(), 2)
    assert sorted(r["result"] for r in results) == ["limited", "sent"] and len(slow) == 1


def test_wrong_codes_at_once_never_pass_five_tries(client, db, mailbox):
    email, body = sign_up(client, 18)
    bad = "000000" if code_in(mailbox[0]) != "000000" else "111111"
    codes = _together(lambda c, i: c.post("/auth/verify-email", json={"ticket": body["ticket"], "code": bad}).status_code, 8)
    assert all(s == 400 for s in codes)
    tries = sql(db, "select max(attempt_count) from password_reset_otps where user_id = "
                    "(select id from users where email=:e)", e=email).scalar()
    assert tries == 5


def test_the_right_code_twice_at_once_is_used_once(client, mailbox):
    _, body = sign_up(client, 19)
    good = code_in(mailbox[0])
    codes = _together(lambda c, i: c.post("/auth/verify-email", json={"ticket": body["ticket"], "code": good}).status_code, 2)
    assert sorted(codes)[0] == 200 and sorted(codes)[1] in (400, 409)


def test_one_reset_pass_resets_once_even_at_once(client, users, monkeypatch):
    import app.routers.auth as auth
    email = users.student(skills=())
    caught = []
    monkeypatch.setattr(auth, "send_email", lambda to, subject, text, html=None: caught.append(text))
    client.post("/auth/forgot-password", json={"identifier": email})
    code = CODE_LINE.search(caught[0]).group(1)
    reset = client.post("/auth/verify-reset-code", json={"identifier": email, "code": code}).json()["reset_token"]
    codes = _together(lambda c, i: c.post("/auth/reset-password", json={
        "reset_token": reset, "new_password": f"Brand-New-Harbour-{i}9"}).status_code, 2)
    assert sorted(codes) == [204, 400]


def test_one_email_change_code_changes_the_email_once_even_at_once(client, users, monkeypatch):
    import app.routers.auth as auth
    email = users.student(skills=())
    caught = []
    monkeypatch.setattr(auth, "send_email", lambda to, subject, text, html=None: caught.append(text))
    h = users.h(email)
    assert client.put("/auth/me/email", headers=h, json={"new_email": "moved20@example.com",
                                                         "current_password": PASSWORD}).status_code == 200
    code = CODE_LINE.search(caught[0]).group(1)
    codes = _together(lambda c, i: c.post("/auth/me/email/verify", headers=h, json={"code": code}).status_code, 2)
    assert sorted(codes) == [200, 400]


# ── password reset ───────────────────────────────────────────────────────────────────────────────────────────

def test_only_a_completed_reset_verifies_the_email(client, db, mailbox, monkeypatch):
    import app.routers.auth as auth
    email, _ = sign_up(client, 21)
    caught = []
    monkeypatch.setattr(auth, "send_email", lambda to, subject, text, html=None: caught.append(text))
    client.post("/auth/forgot-password", json={"identifier": email})
    code = CODE_LINE.search(caught[0]).group(1)
    reset = client.post("/auth/verify-reset-code", json={"identifier": email, "code": code}).json()["reset_token"]
    assert sql(db, "select email_verified_at from users where email=:e", e=email).scalar() is None   # not yet
    assert client.post("/auth/reset-password", json={"reset_token": reset,
                                                     "new_password": "Brand-New-Harbour-77"}).status_code == 204
    assert sql(db, "select email_verified_at from users where email=:e", e=email).scalar() is not None


# ── employers and the admin ──────────────────────────────────────────────────────────────────────────────────

def test_the_admin_cannot_act_on_an_unverified_account(client, db, users, mailbox):
    email, body = sign_up(client, 22, role="employer")
    uid = sql(db, "select id from users where email=:e", e=email).scalar()
    h = users.h(users.admin())
    for action, json in (("approve", None), ("reject", {"reason": "not a company"}),
                         ("deactivate", {"reason": "spam"}), ("reactivate", {"reason": "back"})):
        r = client.post(f"/admin/users/{uid}/{action}", headers=h, json=json)
        assert r.status_code == 409, (action, r.text)
    assert sql(db, "select count(*) from admin_actions where target_user_id=:i", i=uid).scalar() == 0
    pending = [u["email"] for u in client.get("/admin/dashboard", headers=h).json()["todo"]["pending_employers"]]
    listed = [u["email"] for u in client.get("/admin/users", headers=h).json()]
    assert email not in pending and email not in listed
    # once verified, the employer waits for approval as before
    assert client.post("/auth/verify-email", json={"ticket": body["ticket"], "code": code_in(mailbox[0])}).status_code == 200
    assert email in [u["email"] for u in client.get("/admin/dashboard", headers=h).json()["todo"]["pending_employers"]]
    assert client.post(f"/admin/users/{uid}/approve", headers=h).status_code == 200


# ── safety switches ──────────────────────────────────────────────────────────────────────────────────────────

def test_the_e2e_outbox_refuses_any_other_database(monkeypatch):
    from app.config import settings
    from app.services import mailer
    monkeypatch.setattr(settings, "e2e_outbox", True)
    with pytest.raises(RuntimeError):
        mailer.check_outbox()                    # the test database is not skillmap_e2e
    monkeypatch.setattr(settings, "e2e_outbox", False)
    mailer.check_outbox()


def test_the_html_email_escapes_names_and_keeps_a_plain_text_part():
    from app.services import account_emails
    subject, text, html = account_emails.verify_code("<b>Ann</b>", "ann_1", "123456", 10)
    assert "123456" in text and "123456" in html and "10 minutes" in html
    assert "<b>Ann</b>" in text and "&lt;b&gt;Ann&lt;/b&gt;" in html and "<b>Ann</b>" not in html
    srcs = re.findall(r'src="([^"]+)"', html)
    assert srcs == ["cid:skillmap-logo"] and "url(" not in html     # the only image travels inside the email


def test_the_logo_is_attached_inside_the_email():
    from app.services import account_emails
    from app.services.mailer import _message
    msg = _message("ann@example.com", *account_emails.verify_code("Ann", "ann_1", "123456", 10))
    parts = {p.get_content_type(): p for p in msg.walk()}
    assert "text/plain" in parts and "text/html" in parts             # plain text kept for mail apps without HTML
    logo = parts["image/png"]
    assert logo["Content-ID"] == "<skillmap-logo>" and logo.get_payload(decode=True)[:4] == b"\x89PNG"


def test_the_migration_backfills_once_and_never_on_a_rerun(client, db, users):
    old = users.student(skills=())
    sql(db, "alter table users drop column email_verified_at")
    sql(db, "drop table email_code_sends")
    first = run_migration("migrate_email_verified")
    assert "marked verified" in first
    assert sql(db, "select email_verified_at from users where id=:i", i=users.ids[old]).scalar() is not None
    sql(db, "insert into users (username, first_name, last_name, email, hashed_password, role, notification_prefs, "
            "is_visible_to_employers, is_active) values ('fresh1', 'F', 'R', 'fresh1@example.com', 'x', 'student', "
            "'{}', false, true)")
    assert "nothing changed" in run_migration("migrate_email_verified")
    assert sql(db, "select email_verified_at from users where username='fresh1'").scalar() is None   # untouched
    sql(db, "drop index ix_email_code_sends_user_purpose_sent")
    import subprocess
    import sys
    from conftest import BACKEND
    import os
    out = subprocess.run([sys.executable, "migrations/migrate_email_verified.py"], cwd=BACKEND, capture_output=True,
                         text=True, env={**os.environ}, timeout=120)
    assert out.returncode != 0 and "ix_email_code_sends_user_purpose_sent" in (out.stdout + out.stderr)
    assert sql(db, "select email_verified_at from users where username='fresh1'").scalar() is None   # still untouched
    sql(db, "create index ix_email_code_sends_user_purpose_sent on email_code_sends (user_id, purpose, sent_at)")
    sql(db, "delete from users where username='fresh1'")
