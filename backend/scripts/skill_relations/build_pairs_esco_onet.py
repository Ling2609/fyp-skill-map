"""
Stage 2, training set v1: skill pairs labelled from public expert data instead of an LLM ("distant
supervision": labels taken from an existing knowledge base, Mintz et al. 2009). No Groq, no manual labels.

Labels follow docs/skill_relation_label_guide.md (A = student's skill -> B = job's skill):
  SAME      ESCO preferred label <-> its alternative labels (digital skills only); A8's 349 verified same pairs
  NARROWER  A is a kind / part of B: ESCO skill -> its broader skill; O*NET hot technology -> its software category
  BROADER   the same pairs reversed (B is a kind of A)
  RELATED   ESCO skill-skill relations; ESCO siblings (same broader skill); O*NET hot technologies in the same
            small IT category (alternatives: Docker / Kubernetes, Power BI / Tableau)
  DIFFERENT random pairs from different ESCO parents / O*NET categories with no relation between them
Training collapses these into 3 classes: SATISFIES (SAME + NARROWER), RELATED, NOT (BROADER + DIFFERENT).

Split BY SKILL (Levy et al. 2015, lexical memorisation): every skill (all labels of one ESCO concept, one O*NET
tool, one category name) goes to train / val / test by a hash. Hierarchy pairs (NARROWER / BROADER) follow their
PARENT, so a category name never appears on both sides of the split (the model can't learn "this word is a
broad category" by heart). RELATED pairs follow one fixed side; DIFFERENT pairs are drawn within one split; SAME
pairs are one concept, so both sides share a split.

Inputs (free downloads, not in git, see README): ESCO v1.2.1 CSV (classification, English) unzipped into
data/external/esco/ and O*NET 31.0 "Software Skills" CSV saved as data/external/onet_software_skills.csv.
Licences: ESCO (European Commission, reuse allowed with attribution); O*NET (CC BY 4.0).

Usage (from backend/):
  python scripts/skill_relations/build_pairs_esco_onet.py            # writes data/skill_relations/pairs_esco_onet_v1.csv
"""
import argparse
import hashlib
import json
import os
import random
import re
from collections import defaultdict

import pandas as pd

ESCO_DIR = "data/external/esco"
ONET_CSV = "data/external/onet_software_skills.csv"
A8_JSON = "data/skill_merges.json"
OUT = "data/skill_relations/pairs_esco_onet_v1.csv"
PER_CLASS = 1500              # cap per label, so no class dominates
MAX_SIBLING_CATEGORY = 80     # O*NET categories bigger than this are too broad for "alternatives"
SEED = 42

# O*NET software categories that belong to ICT work (by keyword); the rest (medical, CAD, HR...) are left out
IT_WORDS = ("develop", "server", "data base", "database", "network", "operating system", "web", "cloud",
            "business intelligence", "analytic", "security", "configuration", "program testing",
            "enterprise application", "data mining", "backup", "transaction", "middleware", "object",
            "compiler", "metadata", "content workflow", "requirements analysis", "development environment",
            "filesystem", "storage", "virtual", "platform", "query", "spreadsheet", "presentation",
            "project management", "customer relationship", "enterprise resource planning", "help desk",
            "access software", "authentication", "encryption", "internet", "mail", "instant messaging")


def norm(s: str) -> str:
    return " ".join(str(s).replace(" ", " ").split())


STOP = {"perform", "use", "apply", "manage", "develop", "the", "of", "and", "a", "an", "to", "in", "for", "on",
        "techniques", "software", "systems", "system", "tools", "methods"}


def contained(a: str, b: str) -> bool:
    """One name's content words are all in the other ("perform data mining" / "data mining"): that is SAME
    by the label guide (filler words), not RELATED, so such pairs are too ambiguous to keep as RELATED."""
    wa = set(re.findall(r"[a-z0-9+#]+", a.lower())) - STOP
    wb = set(re.findall(r"[a-z0-9+#]+", b.lower())) - STOP
    return bool(wa) and bool(wb) and (wa <= wb or wb <= wa)


