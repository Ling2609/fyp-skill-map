"""
Four checks on a job's skills after the quote check (5 Oct; her request "make sure things go well and accurately").
Found in the first bulk run (Harumio, Motorola, Sitecore, Tenpower) and measured on the dry-run CSV + the live ads.
All four work from the quote, level and ad text alone, so they also run over jobs already saved
(scripts/pipeline/tidy_saved_job_skills.py) without calling Groq. Running them twice changes nothing.

1. names_skill    A hard skill whose quote does not name it is rejected: Harumio "Shopify API" and "Redis" quoted
                  the tag line "Next.js TypeScript React ...". The quote check (evidence.check_quote) only proves the
                  quote is in the ad, not that it is about the skill; cited text often does not support what it is
                  cited for (Liu, Zhang & Liang 2023: 74.5% of citations support their sentence). Naming it = one
                  of its words in any form ("tests" = testing), its initials ("AD" = Active Directory), or the name
                  without spaces ("App-Dynamics"). Kept lenient on purpose: it targets skills the quote never
                  mentions, not loose wording (on 52 real ads: 4 rejected, e.g. "Debugging" from "investigate
                  bugs"). Soft skills are not checked: reworded by nature and not scored.
2. duty_level     "required" from a duty becomes "unspecified": Motorola "Collaborate with front-end team" ->
                  front-end development, required. A duty is what the job does; a qualification is what the
                  person must bring (UCSB HR, "Job Description Basics"). Duty = the sentence sits under a duties
                  heading ("Responsibilities", "What you'll do"), or has no heading and starts with a task verb
                  ("Develop", "Collaborate"). Never changed when the sentence itself has requirement words
                  ("must", "required", "qualification"...) or sits under a requirements heading.
3. choice_groups  Skills listed as examples or options in one quote become one either-or group: Tenpower "one or
                  more programming languages (e.g., Python, Java, C++, C#)" came back as 4 requirements. "e.g."
                  gives examples, not a complete list (Merriam-Webster; UNC Writing Center), so the ad asks for
                  the category and any one member meets it. Only a list of named skills next to each other, joined
                  by "or", or after "e.g." / "such as" / "one or more" / "at least one" / "any of" / "either";
                  a list joined by "and" stays separate (all wanted), and a list with items we don't have is left
                  alone rather than half-grouped. The LLM's own groups are left alone.
4. merge_descriptor_names
                  The same skill named twice, once with describing words: "CI/CD" + "CI/CD pipelines",
                  "Video conferencing" + "Video conferencing equipment". Merged only when the extra words just
                  describe (DESCRIPTORS: tools, technologies, pipelines, development...), never when they name
                  something else ("React" / "React Native", "SQL" / "SQL Server", "Automation" / "Network
                  automation" stay apart): the A8 rule, merge only what is clearly the same. The stronger level
                  wins (required > unspecified > preferred > trained), with its own name and quote; on a tie the
                  shorter name. Siblings with no shared base ("Power BI Desktop" / "Power BI Service") stay apart.
"""
import re

from app.services.evidence import _PREFERRED, _TRAINED, LEVEL_RANK, locate, normalise_text
from app.services.skill_names import FILLER, GENERIC, _singular

STOP = {"and", "or", "of", "the", "in", "for", "with", "to", "a", "an", "on", "&"}
# Words that only describe a skill, never name a different one (rule 4). FILLER (skill_names) + these.
DESCRIPTORS = set(FILLER) | {
    "technology", "pipeline", "equipment", "interface", "solution",
    "application", "concept", "basic", "fundamental", "desktop", "implementation", "operation",
    "environment", "stack", "tooling", "suite", "software", "method", "methodology", "practice", "technique",
    "process", "expertise", "ability", "capability", "competency",
}

# Not "Job Description" or "About the role": ads often put duties AND requirements under one such heading
_DUTY_HEADING = re.compile(r"responsibilit|duties|\bduty\b|what you( ?'? ?ll| will) (do|be doing|work on)"
                           r"|your role|role overview|key tasks|day[ -]to[ -]day"
                           r"|job scope|scope of work|accountabilit|key result|your mission")
