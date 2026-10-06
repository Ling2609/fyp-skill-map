"""
Skill relationship model in the app (Stage 2, 6 Oct): does the student's skill cover the job's skill?

The trained cross-encoder (scripts/skill_relations/train_relation_model.ipynb) reads "student skill -> job skill"
and gives p_satisfies = P(SAME or NARROWER), i.e. the student's skill is the job's skill or a more specific one.
On both blind test sets it gave far fewer false "has it" than the cosine >= 0.7 rule (references.md, "Relationship
model vs the live rule").

How matching uses it (app/services/skill_profile.py, match_matrix):
  1. same skill (A8 canonical key)                    -> has it, no model needed
  2. SBERT cosine >= CANDIDATE_FLOOR (0.55)           -> the model decides: p_satisfies >= SATISFIES_CUTOFF
  3. cosine below the floor                           -> a gap
SBERT picks the candidates and the model re-ranks them ("retrieve, then re-rank": Nogueira & Cho 2019). On both
blind sets no real match had a cosine below 0.55 (lowest 0.551), so the floor loses no tested match.

Off unless RELATION_MODEL_DIR is set in backend/.env (e.g. data/relation_model_esco_onet_v1_skillmap_v2_nli_rw3x20).
Off, or the folder missing, = the old rule (cosine >= 0.7), so the app never breaks because of the model.

Every scored pair is kept in data/relation_cache.json (not in git, like embedding_cache.npz), shared by all
students: module skills repeat across students and job skills across jobs, so after the first pages almost every
pair is already known. The cache is tied to the model folder name: a new model starts a new cache.
"""
import json
import os
import threading

import numpy as np

from app.config import settings

CANDIDATE_FLOOR = 0.55     # below: never the same skill on either blind set; the model is not asked
CACHE_FILE = "data/relation_cache.json"
BATCH = 64
MAX_LEN = 64
SATISFIES = 0              # class order of the training notebook: SATISFIES, RELATED, NOT

_lock = threading.Lock()
_model = None              # (tokeniser, model) once loaded; False = could not load (use the cosine rule)
_cache: dict[str, float] | None = None
_cache_model = None


def model_dir() -> str:
    return (settings.relation_model_dir or "").strip()


def cutoff() -> float:
    return settings.relation_cutoff


def _load():
    """Load the model once. Any problem = False (the cosine rule is used), with one line in the server log."""
    global _model
    if _model is not None:
        return _model
    path = model_dir()
    if not path:
        _model = False
        return _model
    if not os.path.isfile(os.path.join(path, "config.json")):
        print(f"[relation] RELATION_MODEL_DIR={path} has no config.json: using the cosine >= 0.7 rule")
        _model = False
        return _model
    try:
        from transformers import AutoModelForSequenceClassification, AutoTokenizer
        tok = AutoTokenizer.from_pretrained(path)
        model = AutoModelForSequenceClassification.from_pretrained(path).eval()
        _model = (tok, model)
        print(f"[relation] model loaded: {os.path.basename(os.path.normpath(path))}, cut-off {cutoff()}")
    except Exception as e:                      # a broken download must not take the app down
        print(f"[relation] could not load {path}: {type(e).__name__}: {e}. Using the cosine >= 0.7 rule")
        _model = False
    return _model


def enabled() -> bool:
    with _lock:
        return bool(_load())


def _key(a: str, b: str) -> str:
    return f"{a.strip().lower()}\x1f{b.strip().lower()}"


def _load_cache():
    global _cache, _cache_model
    name = os.path.basename(os.path.normpath(model_dir()))
    if _cache is not None and _cache_model == name:
        return
    _cache, _cache_model = {}, name
    try:
        with open(CACHE_FILE, encoding="utf-8") as f:
            saved = json.load(f)
        if saved.get("model") == name:          # another model's scores are useless: start again
            _cache = saved.get("pairs", {})
    except (OSError, ValueError):
        pass


def _save_cache():
    tmp = CACHE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"model": _cache_model, "pairs": _cache}, f)
    os.replace(tmp, CACHE_FILE)                 # never a half-written cache


def _score(a: list[str], b: list[str]) -> np.ndarray:
    """p_satisfies for each pair a[i] -> b[i] (same as evaluate_reference.py: softmax over the 3 classes)."""
    import torch
    tok, model = _model
    out = []
    with torch.no_grad():
        for i in range(0, len(a), BATCH):
            batch = tok(a[i:i + BATCH], b[i:i + BATCH], padding=True, truncation=True, max_length=MAX_LEN,
                        return_tensors="pt")
            out.append(torch.softmax(model(**batch).logits, dim=-1)[:, SATISFIES])
    return torch.cat(out).numpy() if out else np.zeros(0)


def p_satisfies(pairs: list[tuple[str, str]]) -> np.ndarray:
    """P(the student's skill a covers the job's skill b) for each (a, b); cached pairs are not scored again.
    Call only when enabled()."""
    with _lock:
        if not _load():
            raise RuntimeError("relationship model is off: check enabled() first")
        _load_cache()
        todo = sorted({_key(a, b): (a, b) for a, b in pairs if _key(a, b) not in _cache}.values())  # once per pair,
        # whatever the capitals ("Python -> SQL" and "python -> sql" are one pair)
        if todo:
            probs = _score([a for a, _ in todo], [b for _, b in todo])
            for (a, b), p in zip(todo, probs):
                _cache[_key(a, b)] = round(float(p), 4)
            _save_cache()
            print(f"[relation] scored {len(todo)} new pairs (cache {len(_cache)})")
        return np.array([_cache[_key(a, b)] for a, b in pairs], dtype=float)
