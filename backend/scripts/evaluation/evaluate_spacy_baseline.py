"""
E1 baseline (15 Oct, evaluation step 2): spaCy dictionary matching vs SkillMap's LLM extractor on the SAME 30 ads and
the SAME answer key as E1b (docs/evidence/job_skill_extraction/). Answers the IR deviation: the IR planned spaCy for
skill extraction, the app uses an LLM (gpt-oss-120b). Git shows a spaCy PhraseMatcher extractor was built first
(efd1958, Sprint 2) and replaced; this measures what that change gained or lost. No API calls, no new labels.

Plan, fixed on 15 Oct BEFORE any spaCy result was seen:
  - S1 "IR design": the Sprint 2 extractor's dictionary, data/skill_taxonomy.json (463 ESCO skills chosen by
    JobStreet frequency), with its term rules: the name, the name before "(", and every alias ("|"-separated);
    terms of 1 character dropped. Case-insensitive spaCy PhraseMatcher (attr LOWER).
  - S2 "large public dictionary": ESCO v1.2.1 digital skills collection (preferred + alternative labels) and every
    O*NET Software Skills product name ("Workplace Example"); same term rules. Both are public and independent of
    SkillMap's LLM, so the baseline isn't helped by the system it is compared with.
  - Both: spaCy's English tokeniser (spacy.blank("en"); the Sprint 2 code loaded en_core_web_sm, whose tokeniser
    is the same, only to tokenise), overlapping matches -> the longest kept (spacy.util.filter_spans), one skill per
    dictionary entry, written in the AD'S OWN WORDS (the matched text). Using the ad's words, not the dictionary's
    label, is favourable to the baseline: the answer key is in ad words too.
  - Scored exactly as E1b: same answer key, same skill grouping (canonical key + plain-name rules), micro P/R/F1,
    95% bootstrap over ads (10,000, seed 0); LLM vs each baseline by paired bootstrap over ads.
  - Reading: the LLM's change is "justified" against a baseline if its F1 is higher and the paired 95% interval of
    the F1 difference is above 0. Precision and recall are reported separately (a dictionary can't tell hard from
    soft skills, or the skill a job needs from a word that happens to appear).

From backend/, venv active (needs ads.json from the E1b sample, and for S2 the ESCO + O*NET files in data/external/,
the same files build_pairs_esco_onet.py uses):
  python scripts/evaluation/evaluate_spacy_baseline.py
    -> spacy_skills.json, scores_spacy.txt, errors_spacy.csv in docs/evidence/job_skill_extraction/, and one
       MongoDB evaluation run per dictionary
"""
import csv
import json
import os
import random
import sys

sys.path.append(".")
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import evaluate_job_skill_extraction as e1  # noqa: E402  (same answer key, grouping and scoring as E1b)

TAXONOMY = "data/skill_taxonomy.json"
ESCO_DIGITAL = "data/external/esco/digitalSkillsCollection_en.csv"
ONET = "data/external/onet_software_skills.csv"


# ── dictionaries: {term: entry id} ───────────────────────────────────────────────────────────────────────────────
def _add(terms: dict, term: str, entry: str):
    """The Sprint 2 rule: lower-case, more than one character, the first entry to claim a term keeps it."""
    term = " ".join((term or "").split()).lower()
    if len(term) > 1 and term not in terms:
        terms[term] = entry


def ir_dictionary(path: str = TAXONOMY) -> dict[str, str]:
    """S1: the Sprint 2 extractor's 463-skill taxonomy, with its name / short name / alias terms."""
    with open(path, encoding="utf-8") as f:
        taxonomy = json.load(f)
    terms = {}
    for s in taxonomy:
        _add(terms, s["name"], s["skill_id"])
        if "(" in s["name"]:
            _add(terms, s["name"][:s["name"].index("(")], s["skill_id"])
        for group in s.get("aliases", []):
            for alias in group.split("|"):
                _add(terms, alias, s["skill_id"])
    return terms


