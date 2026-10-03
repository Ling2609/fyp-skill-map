"""
Typed job search: how well a job matches what the student typed (3 Oct).

Search ranks by relevance first, then by fit: LinkedIn retrieves jobs that match the query and only then re-ranks
them (references.md, "Search vs recommendation"). Before, a typed query only nudged the best-fit score, so the
job searched for could come 9th. Students search by job title, company ("Celestica") or place ("Penang"), so all
three fields count. Whole words only ("it" must not match "with", "java" must not match "javascript"); a plural s
is ignored.

  3  the whole query appears as a phrase in the title, the company or the location
  2  every query word appears somewhere in title + company + location ("software engineer penang")
  1  some query word (3+ letters) appears in them
  0  none
"""
import re

EXACT, ALL_WORDS, SOME_WORDS, NONE = 3, 2, 1, 0


def _words(text: str) -> list[str]:
    words = re.findall(r"[a-z0-9+#.]+", (text or "").lower())
    return [w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w for w in words]


def search_match(query: str, title: str, company: str = "", location: str = "") -> int:
    q = _words(query)
    if not q:
        return NONE
    fields = [_words(title), _words(company), _words(location)]
    phrase = f" {' '.join(q)} "
    if any(phrase in f" {' '.join(f)} " for f in fields):     # padded, so only whole words match
        return EXACT
    found = set().union(*map(set, fields))
    if all(w in found for w in q):
        return ALL_WORDS
    if any(w in found for w in q if len(w) >= 3):
        return SOME_WORDS
    return NONE
