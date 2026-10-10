"""
Languages of a student's GitHub repo as project evidence (4 Oct, her idea).

GitHub's public "List repository languages" endpoint (GET /repos/{owner}/{repo}/languages, no key needed) gives the
bytes of code per language. Languages with at least MIN_SHARE of the code count as skills; smaller shares are usually
template files or one helper script. Only public repos can be read: a private or missing repo answers 404, so the
student is told to make it public. Unauthenticated limit: 60 calls an hour per IP (one call per project added).
https://docs.github.com/en/rest/repos/repos#list-repository-languages
"""
import re

import requests

MIN_SHARE = 0.10
TIMEOUT = 8
# Build glue GitHub counts as a language, not a skill on its own
SKIP = {"Batchfile", "Makefile", "Procfile", "Roff", "CMake", "M4"}
# GitHub's language name -> the usual skill name
SKILL_NAME = {"Dockerfile": "Docker", "Shell": "Shell scripting", "PowerShell": "PowerShell scripting"}
_REPO_URL = re.compile(r"^(?:https?://)?(?:www\.)?github\.com/([\w.-]+)/([\w.-]+?)(?:\.git)?/?(?:[/?#].*)?$", re.I)

NOT_GITHUB = "Only github.com links can be read for languages."
NOT_PUBLIC = "Couldn't read the GitHub repo, so its languages weren't added. Make sure the repo is public."
UNREACHABLE = "Couldn't reach GitHub (no internet, or GitHub was slow), so languages weren't added. Edit and save the project later to try again."
RATE_LIMITED = "GitHub's limit of 60 repo reads an hour was reached, so languages weren't added. Edit and save the project in an hour to try again."


def parse_repo(url: str) -> tuple[str, str] | None:
    m = _REPO_URL.match((url or "").strip())
    return (m.group(1), m.group(2)) if m else None


def repo_languages(url: str) -> tuple[dict[str, int], str | None]:
    """({language: percent of the code}, note for the student or None). Percent is rounded to whole numbers."""
    repo = parse_repo(url)
    if not repo:
        return {}, NOT_GITHUB
    try:
        resp = requests.get(f"https://api.github.com/repos/{repo[0]}/{repo[1]}/languages", timeout=TIMEOUT,
                            headers={"Accept": "application/vnd.github+json", "User-Agent": "SkillMap-FYP"})
    except requests.RequestException as e:
        print(f"[github] {url}: {e}")
        return {}, UNREACHABLE
    if resp.status_code == 404:
        return {}, NOT_PUBLIC
    if resp.status_code != 200:
        print(f"[github] {url}: HTTP {resp.status_code}")
        # 403 / 429 with no calls left = the hourly limit for calls without a key (GitHub REST rate-limit docs)
        if resp.status_code in (403, 429) and resp.headers.get("x-ratelimit-remaining") == "0":
            return {}, RATE_LIMITED
        return {}, UNREACHABLE
    data = resp.json()
    data = data if isinstance(data, dict) else {}
    total = sum(v for v in data.values() if isinstance(v, int))
    if not total:
        return {}, None   # empty repo: nothing to add, nothing wrong
    return {SKILL_NAME.get(lang, lang): round(100 * size / total) for lang, size in data.items()
            if isinstance(size, int) and size / total >= MIN_SHARE and lang not in SKIP}, None


# ── Import from GitHub (8 Oct): list a student's public repositories ──────────────────────────────────────────────
# GitHub's public "List repositories for a user" endpoint (GET /users/{username}/repos, no key needed): ONE call gives
# name, description, main language and topics for up to 100 repos, so listing costs 1 of the 60 calls an hour.
# The per-repo language shares are read only for the repos the student imports (repo_languages, when each is saved).
# https://docs.github.com/en/rest/repos/repos#list-repositories-for-a-user

_ACCOUNT = re.compile(r"^(?:https?://)?(?:www\.)?github\.com/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))/?(?:[?#].*)?$", re.I)
_USERNAME = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$")

NOT_ACCOUNT = "Type your GitHub username or profile link, e.g. https://github.com/your-name"
NO_ACCOUNT = "No GitHub account has that name. Check the spelling."
LIST_UNREACHABLE = "Couldn't reach GitHub (no internet, or GitHub was slow). Please try again."
LIST_RATE_LIMITED = "GitHub's limit of 60 reads an hour was reached. Please try again in an hour."


def parse_account(text: str) -> str | None:
    """'Ling2609' or 'https://github.com/Ling2609' -> 'Ling2609'; anything else -> None."""
    text = (text or "").strip()
    if _USERNAME.match(text):
        return text
    m = _ACCOUNT.match(text)
    return m.group(1) if m else None


