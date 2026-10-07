"""
Create an Admin (career office) account. Admin can't be chosen at sign-up (F2), so this is the only way in.
Asks for the details in the terminal; the password is typed hidden and must pass the same rules as sign-up.

Usage (from backend/, venv active):  python scripts/tools/create_admin.py
"""
import getpass
import sys

sys.path.append(".")


def main():
    from sqlalchemy import func

    from app.auth.utils import hash_password
    from app.database import SessionLocal
    from app.models.user import User, UserRole
    from app.services.password_policy import password_problem

    username = input("Username: ").strip().lower()
    email = input("Email: ").strip().lower()
    first = input("First name: ").strip() or "Career"
    last = input("Last name: ").strip() or "Office"
    password = getpass.getpass("Password (hidden): ")
    if getpass.getpass("Password again: ") != password:
        raise SystemExit("The two passwords differ: nothing created.")
    problem = password_problem(password, username, email)
    if problem:
        raise SystemExit(f"{problem}: nothing created.")

    db = SessionLocal()
    try:
        if db.query(User).filter((User.username == username) | (func.lower(User.email) == email)).first():
            raise SystemExit("That username or email is already used: nothing created.")
        db.add(User(username=username, email=email, first_name=first, last_name=last,
                    hashed_password=hash_password(password), role=UserRole.admin))
        db.commit()
    finally:
        db.close()
    print(f"Admin account '{username}' created. Sign in with it on the normal login page.")


if __name__ == "__main__":
    main()
