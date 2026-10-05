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


def _segments(ad_text: str, include_headings: bool = False) -> list[tuple[str, str]]:
    """(section heading, sentence) for every sentence of the ad. A heading covers the list under it and
    one paragraph; a paragraph after its list, or a second paragraph, starts unheaded text.
    include_headings: also return the heading lines themselves (as their own sentence), so the extractor sees
    every line of the ad: a short line like "Python, SQL, Docker" looks like a heading but holds skills."""
    out, heading, in_list, paragraph_used = [], "", False, False
    for raw in (ad_text or "").splitlines():
        bullet = raw.lstrip().startswith(("-", "*", "\u2022", "\u00b7"))     # a list item is never a heading
        line = raw.strip(" \t-*\u2022\u00b7")
        if not line:
            continue
        inline_text = ":" in line and not line.rstrip().endswith(":")    # "Desirable: Kafka." is content
        if not bullet and not inline_text and len(line) <= _HEADING_MAX and (
                line.endswith(":") or line.isupper() or _title_like(line)):
            if include_headings:
                out.append((heading, line))
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


def locate(ad_text: str, quote: str) -> tuple[str, str] | None:
    """(section heading, sentence) the quote comes from, or None when no sentence holds it."""
    quote = max(quote_parts(quote), key=len)        # the longest part of a "..." quote locates the sentence
    best = max(((check_quote(quote, sentence)[1], heading, sentence) for heading, sentence in _segments(ad_text)),
               default=(0, "", ""))
    return (best[1], best[2]) if best[0] >= QUOTE_MATCH else None


def cue_level(ad_text: str, quote: str) -> str | None:
    """Level suggested by cue words in the quote's sentence and its heading, or None when there is no cue."""
    where = locate(ad_text, quote)
    if where is None:
        return None
    window = normalise_text(where[0] + " " + where[1])
    for level, pattern in (("trained", _TRAINED), ("preferred", _PREFERRED), ("required", _REQUIRED)):
        if pattern.search(window):
            return level
    return None


# A group of alternatives is kept only when its members quote the same words and those words offer a
# choice ("or", "such as", "e.g.", "equivalent"...). Otherwise the label is dropped and each skill counts
# on its own, which is the old (stricter) behaviour, so a wrong label can never hide a real gap silently.
_CHOICE = re.compile(r"\b(or|such as|e\.g\.?|eg|similar|equivalent|either|any of|one of)\b|/")


def check_groups(kept: list[dict]) -> int:
    """Validate alternative_group labels in place; returns how many labels were dropped.
    A group = one label + one quote: every mention of the ad arrives here (F25), so the LLM may reuse a
    label ("BI tool") for choices in two different sentences; those stay two groups, with their own labels."""
    groups: dict[tuple[str, str], list[dict]] = {}
    for item in kept:
        label = (item.get("alternative_group") or "").strip()
        item["alternative_group"] = label
        if label:
            groups.setdefault((label.lower(), normalise_text(item.get("evidence_quote", ""))), []).append(item)
    dropped, used = 0, {}
    for (label, quote), members in groups.items():
        names = {m["skill"].strip().lower() for m in members}
        if len(names) < 2 or not _CHOICE.search(quote):
            for m in members:
                m["alternative_group"] = ""
            dropped += len(members)
            continue
        used[label] = used.get(label, 0) + 1
        if used[label] > 1:                       # same label, different sentence: a separate group
            for m in members:
                m["alternative_group"] = f"{m['alternative_group']} ({used[label]})"
    return dropped


# Strongest first. Required beats unspecified (a skill named in the duties AND the requirements is required).
LEVEL_RANK = {"required": 0, "unspecified": 1, "preferred": 2, "trained": 3}


def merge_mentions(kept: list[dict], key=None) -> list[dict]:
    """One entry per skill from every checked mention (F25). key(name) -> skill identity (A8 canonical key).

    1. A group is dropped when one of its skills is also asked for on its own at the same or a stronger level
       (a duty mention never covers a nice-to-have group: duties are not asked for):
       "Python" + "Python or Java" means Python. Skills that were ONLY an alternative there (Java) go too,
       unless they have another mention, so they never become a requirement of their own (a false gap).
    2. Each skill keeps its strongest mention; at the same level a stand-alone mention beats a grouped one.
       A skill in two groups ("Python or Java" ... "Python or C#") stays in the first only: a row holds one
       group label. The other group loses it, so a Python-only student may get a false gap on "C#".
       Groups are never joined: "any of Python, Java, C#" would count a Java-only student as meeting both
       (a false "has it"); precision first, so the false gap is the accepted error (rare: count_shared_groups.py).
    3. A group left with one skill loses its label (the skill counts on its own, the stricter reading)."""
    key = key or (lambda name: name.strip().lower())

    def k(it):
        return key(it["skill"]) or it["skill"].strip().lower()

    def rank(it):
        return LEVEL_RANK.get(it.get("level"), 1)

    items = [{**it, "alternative_group": (it.get("alternative_group") or "").strip()} for it in kept]

    # 1. redundant groups
    alone = {}                                      # skill -> strongest stand-alone rank
    for it in items:
        if not it["alternative_group"]:
            alone[k(it)] = min(alone.get(k(it), 99), rank(it))
    def covers(alone_rank, group_rank):
        # A duty mention ("unspecified") is not something the ad asks for, so it never makes a nice-to-have
        # group redundant: INSPHERE "Connect equipment with MES, EAP" (duty) + "MES, EAP, SCADA, SPC or RMS
        # systems" (a plus) dropped SCADA / SPC / RMS before (5 Oct)
        return alone_rank <= group_rank and not (alone_rank == LEVEL_RANK["unspecified"]
                                                 and group_rank > LEVEL_RANK["unspecified"])

    redundant = {it["alternative_group"].lower() for it in items
                 if it["alternative_group"] and covers(alone.get(k(it), 99), rank(it))}
    items = [it for it in items if it["alternative_group"].lower() not in redundant]

    # 2. strongest mention per skill (stable: earlier mention wins a full tie)
    best: dict[str, dict] = {}
    for it in items:
        cur = best.get(k(it))
        if cur is None or (rank(it), bool(it["alternative_group"])) < (rank(cur), bool(cur["alternative_group"])):
            best[k(it)] = it
    out = list(best.values())

    # 3. one-skill groups count on their own
    sizes: dict[str, int] = {}
    for it in out:
        if it["alternative_group"]:
            sizes[it["alternative_group"].lower()] = sizes.get(it["alternative_group"].lower(), 0) + 1
    for it in out:
        if it["alternative_group"] and sizes[it["alternative_group"].lower()] < 2:
            it["alternative_group"] = ""
    return out


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