_REQ_HEADING = re.compile(r"requirement|qualification|looking for|who you are|about you|you have|you bring|must have"
                          r"|skills|experience|competenc|criteria|profile|nice to have|preferred|bonus|desirable"
                          r"|what we need|what you need|ideal candidate|eligib")
_REQ_WORDS = re.compile(r"\b(must|required|requirements?|essential|mandatory|minimum|at least|qualifications?"
                        r"|proficien\w*|experience (in|with)|knowledge (of|in)|familiar\w*|strong|good|solid"
                        r"|understanding of|years?)\b")
_TASK_VERBS = {
    "assist", "design", "develop", "build", "collaborate", "perform", "support", "ensure", "report", "maintain",
    "participate", "create", "implement", "monitor", "work", "partner", "troubleshoot", "manage", "configure",
    "install", "lead", "coordinate", "provide", "conduct", "deploy", "write", "review", "analyse", "analyze",
    "investigate", "continuously", "research", "evaluate", "test", "document", "prepare", "handle", "operate",
    "plan", "drive", "deliver", "own", "contribute", "liaise", "respond", "resolve", "set", "run", "improve",
    "optimise", "optimize", "upgrade", "integrate", "communicate", "help", "be", "act", "attend", "track",
}
_EXPLICIT_CHOICE = re.compile(r"\b(e\.?g\.?|eg|such as|for example|one or more|at least one|any of|one of|either)$")


# ── word helpers ──────────────────────────────────────────────────────────────────────────────────
def _words(text: str) -> list[str]:
    """Normalised words; "TCL/Python/Perl" stays one word (split again where needed)."""
    return [w.strip(".") for w in normalise_text(text).split() if w.strip(".")] if text else []


def _tokens(name: str) -> list[str]:
    """Words of a skill name, split on / and -, singular: "CI/CD pipelines" -> ci, cd, pipeline."""
    out = []
    for w in _words(name):
        out += [_singular(p) for p in re.split(r"[/-]", w) if p]
    return out


_ENDINGS = ("s", "es", "ing", "ed", "er", "ers", "ion", "ions", "ment", "ments", "js")


def _stem(w: str) -> str:
    """Crude stem for comparing two words: "tests" / "testing" -> "test", "debugging" -> "debug"."""
    for end in sorted(_ENDINGS, key=len, reverse=True):
        if w.endswith(end) and len(w) - len(end) >= 3:
            w = w[:-len(end)]
            break
    if len(w) >= 4 and w[-1] == w[-2] and w[-1] not in "aeiou":
        w = w[:-1]
    return w


def _swapped(a: str, b: str) -> bool:
    """One pair of neighbouring letters swapped: the ad's typo "MYQSL" still names MySQL."""
    if len(a) != len(b) or len(a) < 5 or a == b:
        return False
    diff = [i for i in range(len(a)) if a[i] != b[i]]
    return len(diff) == 2 and diff[1] == diff[0] + 1 and a[diff[0]] == b[diff[1]] and a[diff[1]] == b[diff[0]]


def _word_hits(token: str, word: str) -> bool:
    """Does a quote word name this token? Same word, an ending added either way ("test" ~ "testing", "debug" ~
    "debugging", "React" ~ "ReactJS"), or two long words with the same first 5 letters ("analysis" ~ "analyze"). Never "Java" ~ "JavaScript"
    or "Scala" ~ "scalable"."""
    for part in {word, *(p.strip(".") for p in re.split(r"[/-]", word) if p.strip("."))}:
        if part == token or _singular(part) == token or _swapped(part, token):
            return True
        if len(part) >= 4 and len(token) >= 4 and _stem(part) == _stem(token):
            return True
        short, long_ = sorted((part, token), key=len)
        rest = long_[len(short):]
        if len(short) >= 3 and long_.startswith(short) and (rest in _ENDINGS or (rest[:1] == short[-1] and rest[1:] in _ENDINGS)):
            return True
        if len(token) >= 6 and len(part) >= 6 and part[:5] == token[:5]:     # "analysis" ~ "analyze"
            return True
    return False


def _significant(name: str) -> list[str]:
    toks = _tokens(name)
    sig = [t for t in toks if t not in STOP and t not in FILLER and t not in GENERIC]
    return sig or [t for t in toks if t not in STOP] or toks


