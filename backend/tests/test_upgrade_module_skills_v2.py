"""Module skills brought up to prompt v2 (15 Oct): unreviewed modules get v2's skills (career-office additions kept);
reviewed modules are never changed, only suggestions written; resumable."""
import csv
import os
import sys
from datetime import datetime, timezone

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "scripts", "pipeline"))
import upgrade_module_skills_v2 as up  # noqa: E402

from app.models.module import Module, ModuleSkill  # noqa: E402


def test_unreviewed_replaced_reviewed_only_suggested(client, db, tmp_path, monkeypatch):
    db.rollback()
    for code in ("ZZ-V2-001", "ZZ-V2-002"):
        db.query(ModuleSkill).filter(ModuleSkill.module_code == code).delete()
        db.query(Module).filter(Module.code == code).delete()
    db.commit()
    a = Module(code="ZZ-V2-001", name="Penetration Testing", level=3, type="common",
               description="Penetration tests with Nmap or Metasploit.")
    b = Module(code="ZZ-V2-002", name="Penetration Testing 2", level=3, type="common",
               description="Penetration tests with Nmap or Metasploit.", skills_reviewed_at=datetime.now(timezone.utc))
    db.add_all([a, b]); db.flush()
    db.add_all([ModuleSkill(module_id=a.id, module_code=a.code, skill_name="Nmap scanning", extracted_by="gpt-oss-120b:descriptor-v1"),
                ModuleSkill(module_id=a.id, module_code=a.code, skill_name="Report writing", extracted_by="admin"),
                ModuleSkill(module_id=b.id, module_code=b.code, skill_name="Nmap", extracted_by="gpt-oss-120b:descriptor-v1")])
    db.commit()
    monkeypatch.setattr(up, "SUGGESTIONS_CSV", str(tmp_path / "s.csv"))
    monkeypatch.setattr(up, "SUGGESTIONS_DONE", str(tmp_path / "s.json"))
    monkeypatch.setattr(up.time, "sleep", lambda s: None)
    calls = []

    class Fake:
        model = "fake"

        def extract_from_module(self, m):
            calls.append(m["code"])
            return {"extracted_skills": ["Penetration testing", "Nmap", "Metasploit"]}
    monkeypatch.setattr(up, "SkillExtractor", Fake)
    # only our two modules: the rest of the test catalogue is left out of the plan
    real_plan = up.plan
    monkeypatch.setattr(up, "plan", lambda d: {k: [m for m in v if m.code.startswith("ZZ-V2")] for k, v in real_plan(d).items()})
    monkeypatch.setattr(sys, "argv", ["x"])
    up.main()
    db.expire_all()
    names = lambda mod: sorted((s.skill_name, s.extracted_by) for s in db.query(ModuleSkill).filter(ModuleSkill.module_id == mod.id))
    assert names(a) == [("Metasploit", up.MODULE_EXTRACTED_BY), ("Nmap", up.MODULE_EXTRACTED_BY),
                        ("Penetration testing", up.MODULE_EXTRACTED_BY), ("Report writing", "admin")]
    assert names(b) == [("Nmap", "gpt-oss-120b:descriptor-v1")]                 # reviewed: unchanged
    rows = list(csv.DictReader(open(tmp_path / "s.csv", encoding="utf-8-sig")))
    assert sorted(r["suggested skill (prompt v2)"] for r in rows) == ["Metasploit", "Penetration testing"]
    up.main()                                                                   # run again: nothing asked twice
    assert sorted(calls) == ["ZZ-V2-001", "ZZ-V2-002"]
