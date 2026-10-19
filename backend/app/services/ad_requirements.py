"""
What a job ad asks for besides skills (19 Oct; her decision "must", references.md "Decision: Other requirements"):
qualification level, field of study, spoken languages, a citizenship / work-pass line, and a salary written in the ad
text when the job has no salary field. Read by fixed rules (no AI call), so they are fast, free and repeatable.

Display only: nothing here changes a job's rank or its match %, so the step 4 ranking result still describes the app.
Every answer keeps the ad's own words (`quote`) so the student can check it. Accuracy is measured on 30 live ads the
rules were not written on (scripts/evaluation/evaluate_ad_requirements.py; the step 4 ads are left out of that sample).
"""
import re

LEVELS = ["diploma", "bachelor", "master", "phd"]          # lowest to highest
LEVEL_NAMES = {"diploma": "Diploma", "bachelor": "Bachelor's degree", "master": "Master's degree", "phd": "PhD"}
_LEVEL_RX = {
    "diploma": r"\bdiplomas?\b",
    # after E6 (19 Oct, not re-measured): "B.S" (A22) and "University / University of Applied Sciences" (A20)
    "bachelor": r"\b(bachelor'?s?|bachelors|b\.?\s?sc|b\.\s?s\b\.?|b\.?\s?eng|b\.?\s?tech|undergraduate degree|degree|"
                r"university\s*(?:degree|graduate|qualification|/)|university\s+or\s+equivalent)",
    "master": r"\b(master'?s|masters|master degree|master of|m\.?\s?sc|mba|postgraduate)\b",
    "phd": r"\b(ph\.?\s?d|doctorate|doctoral)\b",
}
# words that look like a degree but are not one (Scrum Master, master data, MSC Status company, "to a degree")
_NOT_DEGREE = r"(scrum\s+master|master\s+data|master\s+file|msc\s+status|to\s+a\s+(certain|large|high)?\s*degree|360[- ]degree|degree\s+of\s+(autonomy|flexibility|independence|accuracy|precision))"

LANGUAGES = {
    "English": r"\benglish\b",
    "Malay": r"\b(malay|bahasa\s+(malaysia|melayu)|bm)\b",
    "Mandarin": r"\b(mandarin|chinese)\b",
    "Cantonese": r"\bcantonese\b",
    "Tamil": r"\btamil\b",
    "Japanese": r"\bjapanese\b",
    "Korean": r"\bkorean\b",
    "Thai": r"\bthai\b",
    "Vietnamese": r"\bvietnamese\b",
    "Indonesian": r"\b(indonesian|bahasa\s+indonesia)\b",
}
# a language counts only in a sentence about speaking/writing it, not "Chinese New Year" or "English-speaking clients"
_LANG_CONTEXT = r"(speak|spoken|speaker|writ|read|fluen|proficien|command|language|communicat|conversant|bilingual|multilingual|native|verbal|oral|capabilit)"
# "capabilit" added after E6 (19 Oct, not re-measured): "Chinese capability is advantageous" (A25)

_CITIZEN = (r"(malaysians?\s+(citizens?\s+)?only|only\s+malaysians?|malaysian\s+citizens?|citizens?\s+only|"
            r"singapore(an)?\s+(citizens?|pr)\b|singaporeans?\s+only|permanent\s+residen(t|ce)|\bpr\s+(holder|only)|"
            r"right\s+to\s+work|work(ing)?\s+(permit|pass|visa)|employment\s+pass|no\s+visa\s+sponsorship|"
            r"(do\s+not|does\s+not|unable\s+to|cannot|won'?t)\s+(provide\s+|offer\s+)?(visa\s+)?sponsor)")

_MONEY = r"(?:rm|myr|sgd|s\$|usd|us\$|\$)\s?\d[\d,]*(?:\.\d+)?\s?(?:k\b)?"
_SALARY_CONTEXT = r"(salary|pay|remuneration|compensation|per\s+month|/\s?month|monthly|per\s+annum|p\.?a\.?|basic|allowance|stipend)"


def _sentences(text: str) -> list[str]:
    """Ads mix full stops, bullets and run-on lines: split on all of them."""
    parts = re.split(r"(?<=[.!?;])\s+|\n+|\s{2,}|•|·|•|(?<=\w)\s[-–]\s(?=[A-Z])(?!RM|MYR|SGD|USD|S\$)", text or "")
    return [p.strip() for p in parts if p and p.strip()]


def qualification(text: str) -> dict | None:
    """The LOWEST qualification the ad accepts, with the sentence it came from. "Bachelor's or Master's" = bachelor;
    "Master's or above" = master; "Diploma/Degree" = diploma. None when the ad names no qualification."""
    best = None
    for s in _sentences(text):
        low = re.sub(_NOT_DEGREE, " ", s.lower())
        # "Master's degree" / "doctoral degree" is not also a bachelor's "degree"
        low = re.sub(r"\b(master'?s?|masters|doctoral|doctorate|postgraduate|ph\.?\s?d)\s+degrees?\b", r"\1", low)
        found = [lvl for lvl in LEVELS if re.search(_LEVEL_RX[lvl], low)]
        if not found:
            continue
        lvl = found[0]                                    # the lowest level named in this sentence
        if best is None or LEVELS.index(lvl) < LEVELS.index(best["level"]):
            best = {"level": lvl, "name": LEVEL_NAMES[lvl], "quote": s[:200]}
    return best


