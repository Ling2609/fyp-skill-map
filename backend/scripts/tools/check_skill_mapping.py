"""
Check how the skill names in the database can be normalised (roadmap A8). Read-only for the database.

Default: GROUP the database's own skill names (the chosen A8 approach, 30 Sep).
  Layer 1 - rules (app/services/skill_names.py): names with the same key are the same skill
            ("Power BI" = "PowerBI" = "Microsoft Power BI", "React JS" = "React", "Python programming" = "Python").
            Each group is named after its most used spelling.
  Layer 2 - (to build) close pairs of groups by SBERT, to be checked by the LLM ("Unix/Linux" vs "Linux").
            This report counts those pairs, so we know the LLM workload before building it.
  Writes ../docs/evidence/a8_rule_groups.csv (every group with its spellings), a8_rule_merge_sample.csv
  (40 random merges to spot-check) and a8_close_pairs.csv (the pairs layer 2 would check).

--taxonomy: the first analysis (29-30 Sep): how the names map onto data/skill_taxonomy.json (ESCO-based) by
  exact name, filler words and SBERT, plus a 110-row sample to label. Result: only ~15% of skill uses match the
  taxonomy exactly and SBERT suggestions were often wrong even at 0.95+, so the taxonomy is only a label, not the
  target (see references.md, "Skill normalisation").

Usage (from backend/, venv active):
  python scripts/tools/check_skill_mapping.py              # grouping report
  python scripts/tools/check_skill_mapping.py --taxonomy   # taxonomy report (rewrites a8_mapping_sample.csv)
"""
import argparse
import csv
import json
import random
import re
import sys
from collections import Counter, defaultdict

import numpy as np


sys.path.append(".")   # run from backend/

from app.database import SessionLocal
from app.models.job import JobSkill
from app.models.module import ModuleSkill
from app.models.profile import UserCertification, UserProject
from app.nlp.embedder import get_embedder
from app.services.skill_names import skill_key
from app.services.skill_profile import normalise_rows

TAXONOMY = "data/skill_taxonomy.json"
EVIDENCE = "../docs/evidence/"
SAMPLE_CSV = EVIDENCE + "a8_mapping_sample.csv"
BANDS = [(0.95, 1.01), (0.85, 0.95), (0.75, 0.85), (0.65, 0.75), (0.55, 0.65)]   # 20 rows from each
PER_BAND = 20
FILLER_SAMPLE = 10

# Words that describe *how* a skill is used, not *which* skill it is
FILLER = re.compile(
    r"\b(programming|development|developing|language|languages|skills?|knowledge|usage|understanding|"
    r"experience|proficiency|basics|fundamentals|concepts|principles|framework|library|tools?)\b"
)


def key(text: str) -> str:
    """Compare names without case, punctuation or extra spaces; keep C++, C#, .NET."""
    t = re.sub(r"[^\w\s+#.]", " ", (text or "").lower())
    return " ".join(t.split()).strip(" .")


def load_taxonomy():
    """(lookup: key -> canonical name, texts to embed, canonical name of each text).
    The taxonomy has a few duplicates differing only in case ("machine learning" / "Machine Learning"):
    the one seen most in JobStreet wins."""
    skills = sorted(json.load(open(TAXONOMY, encoding="utf-8")), key=lambda s: -(s.get("jobstreet_frequency") or 0))
    lookup = {}
    for s in skills:
        for text in [s["name"], *(s.get("aliases") or [])]:
            k = key(text)
            if k:
                lookup.setdefault(k, s["name"])
    texts = list(lookup)                        # every distinct name/alias, embedded once
    return lookup, texts, [lookup[t] for t in texts]


def database_skills(db) -> Counter:
    """Every skill name in use, counted by how often it appears (jobs, modules, projects, certs)."""
    counts = Counter()
    for (name,) in db.query(JobSkill.skill_name):
        counts[name.strip()] += 1
    for (name,) in db.query(ModuleSkill.skill_name):
        counts[name.strip()] += 1
    for (names,) in db.query(UserProject.extracted_skills):
        counts.update(n.strip() for n in names or [])
    for (names,) in db.query(UserCertification.mapped_skills):
        counts.update(n.strip() for n in names or [])
    del counts[""]
    return counts


