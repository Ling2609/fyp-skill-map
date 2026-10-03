"""
What a job title tells us: its level (A7, F10) and whether it is an ICT job.

One place for both rules, like job_keys.py for duplicates:
  - app/routers/recommend.py         shows the level and ranks senior roles lower
  - scripts/live_jobs/fetch_live_jobs.py      skips non-ICT titles before Groq
  - scripts/live_jobs/generate_live_queries.py builds search queries from ICT titles
"""
import re

# Job level from the title (roadmap A7 + F10). Checked from the MOST senior level down, so
# "Senior Associate" is senior and "Senior Manager" is manager, not entry level.
# Titles are only a hint (many "junior" postings still ask for years of experience), so the
# level is shown on each card and senior roles are ranked lower; nothing is hidden.
SENIORITY_PATTERNS = {
    "manager": r"\b(manager|director|head\s+of|vp|chief)\b",
    "lead":    r"\b(lead|principal|staff|architect)\b",
    "senior":  r"\b(senior|sr\.?)\b",
    "junior":  r"\b(junior|jr\.?|entry.?level|fresh\s+grad(uate)?s?|graduate|interns?|internships?|trainees?|associate)\b",
}

SENIORITY_RANK = {"junior": 0, "unspecified": 1, "senior": 2, "lead": 3, "manager": 4}


def classify_seniority(title: str) -> str:
    t = (title or "").lower()
    for level, pattern in SENIORITY_PATTERNS.items():
        if re.search(pattern, t):
            return level
    return "unspecified"


# A job is kept only if its title names an ICT role. Broad queries ("IT intern", "fresh graduate IT")
# also return electrical, finance or HR jobs; they'd be stored under the query's ICT subcategory
# and cost Groq tokens. Plain "engineer" isn't enough on its own ("Electrical Engineer"),
# so the title needs an ICT word such as software, network, data or developer.
ICT_TITLE_WORDS = re.compile(
    r"\b(software|developer|programmer|programming|data|database|network(ing)?|cloud|devops|cyber\s?security|cyber"
    r"|information\s+(technology|security)|systems?\s+(engineer|administrator|admin|analyst)"
    r"|machine\s+learning|artificial\s+intelligence|technical\s+support|it\s+support|help\s?desk"
    r"|desktop\s+support|application\s+support|web|mobile\s+app|android|ios|full.?stack|tester"
    r"|test\s+engineer|quality\s+assurance|ui\s?/\s?ux|scrum\s+master|solutions?\s+architect"
    r"|site\s+reliability|infrastructure|erp|blockchain|business\s+analyst|information\s+systems?"
    # roles named by their technology (seen in real results: "Backend Engineer", "Senior Linux Administrator")
    r"|back.?end|front.?end|react(\.js)?|php|java|python|\.net|dotnet|flutter|kotlin|linux|vmware|azure|aws"
    r"|ci\s?/\s?cd|analytics|servicenow|systems?\s+development|mobile\s+(engineer|developer)|uiux|ui\s+ux"
    r"|security\s+(analyst|engineer|operations)|incident\s+response|threat|siem|automated\s+testing|test\s+automation"
    # added after the 29 Sep generated-query dry run ("Service Desk Specialist", "Senior Firewall Engineer"…)
    r"|service\s+desk|firewall|enterprise\s+resources?\s+planning|tech\s+support|agile|scrum|product\s+owner"
    r")s?(?!\w)",   # s?: plurals too ("System Engineers", "Developers")
    re.IGNORECASE,
)
ICT_TITLE_ACRONYMS = re.compile(r"\b(IT|ICT|AI|ML|QA|UI|UX|SAP|SRE|DBA|BI|SOC|API)\b")   # case-sensitive: "IT", not "it"
# Product names found even when glued to the next word, as in real saved titles
# "ServiceNowBusiness Analyst" and "Support Engineer Lead(AzureMandarin)"
ICT_TITLE_PRODUCTS = re.compile(r"servicenow|azure|vmware|kubernetes|salesforce", re.IGNORECASE)


# "System engineer" and "data center" also appear in electrical and mechanical jobs
# ("Senior Power Systems Engineer (Data Center)", "Mechanical (Rotary) System Engineer").
# Those are skipped unless the title also names software work.
NON_ICT_ENGINEERING = re.compile(r"\b(electrical|mechanical|civil|chemical|power\s+systems?|rotary|hvac)\b", re.IGNORECASE)
SOFTWARE_WORDS = re.compile(r"\b(software|developer|programmer|programming)\b", re.IGNORECASE)


def is_ict_title(title: str) -> bool:
    title = title or ""
    if NON_ICT_ENGINEERING.search(title) and not SOFTWARE_WORDS.search(title):
        return False
    return bool(ICT_TITLE_WORDS.search(title) or ICT_TITLE_ACRONYMS.search(title)
                or ICT_TITLE_PRODUCTS.search(title))


# ── Typed search: how well a job title matches the query (3 Oct) ───────────────
# Search ranks by relevance first, then by fit (LinkedIn: retrieve by the query, re-rank the matches;
# references.md "Search vs recommendation"). Before, the query only nudged the best-fit score, so the exact job
# searched for could come 9th. Whole words only ("it" must not match "with"); a plural s is ignored.
TITLE_EXACT, TITLE_ALL_WORDS, TITLE_SOME_WORDS, TITLE_NONE = 3, 2, 1, 0


def _title_words(text: str) -> list[str]:
    words = re.findall(r"[a-z0-9+#.]+", text.lower())
    return [w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w for w in words]


def title_match(title: str, query: str) -> int:
    """3 = the query appears as a phrase in the title, 2 = every query word is in the title,
    1 = some query word (3+ letters) is in the title, 0 = none."""
    q, t = _title_words(query), _title_words(title)
    if not q:
        return TITLE_NONE
    if f" {' '.join(q)} " in f" {' '.join(t)} ":        # padded: "java" must not match "javascript"
        return TITLE_EXACT
    tw = set(t)
    if all(w in tw for w in q):
        return TITLE_ALL_WORDS
    if any(w in tw for w in q if len(w) >= 3):
        return TITLE_SOME_WORDS
    return TITLE_NONE