def split_of(key: str) -> str:
    h = int(hashlib.md5(key.lower().encode()).hexdigest(), 16) % 100
    return "train" if h < 70 else "val" if h < 85 else "test"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--esco", default=ESCO_DIR)
    ap.add_argument("--onet", default=ONET_CSV)
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()
    rng = random.Random(SEED)
    pairs = defaultdict(list)          # label -> [(a, b, source, key_a, key_b)]

    # ── ESCO (digital skills) ───────────────────────────────────────────────────────────────────────
    skills = pd.read_csv(os.path.join(args.esco, "skills_en.csv"))
    # sorted: a set's order changes every time Python starts, which would change the random sample
    digital = sorted(set(pd.read_csv(os.path.join(args.esco, "digitalSkillsCollection_en.csv")).conceptUri))
    label = dict(zip(skills.conceptUri, skills.preferredLabel.map(norm)))
    alts = {u: [norm(x) for x in str(a).split("\n") if norm(x)] for u, a in zip(skills.conceptUri, skills.altLabels)
            if isinstance(a, str)}

    for u in digital:
        p = label.get(u)
        for a in alts.get(u, [])[:2]:                     # at most 2 synonyms per skill
            if a.lower() != p.lower():
                pairs["SAME"].append((a, p, "esco_altlabel", u, u))

    broader = pd.read_csv(os.path.join(args.esco, "broaderRelationsSkillPillar_en.csv"))
    br = broader[(broader.conceptUri.isin(digital)) & (broader.broaderType == "KnowledgeSkillCompetence")]
    parent_of = defaultdict(set)
    for c, p in zip(br.conceptUri, br.broaderUri):
        parent_of[c].add(p)
        pairs["NARROWER"].append((label[c], label[p], "esco_broader", c, p))
    children = defaultdict(list)
    for c, ps in parent_of.items():
        for p in sorted(ps):
            children[p].append(c)
    for p, kids in children.items():                      # siblings: same broader skill
        kids = sorted(kids)
        for i in range(len(kids)):
            for j in range(i + 1, min(len(kids), i + 4)):
                pairs["RELATED"].append((label[kids[i]], label[kids[j]], "esco_sibling", kids[i], kids[j]))

    ssr = pd.read_csv(os.path.join(args.esco, "skillSkillRelations_en.csv"))
    ssr = ssr[ssr.originalSkillUri.isin(digital) & ssr.relatedSkillUri.isin(label.keys())]
    related_uris = set()
    for a, b in zip(ssr.originalSkillUri, ssr.relatedSkillUri):
        related_uris |= {(a, b), (b, a)}
        pairs["RELATED"].append((label[a], label[b], "esco_skill_relation", a, b))

    # ── O*NET (hot technologies in ICT categories) ──────────────────────────────────────────────────
    onet = pd.read_csv(args.onet)
    onet = onet.rename(columns={"Workplace Example": "tool", "Element Name": "category", "Hot Technology": "hot"})
    onet["tool"], onet["category"] = onet.tool.map(norm), onet.category.map(norm)
    onet = onet[onet.category.str.lower().map(lambda c: any(w in c for w in IT_WORDS))]
    tools = onet.drop_duplicates(["tool", "category"])
    hot = tools[tools.hot == "Y"]
    for t, c in zip(hot.tool, hot.category):
        pairs["NARROWER"].append((t, c, "onet_category", "onet:" + t, "onet-cat:" + c))
    by_cat = defaultdict(list)
    for t, c in zip(hot.tool, hot.category):
        by_cat[c].append(t)
    for c, ts in by_cat.items():
        if len(ts) > MAX_SIBLING_CATEGORY:
            continue
        ts = sorted(set(ts))
        for i in range(len(ts)):
            for j in range(i + 1, min(len(ts), i + 3)):
                pairs["RELATED"].append((ts[i], ts[j], "onet_sibling", "onet:" + ts[i], "onet:" + ts[j]))

    # ── A8: verified same pairs from our own data ───────────────────────────────────────────────────
    if os.path.exists(A8_JSON):
        for v in json.load(open(A8_JSON, encoding="utf-8"))["pairs"].values():
            if v.get("same") and v.get("verified"):
                pairs["SAME"].append((v["a"], v["b"], "a8_verified", "a8:" + v["a"], "a8:" + v["a"]))

    # ── DIFFERENT: random pairs with different parents / categories and no relation ─────────────────
    pool = [(label[u], u, frozenset(parent_of.get(u, ()))) for u in digital]
    pool += [(t, "onet:" + t, frozenset({"onet-cat:" + c})) for t, c in zip(hot.tool, hot.category)]
    target = min(PER_CLASS, max(len(v) for v in pairs.values()))
    by_split = defaultdict(list)                 # draw both sides from the same split, so nothing is dropped later
    for item in pool:
        by_split[split_of(item[1])].append(item)
    share = {"train": 0.70, "val": 0.15, "test": 0.15}
    for sp, items in by_split.items():
        want, tries, got = int(target * share[sp]) + 1, 0, 0
        while got < want and tries < 100000 and len(items) > 1:
            tries += 1
            (a, ka, pa), (b, kb, pb) = rng.sample(items, 2)
            if ka == kb or (pa & pb) or (ka, kb) in related_uris or a.lower() == b.lower():
                continue
            pairs["DIFFERENT"].append((a, b, "random_unrelated", ka, kb))
            got += 1

    # BROADER = NARROWER reversed (direction is what the model has to learn)
    pairs["BROADER"] = [(b, a, src.replace("broader", "narrower") + "_reversed", kb, ka)
                        for a, b, src, ka, kb in pairs["NARROWER"]]

    # ── de-duplicate, cap, split by skill ───────────────────────────────────────────────────────────
    rows, seen = [], set()
    for lab in ("SAME", "NARROWER", "BROADER", "RELATED", "DIFFERENT"):
        items = pairs[lab][:]
        rng.shuffle(items)
        kept = 0
        for a, b, src, ka, kb in items:
            if kept >= PER_CLASS:
                break
            key = (a.lower(), b.lower())
            if key in seen or not a or not b or a.lower() == b.lower():
                continue
            if lab == "RELATED" and contained(a, b):
                continue
            if lab == "NARROWER":
                sa = sb = split_of(kb)    # follow the parent (B is the broader side)
            elif lab == "BROADER":
                sa = sb = split_of(ka)    # A is the broader side
            elif lab == "RELATED":
                sa = sb = split_of(min(ka, kb))   # symmetric: follow one fixed side
            else:
                sa, sb = split_of(ka), split_of(kb)
            if sa != sb:                  # one side in training, the other in test: would leak, drop it
                continue
            seen.add(key)
            rows.append({"a": a, "b": b, "label5": lab, "source": src, "split": sa})
            kept += 1
    df = pd.DataFrame(rows)
    df["label3"] = df.label5.map({"SAME": "SATISFIES", "NARROWER": "SATISFIES", "RELATED": "RELATED",
                                  "BROADER": "NOT", "DIFFERENT": "NOT"})
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    df.to_csv(args.out, index=False, encoding="utf-8")

    print(f"Wrote {len(df)} pairs to {args.out}")
    print(pd.crosstab(df.label5, df.split, margins=True).to_string())
    print("\nBy source:")
    print(df.source.value_counts().to_string())
    print("\nExamples:")
    for lab in ("SAME", "NARROWER", "BROADER", "RELATED", "DIFFERENT"):
        ex = df[df.label5 == lab].head(3)
        print(f"  {lab:<9} " + " | ".join(f"{a} -> {b}" for a, b in zip(ex.a, ex.b)))


if __name__ == "__main__":
    main()