_FIELD_RX = re.compile(r"(?:\b(?:degree|diploma|bachelor'?s?|master'?s?|graduate|qualification|major(?:ing)?|studies)\b|\bb\.\s?s\b\.?)"
                       r"[^.;•\n]{0,30}?\b(?:in|of)\s+([A-Za-z][^.;•\n()]{2,120})", re.I)


def field(text: str) -> dict | None:
    """The field(s) of study the ad names after "degree in / of ...", cut at the end of the phrase."""
    for s in _sentences(text):
        m = _FIELD_RX.search(re.sub(_NOT_DEGREE, " ", s, flags=re.I))
        if not m:
            continue
        f = re.split(r"\b(?:with|and\s+(?:at\s+least|minimum|\d)|preferably\s+with|having|who|from\s+a|is\s+|are\s+|will\s+|"
                     r"education|qualifications?|experience|skills|requirements?|responsibilities)\b",
                     m.group(1), maxsplit=1, flags=re.I)[0].strip(" ,:-")
        f = re.sub(r"\s+", " ", f)
        if len(f) >= 3 and not re.match(r"(?i)(the|a|an|this|our|your)\b", f):
            return {"field": f[:100], "quote": s[:200]}
    return None


def languages(text: str) -> dict | None:
    """Spoken/written languages the ad asks for, each found in a sentence about language use."""
    found, quotes = [], []
    for s in _sentences(text):
        low = s.lower()
        if not re.search(_LANG_CONTEXT, low):
            continue
        hits = [name for name, rx in LANGUAGES.items() if re.search(rx, low)]
        if "Malay" in hits and re.search(r"\bbm\b", low) and not re.search(r"\b(malay|bahasa)", low) and "english" not in low:
            hits.remove("Malay")                          # "BM" alone is too ambiguous
        for h in hits:
            if h not in found:
                found.append(h)
        if hits:
            quotes.append(s[:200])
    return {"languages": found, "quote": " … ".join(quotes[:2])} if found else None


def citizenship(text: str) -> dict | None:
    """The ad's own line about citizenship, permanent residence or a work pass (shown as information only: SkillMap
    never asks a student's citizenship; references.md "Citizenship / work permit")."""
    for s in _sentences(text):
        if re.search(_CITIZEN, s, re.I):
            return {"quote": s[:200]}
    return None


def salary_in_ad(text: str) -> dict | None:
    """A salary amount written in the ad text, e.g. "RM 2,800 - RM 3,200" right after "salary", "pay" or "per month".
    Read on the whole text (not per sentence): scraped ads often split a range over spaces ("RM 2800   RM 3200")."""
    flat = re.sub(r"\s+", " ", text or "")
    for ctx in re.finditer(_SALARY_CONTEXT, flat, re.I):
        window = flat[max(0, ctx.start() - 40): ctx.end() + 80]
        amounts = list(re.finditer(_MONEY, window, re.I))
        amounts = [m for m in amounts if re.search(r"\d{3,}|\d[\d,]*\s?k\b", m.group(0), re.I)]   # "RM 5" is no salary
        if not amounts:
            continue
        first = amounts[0]
        amount = first.group(0).strip()
        rest = window[first.end():]
        m2 = re.match(r"\s*(?:-|–|to|~)?\s*((?:rm|myr|sgd|s\$|usd|us\$|\$)?\s?\d[\d,]*(?:\.\d+)?\s?(?:k\b)?)", rest, re.I)
        if m2 and re.search(r"\d{3,}|\d+\s?k\b", m2.group(1), re.I):
            amount = f"{amount} – {m2.group(1).strip()}"
        start = max(0, first.start() - 40)
        quote = window[start: first.end() + 40].strip()
        # per year or per month, so the page can also show a yearly amount per month (19 Oct)
        period = ("year" if re.search(r"annual|annum|yearly|per\s+year|a\s+year|p\.\s?a\.", quote, re.I)
                  else "month" if re.search(r"month", quote, re.I) else None)
        return {"salary": re.sub(r"\s+", " ", amount), "period": period, "quote": quote}
    return None


def shown(text: str, salary_field: str | None = None) -> dict:
    """What Job Detail shows (19 Oct, E6 result): qualification, field, languages and salary passed; citizenship is
    left out (it found 0 of the 2 real cases, references.md "E6 RESULT"). Display only: no effect on rank or %."""
    r = read_ad(text, salary_field)
    r.pop("citizenship")
    return r


def read_ad(text: str, salary_field: str | None = None) -> dict:
    """Everything above for one ad. The salary is read from the text only when the job has no salary field."""
    has_salary = bool(salary_field and str(salary_field).strip().lower() not in ("", "nan", "none"))
    return {"qualification": qualification(text), "field": field(text), "languages": languages(text),
            "citizenship": citizenship(text), "salary": None if has_salary else salary_in_ad(text)}
