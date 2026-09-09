"""
Skill Taxonomy Generator
========================
Sources:
  1. ESCO v1.2.1 - digitalSkillsCollection_en.csv (saved as esco_skills.csv)
     Filter: SE-relevant broader concept categories only
  2. JobStreet Malaysian job postings - jobstreet_all_job_dataset.csv
     Filter: 'Information & Communication Technology' category only

Output:
  - data/skill_taxonomy.json         (taxonomy with ESCO URI + market frequency)
  - data/skill_frequency_evidence.csv (audit trail for each skill)

Usage:
  cd backend
  python data/scripts/taxonomy_analysis.py

Citation:
  "This service uses the ESCO classification of the European Commission."
  ESCO dataset v1.2.1, https://esco.ec.europa.eu
"""

import pandas as pd
import re
import json
from pathlib import Path

# ── SE-relevant ESCO broader concept categories ──────────────────────────────
SE_RELEVANT_CATEGORIES = [
    "computer programming",
    "programming computer systems",
    "software and applications development and analysis",
    "software architecture models",
    "software design methodologies",
    "software frameworks",
    "software interaction design",
    "database and network design and administration",
    "database management systems",
    "database",
    "designing ict systems or applications",
    "ict project management methodologies",
    "ict software specifications",
    "ict infrastructure",
    "cloud technologies",
    "tools for software configuration management",
    "integrated development environment software",
    "penetration testing tool",
    "data extraction, transformation and loading tools",
    "data mining",
    "managing, gathering and storing digital data",
    "store digital data and systems",
    "query languages",
    "resource description framework query language",
    "style sheet languages",
    "web programming",
    "mobile operating systems",
    "operating systems",
    "principles of artificial intelligence",
    "service-oriented modelling",
]

# ── Skill names that belong to Web and Mobile regardless of broader concept ──
WEB_MOBILE_SKILLS = {
    'css', 'html', 'javascript', 'typescript', 'angular', 'react',
    'vue', 'flutter', 'swift (computer programming)', 'kotlin',
    'android (mobile operating systems)', 'ios', 'php',
    'ruby (computer programming)', 'node.js', 'asp.net', 'django',
    'laravel', 'wordpress', 'drupal', 'sass', 'less', 'coffeescript',
    'web programming', 'web services', 'mobile device software frameworks',
    'mobile operating systems', 'react native', 'ajax framework',
    'javascript framework', 'jquery', 'bootstrap',
}

# ── Category mapping ─────────────────────────────────────────────────────────
def map_category(broader_str, skill_name=""):
    name_lower = str(skill_name).lower().strip()
    b = str(broader_str).lower()

    if name_lower in WEB_MOBILE_SKILLS:
        return "Web and Mobile Development"
    if any(x in b for x in ["style sheet", "web programming", "mobile operating"]):
        return "Web and Mobile Development"
    elif any(x in b for x in ["computer programming", "programming computer"]):
        return "Programming Languages"
    elif any(x in b for x in ["database", "query language", "data extraction"]):
        return "Databases"
    elif any(x in b for x in ["cloud", "ict infrastructure", "tools for software configuration"]):
        return "Cloud and Infrastructure"
    elif any(x in b for x in ["data mining", "managing, gathering", "store digital", "artificial intelligence"]):
        return "Data and AI"
    elif any(x in b for x in ["software", "designing ict", "ict project", "service-oriented", "operating systems", "penetration"]):
        return "Software Engineering Practices"
    else:
        return "General ICT"

# ── 1. Load and filter ESCO skills ───────────────────────────────────────────
print("=" * 60)
print("Step 1: Loading ESCO digital skills...")
esco = pd.read_csv("data/esco_skills.csv")
print(f"  Total ESCO digital skills: {len(esco)}")

def is_se_relevant(broader_str):
    if pd.isna(broader_str):
        return False
    b = broader_str.lower()
    return any(cat in b for cat in SE_RELEVANT_CATEGORIES)

esco_filtered = esco[esco["broaderConceptPT"].apply(is_se_relevant)].copy()
print(f"  SE-relevant ESCO skills after filtering: {len(esco_filtered)}")

# ── 2. Load and filter JobStreet data ────────────────────────────────────────
print("\nStep 2: Loading JobStreet data...")
df = pd.read_csv("data/jobstreet_all_job_dataset.csv")
print(f"  Total job postings: {len(df)}")

ict = df[df["category"] == "Information & Communication Technology"].copy()
print(f"  ICT category jobs: {len(ict)}")