def _initials(name: str) -> str:
    parts = [p for p in re.split(r"[\s/-]+", normalise_text(name)) if p and p not in STOP]
    return "".join(p[0] for p in parts) if len(parts) >= 2 else ""


def _positions(name: str, words: list[str]) -> list[int]:
    """Indexes of quote words that name the skill (any significant token, or its initials)."""
    sig, ini = _significant(name), _initials(name)
    hits = [i for i, w in enumerate(words) if any(_word_hits(t, w) for t in sig)]
    if not hits and len(ini) >= 2:
        hits = [i for i, w in enumerate(words) if w in (ini, ini + "s")]
    if not hits and len(sig) == 1 and 2 <= len(sig[0]) <= 5 and sig[0].isalpha():   # "OOP" <- object-oriented programming
        abbr = sig[0]
        for i in range(len(words) - len(abbr) + 1):
            if "".join(w[0] for w in words[i:i + len(abbr)]) == abbr:
                hits = list(range(i, i + len(abbr)))
                break
    return hits


# ── rule 1 ────────────────────────────────────────────────────────────────────────────────────────
def _compact(text: str) -> str:
    return re.sub(r"[^a-z0-9+#]", "", (text or "").lower())


def names_skill(item: dict) -> bool:
    """True when the quote names the skill: one of its words (or initials), or the whole name written without
    spaces ("WebAPIs", "App-Dynamics", "In Design"). A general word is enough ("Database management" from "Perform
    database operations"): the rule is there for skills the quote does not mention at all ("Redis" quoting the
    tag line), not to second-guess the wording. Soft skills always pass (see module docstring)."""
    if item.get("type") == "soft":
        return True
    name, quote = item.get("skill", ""), item.get("evidence_quote", "")
    words = _words(quote)
    if _positions(name, words):
        return True
    general = [t for t in _tokens(name) if t not in STOP and t not in FILLER]
    if any(_word_hits(t, w) for t in general for w in words):
        return True
    c = _compact(name)
    if len(c) < 4:
        return False
    parts = [_compact(p) for p in re.split(r"[\s,/;:()]+", quote or "") if _compact(p)]
    joined = {"".join(parts[i:i + n]) for n in range(1, 5) for i in range(len(parts) - n + 1)}
    return c in joined or any(_singular(j) == c for j in joined)     # whole words only: never "Java" in "JavaScript"


def drop_unnamed(items: list[dict]) -> tuple[list[dict], list[dict]]:
    kept, rejected = [], []
    for it in items:
        (kept if names_skill(it) else rejected).append(it)
    return kept, [{**r, "reason": "quote does not name the skill"} for r in rejected]


# ── rule 2 ────────────────────────────────────────────────────────────────────────────────────────
def is_duty(ad_text: str, quote: str) -> bool:
    """The quote's sentence is a duty, not a qualification."""
    where = locate(ad_text, quote)
    if where is None:
        return False
    heading, sentence = normalise_text(where[0]), normalise_text(where[1])
    if _REQ_WORDS.search(sentence) or _REQ_HEADING.search(heading):
        return False
    if heading:
        return bool(_DUTY_HEADING.search(heading))
    first = sentence.split()[0] if sentence else ""
    return first in _TASK_VERBS


def duty_levels(items: list[dict], ad_text: str) -> int:
    """required -> unspecified for duties (in place). Returns how many were changed."""
    changed = 0
    for it in items:
        if it.get("level") == "required" and it.get("level_cue") != "required" and is_duty(ad_text, it.get("evidence_quote", "")):
            it["level"] = "unspecified"
            it["level_conflict"] = bool(it.get("level_cue") and it["level_cue"] != "unspecified")
            it["tidy"] = "required -> unspecified (a duty)"
            changed += 1
    return changed


def heading_level(ad_text: str, quote: str) -> str | None:
    """"preferred" / "trained" when the section heading above the quote says so ("Good to Have", "Preferred
    Qualifications", "What you'll learn"), else None. The heading only, not the sentence: a sentence can mix both
    ("Comfortable with writing database queries ... with an added advantage of ... AWS storage solutions")."""
    where = locate(ad_text, quote)
    heading = normalise_text(where[0]) if where else ""
    if not heading:
        return None
    if _TRAINED.search(heading):
        return "trained"
    if _PREFERRED.search(heading) or re.search(r"\b(good to have|nice to have|plus|bonus|advantage)", heading):
        return "preferred"
    return None


