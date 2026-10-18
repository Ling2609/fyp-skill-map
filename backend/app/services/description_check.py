"""
Is a tidied job description still the advert? (18 Oct, her finding: an employer post whose description was only
"test ttttt..." was shown on Job Detail as a full invented ad: responsibilities, a Master's degree, dental insurance,
on-call duty. Gemini had been told it was "REWRITING, not copying" and nothing checked its answer.)

The check is deliberately simple and needs no model: a bullet is grounded when most of its content words (3+
letters, not common words) also appear in the original advert. Matching uses each word's first 5 letters as a
substring of the advert, so a fixed run-together word ("teamworkand") or another ending (manage / managing) still
counts. Headers ("## Requirements") are not checked. An answer with any bullet below GROUNDED_SHARE is rejected
whole (the page then shows the advert's own text): one invented line is enough to mislead a student.
"""
import re

GROUNDED_SHARE = 0.6        # share of a bullet's content words that must be found in the advert
STEM = 5                    # compare the first 5 letters
STOPWORDS = set("""
the and for with you your our are will this that from into have has can our all any its their they them who what
when where which while within also such well able more most other each both than then there these those about
across after before over under using use used work working job role team teams company include including etc per
must should would could may might shall very good strong excellent new one two via other others based
""".split())


def _content_words(text: str) -> list[str]:
    return [w for w in re.findall(r"[a-z][a-z0-9+#.]*", text.lower()) if len(w) >= 3 and w not in STOPWORDS]


def grounded_share(bullet: str, source: str) -> float:
    words = _content_words(bullet)
    if not words:
        return 1.0
    src = re.sub(r"\s+", " ", source.lower())
    squashed = src.replace(" ", "")          # run-together words in scraped ads
    found = sum(1 for w in words if w[:STEM] in src or w[:STEM] in squashed)
    return found / len(words)


def ungrounded(bullets: list[str], source: str) -> list[tuple[str, float]]:
    """The bullets whose words are mostly not in the advert, with their share (empty = the answer is grounded)."""
    out = []
    for b in bullets:
        if b.startswith("## "):
            continue
        share = grounded_share(b, source)
        if share < GROUNDED_SHARE:
            out.append((b, round(share, 2)))
    return out
