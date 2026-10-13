"""
Checked learning resources for the AI Assistant's learning plans (13 Oct 2026, her request: test the links before
they reach a student). The list is data/learning_resources.json; scripts/tools/check_learning_links.py opens every
link and marks it ok = true / false with the date.

- The assistant is given the resources for the skill being learnt (only links marked ok).
- Any other link in a reply is removed and its words kept (an allowlist): language models make up links and
  references (Walters & Wilder 2023: 18% of GPT-4's references were fabricated; references.md "Learning plan").
- 13 Oct (her request: every skill, not only the listed ones): a skill with no checked resource may get a SEARCH link
  (Coursera or YouTube results for the skill). SkillMap knows these addresses always open, whatever the words; the
  plan says they are search results, not a checked course.
"""
import json
import re
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote_plus, urlsplit

RESOURCES_FILE = Path(__file__).resolve().parents[2] / "data" / "learning_resources.json"
MAX_SKILLS = 4          # resources for at most this many skills go into one prompt
# Search pages: any words after "?" still open a results page, so these are allowed with any search words
SEARCH_PAGES = {"coursera.org/search": "https://www.coursera.org/search?query=",
                "youtube.com/results": "https://www.youtube.com/results?search_query="}


@lru_cache(maxsize=1)
def _load(path: str = str(RESOURCES_FILE)) -> dict:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        print(f"[learning] no resource list ({type(e).__name__}): plans will name resources without links")
        return {"skills": []}


def reload():
    """Read the file again (after the link check, and in tests)."""
    _load.cache_clear()


def norm_url(url: str) -> str:
    """https://Docs.Docker.com/get-started/#x -> docs.docker.com/get-started (scheme, case of the host, a trailing
    slash, query and fragment don't make it another page here)."""
    p = urlsplit((url or "").strip())
    host = p.netloc.lower().removeprefix("www.")
    return f"{host}{p.path.rstrip('/')}"


def _names(entry: dict) -> list[str]:
    return [entry["skill"], *entry.get("aliases", [])]


def _mentions(name: str, text: str) -> bool:
    # whole words only ("Java" is not in "JavaScript"; "C++" and "C#" keep their symbols)
    return re.search(rf"(?<![\w+#.]){re.escape(name.lower())}(?![\w+#])", text.lower()) is not None


def find_skills(*texts: str | None) -> list[dict]:
    """The listed skills named in these texts, in the order of the texts (the skill being learnt first)."""
    found = []
    for text in texts:
        if not text:
            continue
        for entry in _load()["skills"]:
            if entry not in found and any(_mentions(n, text) for n in _names(entry)):
                found.append(entry)
    return found[:MAX_SKILLS]


def checked(entry: dict) -> list[dict]:
    """An entry's resources whose link was opened and worked."""
    return [r for r in entry.get("resources", []) if r.get("ok") is True]


def allowed_urls() -> set[str]:
    return {norm_url(r["url"]) for e in _load()["skills"] for r in checked(e)} | set(SEARCH_PAGES)


def search_links(skill: str) -> list[str]:
    words = quote_plus(" ".join(skill.split()))         # "C#" -> "C%23", "C++" -> "C%2B%2B"
    return [f"{SEARCH_PAGES['coursera.org/search']}{words}", f"{SEARCH_PAGES['youtube.com/results']}learn+{words}"]


def context_lines(entries: list[dict]) -> list[str]:
    """For the prompt: each skill's checked resources as 'name (provider, kind, cost): url'."""
    lines = []
    for e in entries:
        res = checked(e)
        if res:
            lines.append(f"Checked resources for {e['skill']}: " + "; ".join(
                f"{r['name']} ({r['provider']}, {r['kind']}, {r['cost']}): {r['url']}" for r in res))
        else:
            lines.append(f"No checked links for {e['skill']}: name resources; you may link these searches: "
                         + " and ".join(search_links(e["skill"])))
    return lines


def search_line(skill: str) -> str:
    """For a skill that is not on the list at all."""
    return (f"No checked links for {skill}: name resources; you may link these searches (say they are search "
            f"results): " + " and ".join(search_links(skill)))


_MD_LINK = re.compile(r"\[([^\]]*)\]\(\s*<?(https?://[^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)")
_BARE = re.compile(r"https?://[^\s)<>\]\"']+")


def strip_unlisted_links(text: str) -> tuple[str, int]:
    """Remove every link that is not in the checked list: a Markdown link keeps its words, a bare URL goes.
    Returns the text and how many links were removed."""
    ok = allowed_urls()
    removed = 0
    kept: list[str] = []

    def md(m):
        nonlocal removed
        if norm_url(m.group(2)) in ok:
            kept.append(m.group(0))
            return f"\x00{len(kept) - 1}\x00"       # set aside, so the bare-link pass below leaves it alone
        removed += 1
        return m.group(1)

    out = _MD_LINK.sub(md, text or "")

    def bare(m):
        nonlocal removed
        url = m.group(0).rstrip(".,;:!?")
        if norm_url(url) in ok:
            return m.group(0)
        removed += 1
        return m.group(0)[len(url):]

    out = _BARE.sub(bare, out)
    out = re.sub(r"\(\s*\)|<\s*>", "", out)            # "( )" left where a bare link was in brackets
    out = re.sub(r" +([.,;:])(?=\s|$)", r"\1", out)   # "and ." -> "and."
    out = re.sub(r"[ \t]+(?=\n|$)", "", out)
    out = re.sub(r"\x00(\d+)\x00", lambda m: kept[int(m.group(1))], out)
    return out, removed
