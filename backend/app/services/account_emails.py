"""
The account emails (4 Oct, her request: clearer and more helpful). Each says what happened, to which account and
when, what to do if it was the student (usually nothing) and what to do if it wasn't.

23 Nov (her request: "make the email nicer"): every email is written once as parts (heading, paragraphs, an optional
code, an optional "if it wasn't you" box) and sent as BOTH plain text (the same words as before, for mail apps
without HTML) and an HTML version: one white card on a light background, the SkillMap name, the code in large
digits. No images or anything loaded from outside (nothing to block, nothing tracked). Every name and address put
into the HTML is escaped. Each function returns (subject, text, html), so callers pass it on with *.

"Reply to this email" is the help route: emails come from SMTP_USER, so a reply reaches whoever runs SkillMap.
There is no admin page or support desk in this prototype (out of scope of the four objectives); a production
version would give a support address here instead.
"""
from datetime import datetime, timedelta, timezone
from html import escape

MYT = timezone(timedelta(hours=8))   # Malaysia/Singapore time; fixed offset, so no tz database needed on Windows
SIGN_OFF = "Thanks,\nSkillMap"
HELP = "Need help? Reply to this email."

# the app's colours (index.css), written out because email can't read CSS variables
INK, SOFT, MUTED, LINE = "#16142b", "#3a3754", "#5c5976", "#e3e6ee"
ACCENT, ACCENT_STRONG, ACCENT_SOFT = "#2557c4", "#1d469f", "#e3ebfa"
WARN_BG, WARN_INK = "#fff4d6", "#6b4a00"
FONT = "'Plus Jakarta Sans',Segoe UI,Helvetica,Arial,sans-serif"
# 23 Nov (her review: "use the correct icon"): the app's own mark (components/ui/Logo.jsx, "meet on the map"), as a
# PNG attached INSIDE the email (an inline image, Content-ID): Gmail shows no SVG, and nothing is loaded from outside.
# app/services/mailer.py attaches app/assets/email-logo.png under this id.
LOGO_CID = "skillmap-logo"


def _when() -> str:
    t = datetime.now(MYT)
    return f"{t.day} {t:%b %Y} at {t:%I:%M %p}".replace(" 0", " ").replace("AM", "am").replace("PM", "pm") + \
        " (Malaysia time)"


def _email(subject: str, heading: str, first_name: str, paragraphs: list[str], *, code: str | None = None,
           code_note: str = "", warning: str = "", help_line: bool = False) -> tuple[str, str, str]:
    """paragraphs are plain sentences; in the HTML, **x** is shown bold (and x itself is escaped)."""
    # plain text: the same layout as the 4 Oct emails
    parts = [f"Hi {first_name},"] + [p.replace("**", "") for p in paragraphs[:1]]
    if code:
        parts.append(f"    {code}")
        if code_note:
            parts.append(code_note)
    parts += [p.replace("**", "") for p in paragraphs[1:]]
    if warning:
        parts.append(warning)
    if help_line:
        parts.append(HELP)
    text = "\n\n".join(parts + [SIGN_OFF])

    def para(p: str) -> str:
        chunks = escape(p).split("**")
        inner = "".join(f'<strong style="color:{INK}">{c}</strong>' if i % 2 else c for i, c in enumerate(chunks))
        return f'<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:{SOFT}">{inner}</p>'

    body = [f'<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:{SOFT}">Hi {escape(first_name)},</p>']
    body += [para(p) for p in paragraphs[:1]]
    if code:
        body.append(
            f'<div style="margin:6px 0 18px;padding:18px 12px;border-radius:14px;background:{ACCENT_SOFT};text-align:center">'
            f'<div style="font-family:Consolas,\'DM Mono\',Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:10px;'
            f'color:{ACCENT_STRONG}">{escape(code)}</div>'
            + (f'<div style="margin-top:6px;font-size:13px;color:{MUTED}">{escape(code_note)}</div>' if code_note else "")
            + '</div>')
    body += [para(p) for p in paragraphs[1:]]
    if warning:
        body.append(f'<div style="margin:4px 0 16px;padding:12px 14px;border-radius:12px;background:{WARN_BG};'
                    f'font-size:14px;line-height:1.55;color:{WARN_INK}">{escape(warning)}</div>')
    body.append(f'<p style="margin:18px 0 0;font-size:15px;line-height:1.6;color:{SOFT}">Thanks,<br>'
                f'<strong style="color:{INK}">SkillMap</strong></p>')

    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>{escape(subject)}</title></head>