def public_dictionary(esco: str = ESCO_DIGITAL, onet: str = ONET) -> dict[str, str]:
    """S2: ESCO's digital skills (preferred + alternative labels) and O*NET's software product names."""
    terms = {}
    with open(esco, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            _add(terms, row["preferredLabel"], row["conceptUri"])
            for alt in (row.get("altLabels") or "").replace("|", "\n").split("\n"):
                _add(terms, alt, row["conceptUri"])
    with open(onet, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            _add(terms, row["Workplace Example"], "onet:" + row["Workplace Example"].strip().lower())
    return terms


# ── matching ─────────────────────────────────────────────────────────────────────────────────────────────────────
class Matcher:
    def __init__(self, terms: dict[str, str]):
        import spacy
        from spacy.matcher import PhraseMatcher
        self.nlp = spacy.blank("en")
        self.matcher = PhraseMatcher(self.nlp.vocab, attr="LOWER")
        by_entry = {}
        for term, entry in terms.items():
            by_entry.setdefault(entry, []).append(term)
        for entry, ts in by_entry.items():
            self.matcher.add(entry, [self.nlp.make_doc(t) for t in ts])

    def skills(self, text: str) -> list[str]:
        """One name per dictionary entry found, in the ad's own words; overlapping matches -> the longest."""
        from spacy.util import filter_spans
        doc = self.nlp(text or "")
        matches = self.matcher(doc)
        entry_at = {(s, e): self.nlp.vocab.strings[m] for m, s, e in matches}
        out, seen = [], set()
        for sp in filter_spans([doc[s:e] for _, s, e in matches]):
            entry = entry_at[(sp.start, sp.end)]
            if entry not in seen:
                seen.add(entry)
                out.append(" ".join(sp.text.split()))
        return out


# ── scoring (as E1b) ─────────────────────────────────────────────────────────────────────────────────────────────
def counts(ads, key, predicted) -> list[dict]:
    rows = []
    for a in ads:
        g = e1.clusters({"key": key[a["job_ref"]], "pred": predicted.get(a["job_ref"], [])})
        rows.append({"job_ref": a["job_ref"], "title": a["title"],
                     "tp": sum(len(x) == 2 for x in g), "fp": [x["pred"] for x in g if list(x) == ["pred"]],
                     "fn": [x["key"] for x in g if list(x) == ["key"]]})
    for r in rows:
        r["fp_n"], r["fn_n"] = len(r["fp"]), len(r["fn"])
    return rows


def _m(rows, idx=None):
    idx = range(len(rows)) if idx is None else idx
    return e1.prf(sum(rows[i]["tp"] for i in idx), sum(rows[i]["fp_n"] for i in idx), sum(rows[i]["fn_n"] for i in idx))


def with_ci(rows) -> dict:
    rng, boots = random.Random(0), []
    for _ in range(10_000):
        boots.append(_m(rows, [rng.randrange(len(rows)) for _ in rows]))
    point = _m(rows)
    return {k: {"value": round(point[i], 3), "ci95": [round(sorted(b[i] for b in boots)[249], 3),
                                                       round(sorted(b[i] for b in boots)[9749], 3)]}
            for i, k in enumerate(("precision", "recall", "f1"))}


def paired(base, llm) -> dict:
    """LLM minus baseline, 95% paired bootstrap over ads."""
    rng, d = random.Random(0), []
    for _ in range(10_000):
        idx = [rng.randrange(len(base)) for _ in base]
        x, y = _m(base, idx), _m(llm, idx)
        d.append([y[i] - x[i] for i in range(3)])
    b, w = _m(base), _m(llm)
    return {k: {"diff": round(w[i] - b[i], 3), "ci95": [round(sorted(t[i] for t in d)[249], 3),
                                                       round(sorted(t[i] for t in d)[9749], 3)]}
            for i, k in enumerate(("precision", "recall", "f1"))}


def main():
    ads, key = e1.load("ads.json"), e1.load("answer_key.json")
    llm = counts(ads, key, {r: [s["skill"] for s in v] for r, v in e1.extracted(ads).items()})
    llm_ci = with_ci(llm)
    variants = [("S1 IR design (463-skill taxonomy)", ir_dictionary, [TAXONOMY])]
    if os.path.exists(ESCO_DIGITAL) and os.path.exists(ONET):
        variants.append(("S2 public dictionary (ESCO digital + O*NET software)", public_dictionary, [ESCO_DIGITAL, ONET]))
    else:
        print(f"S2 skipped: {ESCO_DIGITAL} and {ONET} are needed (see README, build_pairs_esco_onet.py)")
    lines = [f"spaCy dictionary baseline vs the LLM extractor: same {len(ads)} ads, same answer key "
             f"({sum(len(key[a['job_ref']]) for a in ads)} skills) and scoring as E1b",
             "", f"{'':<54} {'precision':>21} {'recall':>21} {'F1':>21}"]
    fmt = lambda m: "".join(f"{m[k]['value']:>8.3f} ({m[k]['ci95'][0]:.3f}-{m[k]['ci95'][1]:.3f})" for k in ("precision", "recall", "f1"))
    lines.append(f"{'LLM extractor (gpt-oss-120b, as in the app)':<54} {fmt(llm_ci)}")
    found_all, errors, results = {}, [], []
    for name, build, files in variants:
        terms = build()
        m = Matcher(terms)
        found = {a["job_ref"]: m.skills(a["text"]) for a in ads}
        found_all[name] = found
        rows = counts(ads, key, found)
        ci, diff = with_ci(rows), paired(rows, llm)
        lines.append(f"{name:<54} {fmt(ci)}")
        results.append((name, terms, rows, ci, diff, files))
        for r in rows:
            errors += [{"dictionary": name.split()[0], "job_ref": r["job_ref"], "title": r["title"],
                        "error": "extra (not in answer key)", "skill": s} for s in r["fp"]]
            errors += [{"dictionary": name.split()[0], "job_ref": r["job_ref"], "title": r["title"],
                        "error": "missed (in answer key)", "skill": s} for s in r["fn"]]
    lines.append("(95% CI, bootstrap over ads)")
    for name, terms, rows, ci, diff, files in results:
        f1 = diff["f1"]
        justified = f1["diff"] > 0 and f1["ci95"][0] > 0
        verdict = (f"LLM F1 higher by {f1['diff']:+.3f} (CI {f1['ci95'][0]:+.3f} to {f1['ci95'][1]:+.3f}): change justified"
                   if justified else f"LLM F1 {f1['diff']:+.3f} (CI {f1['ci95'][0]:+.3f} to {f1['ci95'][1]:+.3f}): not shown better")
        lines += ["", f"LLM minus {name.split()[0]} ({len(terms):,} dictionary terms; {sum(r['tp'] + r['fp_n'] for r in rows)} "
                      f"skills found), paired 95% CI over ads:"]
        for k in ("precision", "recall", "f1"):
            lines.append(f"  {k:<9} {diff[k]['diff']:+.3f}  (CI {diff[k]['ci95'][0]:+.3f} to {diff[k]['ci95'][1]:+.3f})")
        lines.append(f"  -> {verdict}")
        from app.services.evaluation_runs import record
        record(f"E1 spaCy baseline {name.split()[0]}", objective=1,
               method="spaCy PhraseMatcher (LOWER, blank English tokeniser, longest match, ad's own words) vs the same "
                      "answer key and grouping as E1b; micro P/R/F1, 95% bootstrap over ads; LLM vs baseline paired",
               dataset={"ads": len(ads), "dictionary": name, "terms": len(terms),
                        "found": sum(r["tp"] + r["fp_n"] for r in rows)},
               metrics={**ci, "llm_minus_baseline": diff}, verdict=verdict,
               files=[e1.path("ads.json"), e1.path("answer_key.json"), *files])
    e1.save("spacy_skills.json", found_all)
    with open(e1.path("scores_spacy.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    with open(e1.path("errors_spacy.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["dictionary", "job_ref", "title", "error", "skill"])
        w.writeheader()
        w.writerows(errors)
    print("\n".join(lines))
    print("Written scores_spacy.txt, spacy_skills.json and errors_spacy.csv (every extra and missed skill).")


if __name__ == "__main__":
    main()