def cue_levels(items: list[dict], ad_text: str) -> int:
    """Rule 2b (5 Oct): "unspecified" means the LLM found no clue; when the section heading says nice to have or
    "you will learn", use that. Hytech: "Python and/or Java" under "Additional Good to Have" was saved as a duty.
    Heading only (sentence cues were wrong on mixed sentences: 6 of 28 on the saved jobs); never for "required"."""
    changed = 0
    for it in items:
        if it.get("level") != "unspecified":
            continue
        level = heading_level(ad_text, it.get("evidence_quote", ""))
        if level:
            it["level"] = level
            it["level_conflict"] = False
            it["tidy"] = f"unspecified -> {level} (the heading says so)"
            changed += 1
    return changed


# ── rule 3 ────────────────────────────────────────────────────────────────────────────────────────
def choice_groups(items: list[dict]) -> int:
    """Group skills listed as options/examples in one quote (in place). Returns how many skills were grouped."""
    by_quote: dict[tuple, list[dict]] = {}
    for it in items:
        if not (it.get("alternative_group") or "").strip() and it.get("type") == "hard":
            by_quote.setdefault(normalise_text(it.get("evidence_quote", "")), []).append(it)
    used = {(it.get("alternative_group") or "").lower() for it in items}
    grouped = 0
    for quote, members in by_quote.items():
        words = _list_words(members[0].get("evidence_quote", ""))
        spans = {}
        for m in members:
            pos = _positions(m["skill"], words)
            if pos and m["skill"].strip().lower() not in {s.lower() for s in spans}:
                start = end = min(pos)              # first place it is named (a word can recur: "Power BI ... Power Apps")
                while end + 1 in pos:
                    end += 1
                name_words = set(_tokens(m["skill"]))   # widen over the name's other words: "data analytics"
                while start > 0 and any(_word_hits(t, words[start - 1]) for t in name_words):
                    start -= 1
                while end + 1 < len(words) and any(_word_hits(t, words[end + 1]) for t in name_words):
                    end += 1
                spans[m["skill"].strip()] = (start, end, m)
        order = sorted(spans.values(), key=lambda s: s[0])
        runs, run = [], order[:1]
        for prev, cur in zip(order, order[1:]):
            gap = words[prev[1] + 1:cur[0]]
            if all(g in {",", "or", "and", "and/or", "e.g", "eg"} for g in gap) and len(gap) <= 3:
                run.append(cur)
            else:
                runs.append(run)
                run = [cur]
        runs.append(run)
        runs = [sub for run in runs for sub in _split_mixed(words, run)]
        for run in runs:
            if len(run) < 2 or not _is_choice(words, run, {sp[0] for sp in order}):
                continue
            label = "one of: " + " / ".join(s[2]["skill"].strip() for s in run)
            label = label[:80]
            while label.lower() in used:
                label += " *"
            used.add(label.lower())
            for s in run:
                for it in items:            # every mention with this skill and quote (several sentences, same words)
                    if it is s[2] or (it.get("type") == "hard" and it.get("skill", "").strip().lower() == s[2]["skill"].strip().lower()
                                      and normalise_text(it.get("evidence_quote", "")) == quote
                                      and not (it.get("alternative_group") or "").strip()):
                        it["alternative_group"] = label
                        it["tidy"] = "grouped: any one counts"
                grouped += 1
    return grouped


def _split_mixed(words: list[str], run: list[tuple]) -> list[list[tuple]]:
    """"Docker or Kubernetes and AWS" -> [Docker, Kubernetes], [AWS]: with both "or" and "and" in a list, the
    "and" separates wanted items. A list with "and" only stays whole (and is not a choice)."""
    gaps = [words[p[1] + 1:c[0]] for p, c in zip(run, run[1:])]
    if not any("or" in g or "and/or" in g for g in gaps) or not any("and" in g for g in gaps):
        return [run]
    out, cur = [], run[:1]
    for g, item in zip(gaps, run[1:]):
        if "and" in g:
            out.append(cur)
            cur = [item]
        else:
            cur.append(item)
    return out + [cur]


