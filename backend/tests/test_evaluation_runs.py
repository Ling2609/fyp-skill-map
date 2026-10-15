"""evaluation_runs (15 Oct): every evaluation run is kept with its setup, git commit and the hashes of the files it
read; MongoDB being off never stops an evaluation."""
import glob
import hashlib
import os

import pytest

from conftest import FakeCollection

import app.services.evaluation_runs as ev


@pytest.fixture
def runs(monkeypatch):
    col = FakeCollection()
    monkeypatch.setattr(ev, "_col", lambda: col)
    return col


def test_a_run_keeps_setup_commit_and_file_hashes(runs, tmp_path):
    f = tmp_path / "answer_key.json"
    f.write_text('{"a": ["Python"]}')
    rid = ev.record("E1b job-ad extraction", objective=1, method="test", dataset={"ads": 30},
                    metrics={"f1": {"value": 0.695, "ci95": [0.63, 0.751]}}, files=[str(f), str(tmp_path / "missing.csv")])
    doc = runs.docs[0]
    assert rid == doc["_id"] and doc["objective"] == 1 and doc["metrics"]["f1"]["value"] == 0.695
    assert set(doc["git"]) == {"commit", "dirty"}
    assert doc["setup"]["embedder"] == "all-MiniLM-L6-v2" and doc["setup"]["extractor"] == "openai/gpt-oss-120b"
    assert [x["sha256"] for x in doc["files"]] == [hashlib.sha256(f.read_bytes()).hexdigest()]   # missing file skipped


def test_mongodb_off_is_only_not_saved(monkeypatch, capsys):
    def down():
        raise ConnectionError("no MongoDB")
    monkeypatch.setattr(ev, "_col", down)
    assert ev.record("x", objective=2, method="m", dataset={}, metrics={}) is None
    assert "not saved" in capsys.readouterr().out


def test_an_earlier_relation_model_check_can_be_added(runs):
    summaries = glob.glob(os.path.join(ev.REPO, "docs", "evidence", "relation_model", "reference_eval_*_set4.json"))
    assert summaries, "the run-6 summary should be in docs/evidence/relation_model"
    assert ev.reference_run(summaries[0])
    doc = runs.docs[0]
    assert doc["name"].startswith("Relation model on reference_pairs_v4") and doc["setup"] is None
    assert doc["verdict"].startswith("PASS") and "majority" in doc["metrics"]
