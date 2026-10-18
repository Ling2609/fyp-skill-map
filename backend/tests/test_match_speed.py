"""18 Oct (E5 response times, run 620b3ecd failed): match_matrix, similarity_matrix and prefetch_relations were made
faster (keys compared as numbers, one grouped numpy step instead of a loop over skills). The answers must be EXACTLY
the old ones, so step 4's ranking result still describes the app: the old code is kept here and compared on random
profiles and jobs, with the relationship model on and off."""
import numpy as np

from app.services import skill_profile as sp
from app.services import skill_relation


def old_match_matrix(job_vecs, sp_vecs, job_names, job_keys, spellings, spelling_keys, owner):
    """match_matrix as pushed in eca17c8."""
    n_grad = (max(owner) + 1) if len(owner) else 0
    if not len(job_vecs) or not len(sp_vecs):
        shape = (len(job_vecs), n_grad)
        return np.full(shape, -1.0), np.zeros(shape, dtype=bool)
    rows = job_vecs @ sp_vecs.T
    same = np.asarray(job_keys, dtype=object)[:, None] == np.asarray(spelling_keys, dtype=object)[None, :]
    rows[same] = 1.0
    if skill_relation.enabled():
        js, ss = np.nonzero((rows >= skill_relation.CANDIDATE_FLOOR) & ~same)
        p = skill_relation.p_satisfies([(spellings[s], job_names[j]) for j, s in zip(js, ss)])
        has_rows = same.copy()
        ok = p >= skill_relation.cutoff()
        has_rows[js[ok], ss[ok]] = True
    else:
        has_rows = rows >= sp.MATCH_THRESHOLD
    owner = np.asarray(owner)
    sims = np.full((rows.shape[0], n_grad), -1.0)
    has = np.zeros((rows.shape[0], n_grad), dtype=bool)
    for g in range(n_grad):
        cols = owner == g
        sims[:, g] = rows[:, cols].max(axis=1)
        has[:, g] = has_rows[:, cols].any(axis=1)
    return sims, has


def old_similarity_matrix(job_vecs, sp_vecs, job_keys, spelling_keys, owner):
    rows = job_vecs @ sp_vecs.T
    key_row = {k: r for r, k in enumerate(spelling_keys)}
    for j, k in enumerate(job_keys):
        r = key_row.get(k)
        if r is not None:
            rows[j, r] = 1.0
    owner = np.asarray(owner)
    sims = np.full((rows.shape[0], owner.max() + 1), -1.0)
    for g in range(sims.shape[1]):
        sims[:, g] = rows[:, owner == g].max(axis=1)
    return sims


def random_case(rng, n_grad, n_job):
    vocab = [f"skill {i}" for i in range(40)]
    keys = rng.choice(vocab, n_grad, replace=False)
    spellings, spelling_keys, owner = [], [], []
    for g, k in enumerate(keys):                                   # 1 to 3 spellings per skill, like profile_spellings
        for v in range(rng.integers(1, 4)):
            spellings.append(f"{k} v{v}")
            spelling_keys.append(str(k))
            owner.append(g)
    job_keys = [str(k) for k in rng.choice(vocab, n_job)]          # some held, some not, repeats allowed
    job_names = [f"{k} job" for k in job_keys]
    dim = 8
    # vectors near each other so many pairs pass the candidate floor
    base = rng.normal(size=dim)
    sv = sp.normalise_rows(base + 0.6 * rng.normal(size=(len(spellings), dim)))
    jv = sp.normalise_rows(base + 0.6 * rng.normal(size=(n_job, dim)))
    return jv, sv, job_names, job_keys, spellings, spelling_keys, owner


def fake_model(monkeypatch, on):
    monkeypatch.setattr(skill_relation, "enabled", lambda: on)
    monkeypatch.setattr(skill_relation, "cutoff", lambda: 0.6)
    # a fixed "probability" per pair, the same in old and new code
    monkeypatch.setattr(skill_relation, "p_satisfies", lambda pairs: np.array(
        [(hash(a + "|" + b) % 1000) / 1000 for a, b in pairs], dtype=float))


def test_same_answers_as_before(monkeypatch):
    rng = np.random.default_rng(7)
    for on in (True, False):
        fake_model(monkeypatch, on)
        for _ in range(200):
            case = random_case(rng, int(rng.integers(1, 30)), int(rng.integers(1, 25)))
            jv, sv, job_names, job_keys, spellings, spelling_keys, owner = case
            new_sims, new_has = sp.match_matrix(*case)
            old_sims, old_has = old_match_matrix(*case)
            assert np.array_equal(new_sims, old_sims) and np.array_equal(new_has, old_has)
            assert np.array_equal(sp.similarity_matrix(jv, sv, job_keys, spelling_keys, owner),
                                  old_similarity_matrix(jv, sv, job_keys, spelling_keys, owner))


def test_owner_not_in_order_and_empty(monkeypatch):
    fake_model(monkeypatch, False)
    rng = np.random.default_rng(1)
    jv, sv, job_names, job_keys, spellings, spelling_keys, owner = random_case(rng, 6, 5)
    perm = rng.permutation(len(owner))                             # spellings of one skill not side by side
    case = (jv, sv[perm], job_names, job_keys, [spellings[i] for i in perm], [spelling_keys[i] for i in perm],
            [owner[i] for i in perm])
    assert all(np.array_equal(a, b) for a, b in zip(sp.match_matrix(*case), old_match_matrix(*case)))
    empty = (np.zeros((0, 8)), sv, [], [], spellings, spelling_keys, owner)
    assert all(np.array_equal(a, b) for a, b in zip(sp.match_matrix(*empty), old_match_matrix(*empty)))


def test_prefetch_asks_the_same_pairs(monkeypatch):
    asked = []
    monkeypatch.setattr(skill_relation, "enabled", lambda: True)
    monkeypatch.setattr(skill_relation, "p_satisfies", lambda pairs: asked.append(list(pairs)))
    rng = np.random.default_rng(3)
    jobs, expected = [], []
    _, sv, _, _, spellings, spelling_keys, _ = random_case(rng, 10, 1)
    for _ in range(20):
        jv, _, names, keys, *_ = random_case(rng, 1, int(rng.integers(1, 15)))
        jobs.append((jv, keys, names))
        rows = jv @ sv.T
        same = np.asarray(keys, dtype=object)[:, None] == np.asarray(spelling_keys, dtype=object)[None, :]
        js, ss = np.nonzero((rows >= skill_relation.CANDIDATE_FLOOR) & ~same)
        expected.extend((spellings[s], names[j]) for j, s in zip(js, ss))
    sp.prefetch_relations(sv, spellings, spelling_keys, jobs)
    assert asked == [expected]