def _list_words(quote: str) -> list[str]:
    """Like _words, but commas stay as "," words: they show where a list goes on past the skills we have."""
    out = []
    for i, piece in enumerate((quote or "").split(",")):
        out += ([","] if i else []) + _words(piece)
    return out


_OPEN_END = ("or equivalent", "or similar", "or other", "or any", "or related", "or comparable")


def _is_choice(words: list[str], run: list[tuple], starts: set[int] = frozenset()) -> bool:
    """A choice, and the whole list: a run that is only part of a longer list ("Docker, Azure, React or vector
    databases" with Docker and Azure not among the skills) is left alone, never half-grouped."""
    gaps = [g for prev, cur in zip(run, run[1:]) for g in words[prev[1] + 1:cur[0]]]
    if "and" in gaps:
        return False                                    # "Jira and Confluence": all wanted
    before = words[max(0, run[0][0] - 5):run[0][0]]
    cue = bool(_EXPLICIT_CHOICE.search(" ".join(w for w in before if w != ",")))
    after = " ".join(w for w in words[run[-1][1] + 1:run[-1][1] + 4] if w != ",")
    open_end = after.startswith(_OPEN_END)
    if before[-1:] == [","] and not cue:
        return False                                    # the list starts earlier, with items we don't have
    if words[run[-1][1] + 1:run[-1][1] + 2] == [","] and not open_end:
        return False                                    # the list goes on after the run
    if after.startswith(("or ", "and/or ")) and not open_end:
        return False                                    # "... or Kafka" with Kafka not among the skills
    nxt = run[-1][1] + 2                                # the word after "and"
    if after.startswith("and ") and nxt not in starts:
        return False                                    # "SFC, ERP and local applications": all of them
    return "or" in gaps or "and/or" in gaps or cue or open_end


# ── rule 4 ────────────────────────────────────────────────────────────────────────────────────────
def _extends(short: str, long: str) -> bool:
    """long = short + describing words at the end: "CI/CD" -> "CI/CD pipelines", "Power BI" -> "Power BI Desktop".
    Only at the end: a word in front names a field of its own ("Application security", "Computer vision")."""
    a = [t for t in _tokens(short) if t not in STOP]
    b = [t for t in _tokens(long) if t not in STOP]
    if not a or len(a) >= len(b) or all(t in DESCRIPTORS for t in a) or b[:len(a)] != a:
        return False
    return all(t in DESCRIPTORS for t in b[len(a):])


def merge_descriptor_names(kept: list[dict]) -> tuple[list[dict], list[tuple[str, str]]]:
    """One entry per skill named with and without describing words. Returns (kept, [(dropped, kept name)]).
    The entry is named by the plain name ("Power BI"), with the level, quote and type of its strongest mention;
    names with no plain one between them ("Power BI Desktop" / "Power BI Service") stay apart."""
    def free(it):
        return not (it.get("alternative_group") or "").strip()

    owner: dict[int, int] = {}                        # index of a longer name -> index of its plain name
    for j, long_ in enumerate(kept):
        bases = [i for i, short in enumerate(kept) if i != j and free(short) and free(long_)
                 and short.get("type") == long_.get("type") and _extends(short.get("skill", ""), long_.get("skill", ""))]
        if bases:
            owner[j] = min(bases, key=lambda i: (len(_tokens(kept[i]["skill"])), i))
    while any(owner.get(b) is not None for b in owner.values()):     # chains: A <- A tools <- A tools platform
        owner = {j: (owner.get(b, b) if owner.get(b) is not None else b) for j, b in owner.items()}
    out, merged = [], []
    for i, it in enumerate(kept):
        if i in owner:
            continue
        group = [i] + [j for j, b in owner.items() if b == i]
        if len(group) == 1:
            out.append(it)
            continue
        best = min(group, key=lambda g: (LEVEL_RANK.get(kept[g].get("level"), 1), g != i, g))
        entry = {**kept[best], "skill": it["skill"]}
        others = [kept[g]["skill"] for g in group if g != i]
        entry["tidy"] = "same skill as " + ", ".join(others)
        merged += [(o, it["skill"]) for o in others]
        out.append(entry)
    return out, merged