all_text = " ".join(ict["descriptions"].dropna().str.lower().tolist())
print(f"  Total text length: {len(all_text):,} characters")

# ── 3. Compute JobStreet frequency for each ESCO skill ───────────────────────
print("\nStep 3: Computing market frequency for each skill...")

def get_frequency(label, alt_labels):
    terms = [str(label).lower().strip()]
    if pd.notna(alt_labels) and str(alt_labels).strip():
        extras = [a.strip().lower() for a in str(alt_labels).split("\n") if a.strip()]
        terms.extend(extras)
    total = 0
    for term in terms:
        if len(term) < 2:
            continue
        pattern = r"\b" + re.escape(term) + r"\b"
        total += len(re.findall(pattern, all_text))
    return total

taxonomy = []
for _, row in esco_filtered.iterrows():
    freq = get_frequency(row["preferredLabel"], row.get("altLabels", ""))
    category = map_category(row["broaderConceptPT"], row["preferredLabel"])

    aliases = []
    if pd.notna(row.get("altLabels", "")):
        aliases = [
            a.strip() for a in str(row["altLabels"]).split("\n")
            if a.strip() and a.strip().lower() != str(row["preferredLabel"]).lower()
        ]

    taxonomy.append({
        "skill_id": None,
        "name": row["preferredLabel"],
        "category": category,
        "aliases": aliases[:5],
        "description": row["description"] if pd.notna(row.get("description")) else "",
        "esco_uri": row["conceptUri"],
        "esco_skill_type": row.get("skillType", ""),
        "esco_broader": row["broaderConceptPT"],
        "jobstreet_frequency": freq,
        "source": "ESCO v1.2.1 + JobStreet MY ICT (8675 jobs)"
    })

# Sort by frequency descending
taxonomy.sort(key=lambda x: -x["jobstreet_frequency"])

# Assign skill IDs after sorting
for i, skill in enumerate(taxonomy, start=1):
    skill["skill_id"] = f"SK{i:03d}"

# ── 4. Save outputs ──────────────────────────────────────────────────────────
print("\nStep 4: Saving outputs...")
Path("data").mkdir(exist_ok=True)

with open("data/skill_taxonomy.json", "w", encoding="utf-8") as f:
    json.dump(taxonomy, f, indent=2, ensure_ascii=False)
print(f"  skill_taxonomy.json saved ({len(taxonomy)} skills)")

evidence_rows = []
for s in taxonomy:
    evidence_rows.append({
        "skill_id": s["skill_id"],
        "name": s["name"],
        "category": s["category"],
        "jobstreet_frequency": s["jobstreet_frequency"],
        "esco_uri": s["esco_uri"],
        "esco_skill_type": s["esco_skill_type"],
        "esco_broader": s["esco_broader"],
        "source_esco": "ESCO v1.2.1 digitalSkillsCollection_en.csv",
        "source_jobstreet": "jobstreet_all_job_dataset.csv (ICT category, 8675 jobs)",
    })

evidence_df = pd.DataFrame(evidence_rows)
evidence_df.to_csv("data/skill_frequency_evidence.csv", index=False)
print(f"  skill_frequency_evidence.csv saved ({len(evidence_df)} rows)")

# ── 5. Summary ───────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("TAXONOMY SUMMARY")
print("=" * 60)
print(f"Total skills: {len(taxonomy)}")

print(f"\nBy category:")
cat_counts = {}
for s in taxonomy:
    cat_counts[s["category"]] = cat_counts.get(s["category"], 0) + 1
for cat, count in sorted(cat_counts.items(), key=lambda x: -x[1]):
    print(f"  {cat:<35} {count:>4} skills")

zero_freq = [s for s in taxonomy if s["jobstreet_frequency"] == 0]
print(f"\nSkills with market frequency > 0: {len(taxonomy) - len(zero_freq)}")
print(f"Skills with market frequency = 0: {len(zero_freq)} (academically valid per ESCO)")

print(f"\nTop 20 by Malaysian ICT job market frequency:")
print(f"{'Rank':<6} {'Skill':<40} {'Category':<30} {'Freq':>6}")
print("-" * 85)
for i, s in enumerate(taxonomy[:20], 1):
    print(f"{i:<6} {s['name']:<40} {s['category']:<30} {s['jobstreet_frequency']:>6}")

print("\nDone.")
print('Citation: "This service uses the ESCO classification of the European Commission."')