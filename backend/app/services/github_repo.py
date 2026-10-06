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
