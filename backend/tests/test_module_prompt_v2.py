"""Module prompt v2 test round (15 Oct): new modules only, v1 and v2 extracted fresh, v2b adds O*NET tool names,
paired comparison with the pass rule fixed before results; v2 passed on 15 Oct and is the app default."""
import os
import sys

import pytest

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "scripts", "evaluation"))
pytest.importorskip("spacy")
import evaluate_module_prompt_v2 as v2  # noqa: E402


def test_app_uses_v2_and_v1_is_kept_for_the_evaluations(monkeypatch):
    from app.nlp import skill_extractor as se
    sent = []
    monkeypatch.setattr(se.SkillExtractor, "__init__", lambda self: None)
    monkeypatch.setattr(se.SkillExtractor, "_call_groq", lambda self, system, prompt: sent.append(prompt) or ["x"])
    ex = se.SkillExtractor()
    mod = {"code": "X", "name": "Penetration Testing", "description": "Nmap or Metasploit."}
    ex.extract_from_module(mod, version="v1")
    ex.extract_from_module(mod)                          # 15 Oct: v2 passed its test, so it is the default
    assert "Fewer is better" in sent[0] and "main subject" in sent[1] and "list both" in sent[1]
    assert se.MODULE_EXTRACTED_BY == se.MODULE_EXTRACTED_BY_V2


def test_new_round_extracts_both_and_scores_v1_v2_v2b(tmp_path, monkeypatch):
    for attr in ("OUT", "load", "QWEN_PROMPT"):
        monkeypatch.setattr(v2.e1, attr, getattr(v2.e1, attr))
    monkeypatch.setattr(v2.me, "MODULE_GUIDE", v2.me.MODULE_GUIDE)
    monkeypatch.setattr(v2, "OUT", str(tmp_path))
    v2.use_files()
    mods = [{"job_ref": f"IT-L3-0{i}", "title": "Penetration Testing", "subcategory": "IT", "level": 3,
             "text": "Penetration tests with Nmap and Metasploit, and writing reports."} for i in range(6)]
    v2.e1.save("modules.json", mods)
    from app.nlp import skill_extractor as se
    monkeypatch.setattr(se.SkillExtractor, "__init__", lambda self: None)
    answers = {"v1": ["Nmap scanning", "penetration test reporting"], "v2": ["Penetration testing", "Nmap", "Penetration test reporting"]}
    monkeypatch.setattr(se.SkillExtractor, "extract_from_module",
                        lambda self, m, version="v1": {"extracted_skills": answers[version]})
    v2.extract(pause=0)
    ext = v2.e1.load("module_extractions.json")
    assert ext["IT-L3-00"]["v2"]["extracted_by"] == "gpt-oss-120b:descriptor-v2"
    v2.e1.save("answer_key.json", {m["job_ref"]: ["Penetration testing", "Nmap", "Metasploit", "Penetration test reporting"] for m in mods})
    onet = tmp_path / "onet.csv"
    onet.write_text("O*NET-SOC Code,Title,Workplace Example,Element ID,Element Name,Hot Technology,In Demand\n"
                    "1,x,Metasploit,2,y,N,N\n1,x,Nmap,2,y,N,N\n")
    monkeypatch.setattr(v2.sb, "ONET", str(onet))
    runs = []
    import app.services.evaluation_runs as ev
    monkeypatch.setattr(ev, "record", lambda name, **k: runs.append((name, k)))
    v2.score()
    text = open(tmp_path / "scores.txt").read()
    assert "v2b" in text and "Decision by the rule" in text
    f1 = {n.split()[3]: k["metrics"]["f1"]["value"] for n, k in runs}
    assert f1["v1"] < f1["v2"] < f1["v2b"] == 1.0      # v2b adds Metasploit from the O*NET list
