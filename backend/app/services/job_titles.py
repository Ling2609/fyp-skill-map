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
    r"|security\s+(analyst|engineer|operations)|incident\s+response|threat|siem|automated\s+testing|test\s+automation)(?!\w)",
    re.IGNORECASE,
)
ICT_TITLE_ACRONYMS = re.compile(r"\b(IT|ICT|AI|ML|QA|UI|UX|SAP|SRE|DBA|BI|SOC|API)\b")   # case-sensitive: "IT", not "it"
# Product names found even when glued to the next word, as in real saved titles
# "ServiceNowBusiness Analyst" and "Support Engineer Lead(AzureMandarin)"
ICT_TITLE_PRODUCTS = re.compile(r"servicenow|azure|vmware|kubernetes|salesforce", re.IGNORECASE)


def is_ict_title(title: str) -> bool:
    title = title or ""
    return bool(ICT_TITLE_WORDS.search(title) or ICT_TITLE_ACRONYMS.search(title)
                or ICT_TITLE_PRODUCTS.search(title))