<body style="margin:0;padding:0;background:#f2f5fb;font-family:{FONT}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f5fb">
<tr><td align="center" style="padding:28px 14px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td style="padding:0 6px 14px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="width:32px;height:32px;line-height:0"><img src="cid:{LOGO_CID}" width="32" height="32" alt="" style="display:block;border:0"></td>
        <td style="padding-left:9px;font-size:20px;font-weight:800;letter-spacing:-0.5px;color:{INK}">SkillMap</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:#ffffff;border:1px solid {LINE};border-radius:18px;padding:30px 30px 26px">
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;letter-spacing:-0.3px;color:{INK}">{escape(heading)}</h1>
      {''.join(body)}
    </td></tr>
    <tr><td style="padding:16px 8px 0;font-size:12.5px;line-height:1.6;color:{MUTED};text-align:center">
      {escape(HELP) if help_line else 'Questions? Reply to this email.'}<br>
      SkillMap · Academic skill mapping and job recommendation
    </td></tr>
  </table>
</td></tr></table>
</body></html>"""
    return subject, text, html


def verify_code(first_name: str, username: str, code: str, minutes: int) -> tuple[str, str, str]:
    """23 Nov: the code that proves a new account's email address is the owner's."""
    return _email("Your SkillMap verification code", "Verify your email", first_name, [
        f"Here is your code to finish creating your SkillMap account (**{username}**):",
        "Enter it on the \"Check your email\" page.",
    ], code=code, code_note=f"It expires in {minutes} minutes and can be used once.",
        warning="Didn't create a SkillMap account? You can ignore this email: the account can't be used without "
                "this code.")


def reset_code(first_name: str, username: str, code: str, minutes: int) -> tuple[str, str, str]:
    return _email("Your SkillMap password reset code", "Reset your password", first_name, [
        f"Here is your code to reset the password for your SkillMap account (**{username}**):",
    ], code=code, code_note=f"It expires in {minutes} minutes and can be used once.",
        warning="Didn't ask for this? You can ignore this email: your password stays the same.")


def email_code(first_name: str, username: str, code: str, minutes: int) -> tuple[str, str, str]:
    return _email("Confirm your new SkillMap email", "Confirm your new email", first_name, [
        f"Here is your code to use this address for your SkillMap account (**{username}**):",
    ], code=code, code_note=f"It expires in {minutes} minutes and can be used once.",
        warning="Didn't ask for this? You can ignore this email: nothing will change.")


def password_changed(first_name: str, username: str) -> tuple[str, str, str]:
    return _email("Your SkillMap password was changed", "Your password was changed", first_name, [
        f"The password for your SkillMap account (**{username}**) was changed on **{_when()}**. "
        "Any other devices signed in to your account have been signed out.",
        "If this was you, there's nothing else to do.",
    ], warning="If it wasn't you, please reset your password now: on the SkillMap sign-in page, choose "
               "\"Forgot password?\".", help_line=True)


def email_changed(first_name: str, username: str, new_email: str) -> tuple[str, str, str]:
    # Sent to the OLD address. "Forgot password?" would send its code to the new address, so if this wasn't the
    # student, replying is the way back to her account.
    return _email("Your SkillMap email was changed", "Your email was changed", first_name, [
        f"The email for your SkillMap account (**{username}**) was changed to **{new_email}** on **{_when()}**. "
        "Emails from SkillMap will now go there.",
        "If this was you, there's nothing else to do.",
    ], warning="If it wasn't you, please reply to this email straight away so we can help you get your account back.")
