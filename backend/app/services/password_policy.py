"""
One password rule for Register, Account settings and Forgot password (4 Oct; references.md "Password strength").

Follows NIST SP 800-63B-4 except the length: at least 8 characters (NIST: 15 for a password used on its own; 8 is a
deliberate trade-off for a student prototype, stated in the report), no forced mix of character types (NIST "SHALL
NOT"), and a blocklist check (NIST "SHALL"): the 10,000 most common passwords (SecLists, MIT licence,
data/common_passwords.txt), the same word with numbers or symbols added at the end ("password123", "Sunshine99!"),
and the service name / the user's own username or email.
"""
import re
from functools import lru_cache
from pathlib import Path

MIN_LENGTH = 8
MAX_BYTES = 72   # bcrypt limit
COMMON_FILE = Path(__file__).resolve().parents[2] / "data" / "common_passwords.txt"


@lru_cache(maxsize=1)
def _common() -> frozenset[str]:
    try:
        return frozenset(w.strip().lower() for w in COMMON_FILE.read_text(encoding="utf-8", errors="ignore").splitlines()
                         if w.strip())
    except FileNotFoundError:
        print(f"[password policy] {COMMON_FILE} missing: common-password check skipped")
        return frozenset()


def common_passwords() -> frozenset[str]:
    return _common()


def password_problem(password: str, username: str = "", email: str = "") -> str | None:
    """None if the password is acceptable, else a short message for the student."""
    if len(password) < MIN_LENGTH:
        return f"Use at least {MIN_LENGTH} characters"
    if len(password.encode("utf-8")) > MAX_BYTES:
        return f"Please use a shorter password (up to {MAX_BYTES} characters)"
    low = password.lower()
    base = re.sub(r"[\d\W_]+$", "", low)            # "password123!" -> "password"
    common = _common()
    if low in common or (len(base) >= 4 and base in common):
        return "Choose a password that's harder to guess, e.g. a few random words"
    personal = {"skillmap", (username or "").lower(), (email or "").lower().split("@")[0]}
    if any(len(p) >= 3 and p in low for p in personal):
        return "Choose a password that doesn't include your username, email name or SkillMap"
    return None
