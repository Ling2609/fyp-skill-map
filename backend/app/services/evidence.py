"""
Evidence check for extracted skills (fix plan, Stage 1).

Every job skill the LLM returns must come with a quote from the ad. check_quote() confirms the quote is
really in the ad text, so a skill with no supporting words (e.g. "Troubleshooting" in an ad that never
mentions it) is rejected. Small differences are tolerated: LLMs tend to tidy text when quoting (case,
punctuation, a changed word; Nguyen et al. 2024), so the match is fuzzy, not exact.

cue_level() reads cue words in the quote's sentence and section heading ("preferred", "you will learn", "must"...) as an independent
check on the level the LLM gave. A disagreement is flagged, not overridden: the rate is measured.
"""
import re
from difflib import SequenceMatcher

QUOTE_MATCH = 0.85       # share of the quote that must match a stretch of the ad (1.0 = exact)
MIN_QUOTE_CHARS = 3      # "C", "R" alone are too short to prove anything

_QUOTES = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-",
                         "•": " ", " ": " "})


def normalise_text(text: str) -> str:
    """Lower case, plain quotes and dashes, one space between words; keeps C++, C#, .NET, Node.js."""
    t = (text or "").translate(_QUOTES).lower()
    t = re.sub(r"[^\w\s+#./-]", " ", t)
    return " ".join(t.split())


def quote_parts(quote: str) -> list[str]:
    """Split a quote on an ellipsis ("Strong skills in ... Splunk"): each part must be in the ad on its own."""
    parts = [p.strip() for p in re.split(r"\.{3,}|…", quote or "")]
    return [p for p in parts if len(normalise_text(p)) >= MIN_QUOTE_CHARS] or [quote or ""]


def check_quote(quote: str, ad_text: str) -> tuple[bool, float, int]:
    """Is the quote in the ad? Returns (found, match score 0-1, position in the normalised ad or -1).
    A quote with "..." passes only if every part is in the ad; its score is the weakest part's."""
    parts = quote_parts(quote)
    if len(parts) > 1:
        results = [_check_one(p, ad_text) for p in parts]
        weakest = min(results, key=lambda r: r[1])
        return all(r[0] for r in results), weakest[1], results[0][2]
    return _check_one(parts[0], ad_text)


def _check_one(quote: str, ad_text: str) -> tuple[bool, float, int]:
    q, ad = normalise_text(quote), normalise_text(ad_text)
    if len(q) < MIN_QUOTE_CHARS or not ad:
        return False, 0.0, -1
    pos = ad.find(q)
    if pos >= 0:
        return True, 1.0, pos
    # Fuzzy: anchor on the longest shared stretch, then compare a window of the quote's length
    m = SequenceMatcher(None, ad, q, autojunk=False).find_longest_match(0, len(ad), 0, len(q))
    if m.size == 0:
        return False, 0.0, -1
    start = max(0, m.a - m.b)
    score = SequenceMatcher(None, ad[start:start + len(q)], q, autojunk=False).ratio()
    return score >= QUOTE_MATCH, round(score, 3), start


# Cue words, read from the quote's own sentence plus the section heading above it ("Requirements",
# "Preferred qualifications", "What you'll learn"). Never from neighbouring sentences: a fixed-size window
# picked up "learning and development phase" from the sentence before a required skill.
_TRAINED = re.compile(r"\b(you will (learn|be trained|gain|develop)|will be (trained|taught)|training (will be )?provided"
                      r"|on[- ]the[- ]job training|learning (and development )?(phase|programme|program|pathway)"
                      r"|we will (teach|train)|opportunity to learn|what you( wi| )?ll learn)\b")
_PREFERRED = re.compile(r"\b(preferred|preferably|nice[- ]to[- ]have|good[- ]to[- ]have|an? (added )?advantage|advantageous"
                        r"|is a (plus|bonus)|desirable|ideally|bonus)\b")