def same_repo(a: str | None, b: str | None) -> bool:
    """Two links point at the same repo, whatever the capitals, 'www.' or a trailing '/' or '.git'."""
    ra, rb = parse_repo(a or ""), parse_repo(b or "")
    return bool(ra and rb) and (ra[0].lower(), ra[1].lower()) == (rb[0].lower(), rb[1].lower())


def public_repos(account: str) -> tuple[list[dict], str | None]:
    """(the account's own public repos, most recently updated first; note for the student or None). Forks are left
    out: they are copies of someone else's work."""
    username = parse_account(account)
    if not username:
        return [], NOT_ACCOUNT
    try:
        resp = requests.get(f"https://api.github.com/users/{username}/repos", timeout=TIMEOUT,
                            params={"per_page": 100, "sort": "updated", "type": "owner"},
                            headers={"Accept": "application/vnd.github+json", "User-Agent": "SkillMap-FYP"})
    except requests.RequestException as e:
        print(f"[github] repos of {username}: {e}")
        return [], LIST_UNREACHABLE
    if resp.status_code == 404:
        return [], NO_ACCOUNT
    if resp.status_code != 200:
        print(f"[github] repos of {username}: HTTP {resp.status_code}")
        if resp.status_code in (403, 429) and resp.headers.get("x-ratelimit-remaining") == "0":
            return [], LIST_RATE_LIMITED
        return [], LIST_UNREACHABLE
    data = resp.json()
    data = data if isinstance(data, list) else []
    return [{"name": r.get("name", ""), "description": (r.get("description") or "").strip(),
             "url": r.get("html_url", ""), "language": r.get("language") or "", "topics": r.get("topics") or []}
            for r in data if isinstance(r, dict) and not r.get("fork") and r.get("html_url")], None


# ── README as a starting description (10 Oct, her review: imported repos with no description had to be edited after
# saving). GitHub's "Get a repository README" (GET /repos/{owner}/{repo}/readme, raw media type, no key needed) is read
# only for a picked repo that has no GitHub description: one call each. The student checks and edits the text before
# anything is saved. https://docs.github.com/en/rest/repos/contents#get-a-repository-readme

# Template text that says nothing about what the student built (create-vite, create-react-app, Flutter, Next.js)
_BOILERPLATE = re.compile(r"bootstrapped with|this template (should help|provides)|getting started with create react app"
                          r"|a new flutter project|this is a \[?next\.js\]? project|react \+ vite|minimal setup to get "
                          r"react working", re.I)
README_MAX = 600


def readme_summary(text: str) -> str:
    """The first real paragraph of a README in plain text ('' if it has none): headings, badges, images, HTML, code
    blocks, tables and list markers are skipped; links keep their words."""
    text = re.sub(r"```.*?```", "\n\n", text or "", flags=re.S)
    text = re.sub(r"<!--.*?-->", " ", text, flags=re.S)
    for block in re.split(r"\n\s*\n", text):
        lines = []
        for line in block.splitlines():
            line = line.strip()
            if not line or line.startswith(("#", "|", ">", "<", "---", "===", "***")) or re.fullmatch(r"(\[?!\[.*)", line):
                continue
            line = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", line)              # images and badges
            line = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", line)           # [words](link) -> words
            line = re.sub(r"<[^>]+>", "", line)                             # inline HTML
            item = re.match(r"^([-*+]|\d+[.)])\s+", line)
            line = re.sub(r"^([-*+]|\d+[.)])\s+", "", line)                 # list markers
            line = re.sub(r"[*_`]{1,3}", "", line).strip()
            if item and line and line[-1] not in ".!?:;":
                line += "."                                                 # list items read as sentences
            if line:
                lines.append(line)
        para = " ".join(lines).strip()
        if len(para) >= 30 and not _BOILERPLATE.search(para):
            if len(para) > README_MAX:
                para = para[:README_MAX].rsplit(" ", 1)[0] + "…"
            return para
    return ""


def repo_readme(url: str) -> tuple[str, str | None]:
    """(the README's first paragraph or '', note for the student or None)."""
    repo = parse_repo(url)
    if not repo:
        return "", NOT_GITHUB
    try:
        resp = requests.get(f"https://api.github.com/repos/{repo[0]}/{repo[1]}/readme", timeout=TIMEOUT,
                            headers={"Accept": "application/vnd.github.raw+json", "User-Agent": "SkillMap-FYP"})
    except requests.RequestException as e:
        print(f"[github] readme {url}: {e}")
        return "", LIST_UNREACHABLE
    if resp.status_code == 404:
        return "", None      # no README: nothing to fill in, nothing wrong
    if resp.status_code != 200:
        print(f"[github] readme {url}: HTTP {resp.status_code}")
        if resp.status_code in (403, 429) and resp.headers.get("x-ratelimit-remaining") == "0":
            return "", LIST_RATE_LIMITED
        return "", LIST_UNREACHABLE
    return readme_summary(resp.text), None
