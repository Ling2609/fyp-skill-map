"""E2 ranking evaluation (15 Oct): profiles ranked through the app's own code inside a rolled-back transaction (no
student saved), keyword baselines, pooled blind judging, median grades, nDCG@10 / P@10 and the paired rule."""
import json
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "scripts", "evaluation"))
import evaluate_ranking as er  # noqa: E402

from conftest import sql  # noqa: E402


def test_rank_judge_merge_score(client, users, db, tmp_path, monkeypatch):
    employer = users.employer()
    refs = {}
    for title, skills in (("Graduate Python Developer", ("Python", "SQL")), ("Senior Java Architect", ("Java", "Kubernetes")),
                          ("Junior Network Engineer", ("Routing", "Subnetting"))):
        r = client.post("/employer/jobs", headers=users.h(employer), json={
            "title": title, "location": "Kuala Lumpur", "salary": "", "category": "Developers/Programmers",
            "description": "We build services every day for customers. " * 3,
            "skills": [{"name": s, "level": "required", "quote": "", "group": ""} for s in skills], "soft": []})
        assert r.status_code == 200, r.text
        refs[title] = r.json()["job_ref"]
    # SE's first module gets two skills, so the SE profile has Python and SQL
    mod = sql(db, "select m.id, m.code from modules m join programme_modules pm on pm.module_id = m.id "
                  "join programmes p on p.id = pm.programme_id where p.code = 'SE' and pm.kind <> 'elective' "
                  "order by pm.year, m.code limit 1").first()
    for s in ("Python", "SQL"):
        sql(db, "insert into module_skills (module_id, module_code, skill_name, extracted_by) values (:i, :c, :s, 't')",
            i=mod.id, c=mod.code, s=s)
    before = sql(db, "select count(*) from users").scalar()
    monkeypatch.setattr(er, "OUT", str(tmp_path))
    monkeypatch.setattr(er, "PROGRAMMES", ("SE", "IT"))
    er.rank()
    assert sql(db, "select count(*) from users").scalar() == before          # the temporary students were rolled back
    ranks = json.loads((tmp_path / "rankings.json").read_text())
    se = ranks["orders"]["SE"]
    assert set(se) == {"S", "B1", "B2", "R"}
    judging = json.loads((tmp_path / "judging.json").read_text())
    assert "S" not in json.dumps(judging["pairs"][0]) or "system" not in judging["pairs"][0]    # blind
    pairs = [x["pair"] for x in judging["pairs"]]
    py, java = refs["Graduate Python Developer"], refs["Senior Java Architect"]
    assert se["B1"].index(py) < se["B1"].index(java)                          # keyword match: Python job above Java for SE
    python_job = [f"SE|{py}"]
    for who in er.JUDGES:                                                      # three judges agree: only the Python job fits SE
        (tmp_path / f"grades_{who}.json").write_text(json.dumps({p: (2 if p in python_job else 0) for p in pairs}))
    er.merge()
    rows = (tmp_path / "spot_check.csv").read_text(encoding="utf-8-sig")
    assert "your_check" in rows
    runs = []
    import app.services.evaluation_runs as ev
    monkeypatch.setattr(ev, "record", lambda name, **k: runs.append(k))
    er.score()
    m = runs[0]["metrics"]
    assert 0 <= m["S"]["ndcg10"] <= 1 and "S_minus_B1" in m
    assert "nDCG@10" in (tmp_path / "scores.txt").read_text()


def test_ndcg_and_precision():
    grades = {"P|a": 2, "P|b": 0, "P|c": 1}
    assert er.ndcg(["a", "c", "b"], grades, "P") == 1.0
    assert er.ndcg(["b", "c", "a"], grades, "P") < er.ndcg(["a", "b", "c"], grades, "P")
    assert er.p_at_k(["a", "b", "c"], grades, "P") == 0.1                      # 1 good fit in a top 10