_REQUIRED = re.compile(r"\b(must|required|requirements?|essential|mandatory|minimum|at least|qualifications?)\b")
_HEADING_MAX = 60        # a short line on its own (or ending in ":") is treated as a section heading


def _title_like(line: str) -> bool:
    """Short line with (nearly) every word capitalised: "What You'll Learn", "Nice to Have"."""
    words = line.split()
    return len(words) <= 6 and sum(w[0].isupper() for w in words) >= max(1, len(words) - 1)


def _segments(ad_text: str) -> list[tuple[str, str]]:
    """(section heading, sentence) for every sentence of the ad. A heading covers the list under it and
    one paragraph; a paragraph after its list, or a second paragraph, starts unheaded text."""
    out, heading, in_list, paragraph_used = [], "", False, False
    for raw in (ad_text or "").splitlines():
        bullet = raw.lstrip().startswith(("-", "*", "\u2022", "\u00b7"))     # a list item is never a heading
        line = raw.strip(" \t-*\u2022\u00b7")
        if not line:
            continue
        if not bullet and len(line) <= _HEADING_MAX and (
                line.endswith(":") or line.isupper() or _title_like(line)):
            heading, in_list, paragraph_used = line, False, False
            continue
        if bullet:
            in_list = True
        else:
            if in_list or paragraph_used:
                heading, in_list = "", False
            paragraph_used = True
        out += [(heading, s) for s in re.split(r"(?<=[.!?])\s+", line) if s]
    return out


def cue_level(ad_text: str, quote: str) -> str | None:
    """Level suggested by cue words in the quote's sentence and its heading, or None when there is no cue."""
    quote = max(quote_parts(quote), key=len)        # the longest part of a "..." quote locates the sentence
    best = max(((check_quote(quote, sentence)[1], heading, sentence) for heading, sentence in _segments(ad_text)),
               default=(0, "", ""))
    if best[0] < QUOTE_MATCH:
        return None
    window = normalise_text(best[1] + " " + best[2])
    for level, pattern in (("trained", _TRAINED), ("preferred", _PREFERRED), ("required", _REQUIRED)):
        if pattern.search(window):
            return level
    return None


# A group of alternatives is kept only when its members quote the same words and those words offer a
# choice ("or", "such as", "e.g.", "equivalent"...). Otherwise the label is dropped and each skill counts
# on its own, which is the old (stricter) behaviour, so a wrong label can never hide a real gap silently.
_CHOICE = re.compile(r"\b(or|such as|e\.g\.?|eg|similar|equivalent|either|any of|one of)\b|/")


def check_groups(kept: list[dict]) -> int:
    """Validate alternative_group labels in place; returns how many labels were dropped."""
    groups: dict[str, list[dict]] = {}
    for item in kept:
        label = (item.get("alternative_group") or "").strip()
        item["alternative_group"] = label
        if label:
            groups.setdefault(label.lower(), []).append(item)
    dropped = 0
    for members in groups.values():
        quotes = {normalise_text(m.get("evidence_quote", "")) for m in members}
        if len(members) < 2 or len(quotes) != 1 or not _CHOICE.search(next(iter(quotes))):
            for m in members:
                m["alternative_group"] = ""
            dropped += len(members)
    return dropped


def verify_skills(items: list[dict], ad_text: str) -> tuple[list[dict], list[dict]]:
    """Split the LLM's skills into (kept, rejected). Each kept item gets match_score and level_cue;
    level_conflict marks items whose cue words suggest a different level than the LLM gave."""
    kept, rejected = [], []
    for item in items:
        quote = item.get("evidence_quote", "")
        found, score, _ = check_quote(quote, ad_text)
        item = {**item, "match_score": score}
        if not found:
            rejected.append({**item, "reason": "quote not in ad" if quote else "no quote"})
            continue
        cue = cue_level(ad_text, quote)
        item["level_cue"] = cue
        item["level_conflict"] = bool(cue and cue != item.get("level"))
        kept.append(item)
    check_groups(kept)
    return kept, rejected