def taxonomy_report(counts: Counter):
    lookup, tax_texts, tax_canon = load_taxonomy()

    # Group spellings that differ only in case/punctuation ("Python" / "python")
    by_key = {}
    for name, n in counts.items():
        k = key(name)
        name0, n0 = by_key.get(k, (name, 0))
        by_key[k] = (name0, n0 + n)

    rows = []            # (skill, method, suggestion, similarity, occurrences)
    to_embed = []
    for k, (name, n) in by_key.items():
        if k in lookup:
            rows.append((name, "exact", lookup[k], 1.0, n))
            continue
        stripped = " ".join(FILLER.sub(" ", k).split())
        if stripped and stripped != k and stripped in lookup:
            rows.append((name, "filler", lookup[stripped], 1.0, n))
            continue
        to_embed.append((name, n))

    print(f"{len(counts)} skill names in the database, {len(by_key)} after ignoring case and punctuation")
    print(f"Taxonomy: {len(set(tax_canon))} skills, {len(tax_texts)} names and aliases\n")

    if to_embed:
        embedder = get_embedder()
        tax_vecs = normalise_rows(embedder.embed_cached(tax_texts))
        skill_vecs = normalise_rows(embedder.embed_cached([name for name, _ in to_embed]))
        sims = skill_vecs @ tax_vecs.T
        best = sims.argmax(axis=1)
        for (name, n), j, i in zip(to_embed, best, range(len(to_embed))):
            rows.append((name, "sbert", tax_canon[j], float(sims[i, j]), n))

    # Summary
    total_uses = sum(r[4] for r in rows)
    def line(label, sel):
        names, uses = len(sel), sum(r[4] for r in sel)
        print(f"  {label:<34} {names:>6} names ({names / len(rows):5.1%})   {uses:>7} uses ({uses / total_uses:5.1%})")
    print("How each skill name would map:")
    line("exact name / alias", [r for r in rows if r[1] == "exact"])
    line("exact after dropping filler words", [r for r in rows if r[1] == "filler"])
    sb = [r for r in rows if r[1] == "sbert"]
    for lo, hi in [(0.9, 1.01), (0.8, 0.9), (0.7, 0.8), (0.6, 0.7), (0.0, 0.6)]:
        line(f"SBERT similarity {lo:.1f}–{min(hi, 1):.1f}", [r for r in sb if lo <= r[3] < hi])

    print("\nMost used skills with NO close taxonomy skill (similarity < 0.6), i.e. gaps in the taxonomy:")
    for name, _, sugg, sim, n in sorted((r for r in sb if r[3] < 0.6), key=lambda r: -r[4])[:15]:
        print(f"  {n:>5}×  {name}   (nearest: {sugg}, {sim:.2f})")

    # Sample for labelling: 20 SBERT rows per similarity band + 10 filler rows
    rng = random.Random(42)
    sample = []
    for lo, hi in BANDS:
        band = [r for r in sb if lo <= r[3] < hi]
        sample += rng.sample(band, min(PER_BAND, len(band)))
    filler = [r for r in rows if r[1] == "filler"]
    sample += rng.sample(filler, min(FILLER_SAMPLE, len(filler)))
    rng.shuffle(sample)   # so the similarity order doesn't bias the labelling

    with open(SAMPLE_CSV, "w", newline="", encoding="utf-8-sig") as f:   # utf-8-sig: Excel opens it cleanly
        w = csv.writer(f)
        w.writerow(["skill", "suggested_taxonomy_skill", "correct (y/n)", "method", "similarity", "uses"])
        for name, method, sugg, sim, n in sample:
            w.writerow([name, sugg, "", method, f"{sim:.3f}", n])
    print(f"\n{len(sample)} sample rows written to {SAMPLE_CSV}")
    print('Label each row: y = the suggestion is the same skill (a general form is fine: "Docker containerization" '
          '-> Docker), n = a different skill ("Stakeholder analysis" -> stakeholder negotiation).')


