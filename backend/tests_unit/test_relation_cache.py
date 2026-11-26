"""26 Nov 2026 (deployment test): Job Matches failed with a 500 when the relationship score cache could not be written
(a read-only data folder). Saving the cache is now best effort: the scores stay in memory and no error reaches the
student."""
from app.services import skill_relation


def test_a_cache_that_cannot_be_written_does_not_raise(tmp_path, monkeypatch, capsys):
    # a path inside a folder that does not exist: open() fails with an OSError
    monkeypatch.setattr(skill_relation, "CACHE_FILE", str(tmp_path / "missing-folder" / "relation_cache.json"))
    monkeypatch.setattr(skill_relation, "_cache", {"python\x1fprogramming": 0.9})
    skill_relation._save_cache()                       # must not raise
    assert "could not save the score cache" in capsys.readouterr().out


def test_the_cache_is_saved_when_it_can_be(tmp_path, monkeypatch):
    path = tmp_path / "relation_cache.json"
    monkeypatch.setattr(skill_relation, "CACHE_FILE", str(path))
    monkeypatch.setattr(skill_relation, "_cache", {"python\x1fprogramming": 0.9})
    skill_relation._save_cache()
    assert path.exists() and "python" in path.read_text(encoding="utf-8")
