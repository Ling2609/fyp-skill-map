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
import json
import re
from pathlib import Path

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
    words = [w[:-2] if len(w) > 4 and w.endswith("js") else w for w in words]   # "ReactJS", "NodeJS"
    kept = [w for w in words if w not in FILLER]
    if kept and kept != words and not all(w in GENERIC for w in kept):
        words = kept
    if len(words) > 1 and words[-1] == "js":                   # after filler words: "Node.js Development" = "Node.js"
        words = words[:-1]
    return "".join(_singular(w) for w in words)                # no spaces: "power bi" = "powerbi"


# ── Layer 2: merges checked by the LLM (scripts/pipeline/decide_skill_merges.py) ──────────────────
# A pair is merged only if both LLM checks said "same" (blind test: 49 of 50 correct). Groups are never
# joined if any pair between them was judged not the same, so contradictory answers can't chain merges.
# data/skill_merge_overrides.json holds human decisions and wins over the LLM:
#   {"same": [["Docker", "Docker containers"]], "different": [["Provisioning Services", "Service Provisioning"]]}
DATA_DIR = Path(__file__).resolve().parents[2] / "data"      # backend/data, wherever the app is started from
MERGES_FILE = DATA_DIR / "skill_merges.json"
OVERRIDES_FILE = DATA_DIR / "skill_merge_overrides.json"
_canonical: dict[str, str] | None = None


def _load_json(path: Path) -> dict:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}          # no file (e.g. a fresh clone): rules only


def _build_canonical() -> dict[str, str]:
    merged, blocked = [], set()
    for v in _load_json(MERGES_FILE).get("pairs", {}).values():
        a, b = skill_key(v["a"]), skill_key(v["b"])   # recomputed, so rule fixes apply to old answers too
        if a == b:
            continue
        if v.get("same") and v.get("verified"):
            merged.append((v.get("similarity", 0), a, b))
        else:
            blocked.add(frozenset((a, b)))
    overrides = _load_json(OVERRIDES_FILE)
    for a, b in overrides.get("different", []):
        pair = frozenset((skill_key(a), skill_key(b)))
        blocked.add(pair)
        merged = [m for m in merged if frozenset(m[1:]) != pair]
    for a, b in overrides.get("same", []):
        pair = frozenset((skill_key(a), skill_key(b)))
        blocked.discard(pair)
        merged.append((2.0, skill_key(a), skill_key(b)))   # human decisions first

    parent, members = {}, {}

    def find(k):
        parent.setdefault(k, k)
        members.setdefault(k, {k})
        while parent[k] != k:
            k = parent[k]
        return k

    for _, a, b in sorted(merged, reverse=True):          # most certain first
        ra, rb = find(a), find(b)
        if ra == rb or any(frozenset((x, y)) in blocked for x in members[ra] for y in members[rb]):
            continue
        parent[rb] = ra
        members[ra] |= members.pop(rb)
    return {k: find(k) for k in list(parent)}


def canonical_key(name: str) -> str:
    """skill_key() plus the verified LLM merges: "MS SQL Server" and "SQL Server" get the same key."""
    global _canonical
    if _canonical is None:
        _canonical = _build_canonical()
    k = skill_key(name)
    return _canonical.get(k, k)


def dedupe_skills(names: list[str]) -> list[str]:
    """One entry per canonical skill, first spelling kept: a job listing "Python" and
    "Python programming" requires one skill, not two."""
    seen, out = set(), []
    for n in names:
        k = canonical_key(n)
        if k and k not in seen:
            seen.add(k)
            out.append(n)
    return out