def group_report(counts: Counter):
    # Layer 1: group spellings by rule key; each group is named after its most used spelling
    groups = defaultdict(Counter)
    for name, n in counts.items():
        groups[skill_key(name)][name] += n
    named = sorted(((g.most_common(1)[0][0], sum(g.values()), g) for g in groups.values()), key=lambda x: -x[1])
    merged = [(name, spelling, n) for name, total, g in named for spelling, n in g.items() if spelling != name]

    total_uses = sum(counts.values())
    print(f"{len(counts)} skill names in the database ({total_uses} uses)")
    print(f"Layer 1 (rules): {len(named)} skills after grouping; {len(merged)} spellings merged into another "
          f"({sum(n for _, _, n in merged)} uses renamed)")
    multi = [x for x in named if len(x[2]) > 1]
    print(f"  {len(multi)} skills have more than one spelling. The 20 most used:")
    for name, total, g in multi[:20]:
        others = [s for s, _ in g.most_common() if s != name]
        more = f" +{len(others) - 5} more" if len(others) > 5 else ""
        print(f"  {total:>6}x  {name}  <-  {' | '.join(others[:5])}{more}")

    with open(EVIDENCE + "a8_rule_groups.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["skill (most used spelling)", "uses", "spellings", "all spellings"])
        for name, total, g in named:
            w.writerow([name, total, len(g), " | ".join(s for s, _ in g.most_common())])
    rng = random.Random(42)
    with open(EVIDENCE + "a8_rule_merge_sample.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["spelling", "merged into", "same skill? (y / n / ?)"])
        for name, spelling, _ in rng.sample(merged, min(40, len(merged))):
            w.writerow([spelling, name, ""])

    # Layer 2 workload: close pairs of groups by SBERT (each group compared with every other)
    names = [name for name, _, _ in named]
    uses = {name: total for name, total, _ in named}
    vecs = normalise_rows(get_embedder().embed_cached(names)).astype(np.float32)
    pairs = []
    for start in range(0, len(names), 1000):          # in chunks, so memory stays small
        sims = vecs[start:start + 1000] @ vecs.T
        for i, j in zip(*np.nonzero(sims >= 0.8)):
            a = start + i
            if a < j:
                pairs.append((float(sims[i, j]), names[a], names[j]))
    pairs.sort(reverse=True)
    print("\nLayer 2 workload: pairs of different skills that SBERT finds close (an LLM would check these)")
    for lo in (0.95, 0.9, 0.85, 0.8):
        sel = [p for p in pairs if p[0] >= lo]
        both = [p for p in sel if uses[p[1]] > 1 and uses[p[2]] > 1]
        print(f"  similarity >= {lo:.2f}: {len(sel):>6} pairs ({len(both)} where both skills are used more than once)")
    print("  Examples (the most used pairs at >= 0.85):")
    for sim, a, b in sorted((p for p in pairs if p[0] >= 0.85), key=lambda p: -min(uses[p[1]], uses[p[2]]))[:15]:
        print(f"    {sim:.2f}  {a} ({uses[a]}×)  ~  {b} ({uses[b]}×)")
    with open(EVIDENCE + "a8_close_pairs.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["similarity", "skill A", "uses A", "skill B", "uses B"])
        for sim, a, b in pairs:
            w.writerow([f"{sim:.3f}", a, uses[a], b, uses[b]])
    print(f"\nWritten to {EVIDENCE}: a8_rule_groups.csv, a8_rule_merge_sample.csv, a8_close_pairs.csv")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--taxonomy", action="store_true", help="the first analysis: map names onto the taxonomy")
    args = parser.parse_args()
    db = SessionLocal()
    try:
        counts = database_skills(db)
    finally:
        db.close()
    if args.taxonomy:
        taxonomy_report(counts)
    else:
        group_report(counts)


if __name__ == "__main__":
    main()
