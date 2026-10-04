"""
The account emails (4 Oct, her request: clearer and more helpful). Each says what happened, to which account and
when, what to do if it was the student (usually nothing) and what to do if it wasn't.

"Reply to this email" is the help route: emails come from SMTP_USER, so a reply reaches whoever runs SkillMap.
There is no admin page or support desk in this prototype (out of scope of the four objectives); a production
version would give a support address here instead.
"""
from datetime import datetime, timedelta, timezone

MYT = timezone(timedelta(hours=8))   # Malaysia/Singapore time; fixed offset, so no tz database needed on Windows
SIGN_OFF = "Thanks,\nSkillMap"
HELP = "Need help? Reply to this email."


def _when() -> str:
    t = datetime.now(MYT)
    return f"{t.day} {t:%b %Y} at {t:%I:%M %p}".replace(" 0", " ").replace("AM", "am").replace("PM", "pm") + \
        " (Malaysia time)"


def reset_code(first_name: str, username: str, code: str, minutes: int) -> tuple[str, str]:
    return ("Your SkillMap password reset code",
            f"Hi {first_name},\n\n"
            f"Here is your code to reset the password for your SkillMap account ({username}):\n\n"
            f"    {code}\n\n"
            f"It expires in {minutes} minutes and can be used once.\n\n"
            "Didn't ask for this? You can ignore this email: your password stays the same.\n\n"
            f"{SIGN_OFF}")


def email_code(first_name: str, username: str, code: str, minutes: int) -> tuple[str, str]:
    return ("Confirm your new SkillMap email",
            f"Hi {first_name},\n\n"
            f"Here is your code to use this address for your SkillMap account ({username}):\n\n"
            f"    {code}\n\n"
            f"It expires in {minutes} minutes and can be used once.\n\n"
            "Didn't ask for this? You can ignore this email: nothing will change.\n\n"
            f"{SIGN_OFF}")


def password_changed(first_name: str, username: str) -> tuple[str, str]:
    return ("Your SkillMap password was changed",
            f"Hi {first_name},\n\n"
            f"The password for your SkillMap account ({username}) was changed on {_when()}. "
            "Any other devices signed in to your account have been signed out.\n\n"
            "If this was you, there's nothing else to do.\n\n"
            "If it wasn't you, please reset your password now: on the SkillMap sign-in page, choose "
            "\"Forgot password?\".\n\n"
            f"{HELP}\n\n{SIGN_OFF}")


def email_changed(first_name: str, username: str, new_email: str) -> tuple[str, str]:
    # Sent to the OLD address. "Forgot password?" would send its code to the new address, so if this wasn't the
    # student, replying is the way back to her account.
    return ("Your SkillMap email was changed",
            f"Hi {first_name},\n\n"
            f"The email for your SkillMap account ({username}) was changed to {new_email} on {_when()}. "
            "Emails from SkillMap will now go there.\n\n"
            "If this was you, there's nothing else to do.\n\n"
            "If it wasn't you, please reply to this email straight away so we can help you get your account back.\n\n"
            f"{SIGN_OFF}")
