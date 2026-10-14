"""
Connect GitHub (14 Oct; her design after research, references.md "Verifying GitHub and LinkedIn accounts").

Why: a student could paste anyone's public repo and its languages would count as her skills. Signing in to GitHub
proves which accounts are hers; a repo then shows "Student's own GitHub" when one of them owns it or contributed to
it, else "Not linked to the student's GitHub". It never blocks saving (people have several accounts: she can connect
them all). LinkedIn stays a typed link: LinkedIn's sign-in returns name, email and picture but not the profile URL,
so it couldn't prove the link is hers.

Flow (GitHub OAuth web flow, no scope = public data only):
  GET  /profile/github/connect-url  -> GitHub's sign-in page, with a short-lived signed `state` naming this student
  GitHub -> <frontend>/github/callback?code&state -> POST /profile/github/connect {code, state}
  the backend swaps the code for a token, reads the login, drops the token, saves the account, re-checks her repos.
"""
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.profile import GithubAccount, UserProject
from app.models.user import User
from app.routers.auth import get_current_user
from app.services.github_repo import check_repo_owner, exchange_code

router = APIRouter(prefix="/profile/github", tags=["profile"])

STATE_MINUTES = 10
NOT_SET_UP = ("Connecting GitHub isn't set up on this SkillMap yet (the server needs GITHUB_CLIENT_ID and "
              "GITHUB_CLIENT_SECRET). You can still add projects with a GitHub link.")


def _redirect_uri() -> str:
    return settings.frontend_url.rstrip("/") + "/github/callback"


def accounts_of(user_id: int, db: Session) -> list[GithubAccount]:
    return db.query(GithubAccount).filter(GithubAccount.user_id == user_id).order_by(GithubAccount.id).all()


def _out(accounts: list[GithubAccount]) -> list[dict]:
    return [{"id": a.id, "login": a.login, "url": f"https://github.com/{a.login}", "connected_at": a.connected_at}
            for a in accounts]


def recheck_projects(user: User, db: Session) -> int:
    """Work out again, for every project of hers with a repo, whether a connected account owns or contributed to it
    (after connecting or disconnecting an account). The profile's GitHub link follows the first connected account."""
    logins = [a.login for a in accounts_of(user.id, db)]
    for p in db.query(UserProject).filter(UserProject.user_id == user.id, UserProject.github_url.isnot(None)):
        result, as_login = check_repo_owner(p.github_url, logins)
        if result is not None or not logins:
            p.repo_check, p.repo_check_as = result or "not_linked", as_login
    user.github_url = f"https://github.com/{logins[0]}" if logins else None
    db.commit()
    return db.query(UserProject).filter(UserProject.user_id == user.id, UserProject.repo_check == "yours").count()


@router.get("/accounts")
def list_accounts(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # repo_projects: her projects with a GitHub link (the connecting screen shows "Checking your projects' GitHub
    # links" only when there are some)
    repo_projects = db.query(UserProject).filter(UserProject.user_id == current_user.id,
                                                 UserProject.github_url.isnot(None)).count()
    return {"accounts": _out(accounts_of(current_user.id, db)), "set_up": bool(settings.github_client_id),
            "repo_projects": repo_projects}


@router.get("/connect-url")
def connect_url(current_user: User = Depends(get_current_user)):
    """GitHub's sign-in page. `state` is signed and names this student for STATE_MINUTES, so a code can only be used
    by the person who started the sign-in (OAuth CSRF protection). It has no "sub", so it can't sign anyone in."""
    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(status_code=503, detail=NOT_SET_UP)
    state = jwt.encode({"github_connect": current_user.id,
                        "exp": datetime.now(timezone.utc) + timedelta(minutes=STATE_MINUTES)},
                       settings.secret_key, algorithm=settings.algorithm)
    query = urlencode({"client_id": settings.github_client_id, "redirect_uri": _redirect_uri(), "state": state,
                       "allow_signup": "false", "prompt": "select_account"})
    return {"url": f"https://github.com/login/oauth/authorize?{query}"}


class ConnectIn(BaseModel):
    code: str = Field(max_length=200)
    state: str = Field(max_length=2000)


@router.post("/connect")
def connect(data: ConnectIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        claims = jwt.decode(data.state, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(status_code=400, detail="The GitHub sign-in took too long or didn't start here. Please try again.")
    if claims.get("github_connect") != current_user.id:
        raise HTTPException(status_code=400, detail="This GitHub sign-in was started by another SkillMap account.")
    try:
        gh = exchange_code(data.code, _redirect_uri())
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))
    owner = db.query(GithubAccount).filter(GithubAccount.github_id == gh["id"]).first()
    if owner and owner.user_id != current_user.id:
        raise HTTPException(status_code=409, detail=f"The GitHub account {gh['login']} is already connected to "
                                                    "another SkillMap account.")
    if owner:
        owner.login = gh["login"]              # GitHub usernames can change; the id doesn't
    else:
        db.add(GithubAccount(user_id=current_user.id, github_id=gh["id"], login=gh["login"]))
    db.commit()
    before = db.query(UserProject).filter(UserProject.user_id == current_user.id, UserProject.repo_check == "yours").count()
    after = recheck_projects(current_user, db)
    # how many projects NOW show as hers because of this account (the page says it only when it's more than 0)
    return {"connected": gh["login"], "newly_yours": max(after - before, 0),
            "accounts": _out(accounts_of(current_user.id, db))}


@router.delete("/accounts/{account_id}")
def disconnect(account_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    account = db.get(GithubAccount, account_id)
    if not account or account.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="That GitHub account isn't connected to yours.")
    db.delete(account)
    db.commit()
    recheck_projects(current_user, db)
    return {"accounts": _out(accounts_of(current_user.id, db))}


class CheckIn(BaseModel):
    url: str = Field(max_length=500)


@router.post("/check")
def check_link(data: CheckIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """For the project form, as she types the link: is this repo hers? Nothing saved."""
    logins = [a.login for a in accounts_of(current_user.id, db)]
    result, as_login = check_repo_owner(data.url, logins)
    return {"status": result, "as": as_login, "connected": bool(logins)}
