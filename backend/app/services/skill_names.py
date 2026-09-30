"""
When are two skill names obviously the same skill? (roadmap A8, layer 1: rules)

The LLM names skills freely, so one skill appears under several spellings. skill_key() turns
a name into a comparison key; names with the same key are the same skill:

  "Power BI" = "PowerBI" = "power-bi"               case, dash / underscore / space
  "Microservices" = "Microservice"                  plural
  "React JS" = "React.js" = "ReactJS" = "React"     ".js" / "JS" suffix
  "Docker containers" ≠ "Docker"                    (not a rule: left to layer 2)
  "Python programming" = "Python"                   filler words that say how, not what
  "Microsoft Excel" = "Excel"                       vendor prefix, only for listed products

Rules only merge what is clearly the same; anything doubtful keeps its own name. A generic
remainder ("Software development" -> "software") is never produced: filler words are only
dropped when a specific word is left.
"""
import re

# Words that describe how a skill is used, not which skill it is
FILLER = {
    "programming", "development", "developing", "language", "languages", "skill", "skills",
    "knowledge", "usage", "understanding", "experience", "proficiency", "basics", "fundamentals",
    "concepts", "principles", "framework", "frameworks", "library", "libraries", "tool", "tools",
}
# Too general to stand alone once filler words are dropped ("Software development" stays as is)
GENERIC = {
    "software", "web", "application", "applications", "app", "apps", "business", "game", "games",
    "product", "mobile", "system", "systems", "data", "solution", "solutions", "front", "back",
    "full", "stack", "api", "apis", "database", "network", "cloud", "it", "ict",
}
# Vendor prefix dropped only for these products: "Microsoft Excel" = "Excel", "Apache Kafka" = "Kafka".
# Never in general: "Microsoft Project", "Microsoft Teams", "Microsoft Word" are not "project", "teams", "word"
VENDOR_PRODUCTS = {
    "microsoft": {"excel", "powerbi", "azure", "sqlserver", "sharepoint", "powerpoint", "visio", "outlook", "intune"},
    "apache": {"kafka", "spark", "hadoop", "airflow", "tomcat", "maven", "cassandra", "flink", "nifi", "hive", "jmeter"},
}


def _singular(word: str) -> str:
    # "services" -> "service", "APIs" -> "api", "methodologies" -> "methodology";
    # leaves "business", "status", "analysis", "ios", "aws" alone
    if len(word) <= 3 or not word.endswith("s") or word.endswith(("ss", "us", "ws")):
        return word
    if word.endswith("ies") and len(word) > 5:
        return word[:-3] + "y"
    if word.endswith("is") and len(word) > 4:      # "analysis", "basis" (but "apis", "kpis", "guis" are plurals)
        return word
    return word[:-1]


def skill_key(name: str) -> str:
    """Comparison key for a skill name. Same key = obviously the same skill."""
    t = (name or "").lower().replace(".js", " js")
    t = re.sub(r"[^\w\s+#.]", " ", t).replace("_", " ")       # dashes, slashes, brackets -> space
    words = [w.strip(".") for w in t.split() if w.strip(".")]
    if len(words) > 1 and "".join(words[1:]) in VENDOR_PRODUCTS.get(words[0], ()):
        words = words[1:]
    if len(words) > 1 and words[-1] == "js":
        words = words[:-1]
    words = [w[:-2] if len(w) > 4 and w.endswith("js") else w for w in words]   # "ReactJS", "NodeJS"
    kept = [w for w in words if w not in FILLER]
    if kept and kept != words and not all(w in GENERIC for w in kept):
        words = kept
    return "".join(_singular(w) for w in words)                # no spaces: "power bi" = "powerbi"
