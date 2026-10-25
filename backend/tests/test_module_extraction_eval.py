"""E1 modules (15 Oct): the job-ad method reused for modules: three labellers, 2-of-3 answer key, spot-check,
scored with the same grouping; files go to their own folder and the job-ad files are never touched."""
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "scripts", "evaluation"))
import evaluate_module_skill_extraction as me  # noqa: E402


def test_label_merge_and_score_on_modules(tmp_path, monkeypatch):
    for attr in ("OUT", "load", "QWEN_PROMPT"):
        monkeypatch.setattr(me.e1, attr, getattr(me.e1, attr))       # undone after the test
    monkeypatch.setattr(me, "OUT", str(tmp_path))
    me.use_module_files()
    mods = [{"job_ref": f"SE-L1-00{i}", "title": "Database Systems", "subcategory": "SE", "level": 1,
             "text": "Students learn SQL querying, database normalisation and ER modelling."} for i in range(6)]
    me.e1.save("modules.json", mods)
    prompts = []
    for who, skills in (("qwen", ["SQL querying", "Database normalisation", "ER modelling"]),
                        ("gemini", ["SQL", "Normalization", "Teamwork"])):
        me.e1.label(who, lambda p, s=skills: prompts.append(p) or s, pause=0)
    me.e1.save("answer_key_claude.json", {m["job_ref"]: ["SQL querying", "ER modelling"] for m in mods})
    me.e1.merge()
    key = me.e1.load("answer_key.json")
    assert sorted(key["SE-L1-000"]) == ["ER modelling", "SQL querying"]      # listed by 2 of 3
    assert "university module" in prompts[0] and "Database Systems" in prompts[0]     # the module guide, not the job one
    me.e1.save("module_extractions.json", {m["job_ref"]: {"skills": ["SQL querying", "ER modelling", "Java"],
                                                          "extracted_by": "gpt-oss-120b:descriptor-v1"} for m in mods})
    runs = []
    import app.services.evaluation_runs as ev
    monkeypatch.setattr(ev, "record", lambda name, **k: runs.append((name, k)))
    me.score()
    m = runs[0][1]["metrics"]
    assert (m["tp"], m["fp"], m["fn"]) == (12, 6, 0)
    assert runs[0][0] == "E1 module extraction"
    assert "6 modules" in open(tmp_path / "scores.txt").read()
    assert not os.path.exists(tmp_path / "ads.json")
