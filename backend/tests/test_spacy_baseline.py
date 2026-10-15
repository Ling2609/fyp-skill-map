"""E1 spaCy baseline (15 Oct): dictionary matching scored exactly like the LLM extractor (same answer key and
grouping), with the ad's own words, the longest match, and one skill per dictionary entry."""
import os
import sys

import pytest

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "scripts", "evaluation"))
spacy = pytest.importorskip("spacy")
import evaluate_spacy_baseline as sb  # noqa: E402


def test_longest_match_in_the_ads_words_once_per_entry():
    terms = {"sql": "E1", "sql server": "E2", "ms sql": "E2", "python": "E3", "py": "E3"}
    m = sb.Matcher(terms)
    found = m.skills("We use Microsoft SQL Server, MS SQL and PYTHON daily. Python is a must.")
    assert found == ["SQL Server", "PYTHON"]       # "SQL" inside "SQL Server" not counted; MS SQL = same entry


def test_ir_dictionary_keeps_the_sprint2_term_rules():
    terms = sb.ir_dictionary()
    assert terms["python"] and "(" not in min(terms, key=len)
    assert all(len(t) > 1 for t in terms)


def test_scored_like_e1b_with_a_paired_comparison(monkeypatch, tmp_path):
    ads = [{"job_ref": f"j{i}", "title": "Dev", "text": "Skills: Python, SQL and Docker."} for i in range(4)]
    key = {a["job_ref"]: ["Python", "SQL", "Docker", "Kubernetes"] for a in ads}
    files = {"ads.json": ads, "answer_key.json": key}
    saved = {}
    monkeypatch.setattr(sb.e1, "load", lambda n: files[n])
    monkeypatch.setattr(sb.e1, "path", lambda n: str(tmp_path / n))
    monkeypatch.setattr(sb.e1, "save", lambda n, d: saved.__setitem__(n, d))
    monkeypatch.setattr(sb.e1, "extracted", lambda a: {x["job_ref"]: [{"skill": s} for s in ("Python", "SQL", "Docker", "Kubernetes")] for x in a})
    monkeypatch.setattr(sb, "ir_dictionary", lambda: {"python": "1", "sql": "2", "docker": "3", "skills": "4"})
    monkeypatch.setattr(sb, "ESCO_DIGITAL", str(tmp_path / "none.csv"))      # S2 files absent: skipped, said so
    runs = []
    import app.services.evaluation_runs as ev
    monkeypatch.setattr(ev, "record", lambda name, **k: runs.append((name, k)) or "id")
    sb.main()
    found = saved["spacy_skills.json"]["S1 IR design (463-skill taxonomy)"]["j0"]
    assert found == ["Skills", "Python", "SQL", "Docker"]
    m = runs[0][1]["metrics"]
    assert (m["precision"]["value"], m["recall"]["value"]) == (0.75, 0.75)
    assert m["llm_minus_baseline"]["f1"]["diff"] == 0.25
    assert "S1" in open(tmp_path / "scores_spacy.txt").read()
