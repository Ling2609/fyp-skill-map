"""
SBERT Embedder
==============
Generates sentence embeddings using all-MiniLM-L6-v2.
Used for semantic similarity matching between graduate
skill profiles and job descriptions.

Usage:
    from app.nlp.embedder import get_embedder
    embedder = get_embedder()                      # one shared model for the whole app
    vecs = embedder.embed_cached(["Python", "SQL"])  # fast: reuses saved vectors
    vector = embedder.embed("Python programming SQL database")

Why embed_cached exists:
    The same text always gives the same vector, so there is no need to compute it twice.
    Vectors are kept in memory and saved to data/embedding_cache.npz, so after the first
    run a restart (or uvicorn --reload after a code change) loads them in about a second
    instead of re-embedding ~2,400 jobs.
"""

import json
import os
import threading
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

MODEL_NAME = "all-MiniLM-L6-v2"
CACHE_FILE = Path(__file__).resolve().parents[2] / "data" / "embedding_cache.npz"


class Embedder:
    def __init__(self, use_disk_cache: bool = True):
        self.model = SentenceTransformer(MODEL_NAME)
        self._cache: dict[str, np.ndarray] = {}
        self._lock = threading.Lock()
        self._use_disk_cache = use_disk_cache
        if use_disk_cache:
            self._load_cache()
        print(f"Embedder loaded: {MODEL_NAME} ({len(self._cache)} cached vectors)")

    # ── Plain embedding (no cache) ────────────────────────────────────────────
    # The model is shared by parallel requests; its tokenizer isn't safe to use from two
    # threads at once, so every model call goes through the same lock.
    def embed(self, text: str) -> np.ndarray:
        """Embed a single text string into a 384-dim vector."""
        with self._lock:
            return self.model.encode(text, convert_to_numpy=True)

    def embed_batch(self, texts: list[str]) -> np.ndarray:
        """Embed a list of texts — faster than one by one."""
        with self._lock:
            return self.model.encode(texts, convert_to_numpy=True, show_progress_bar=False)

    def similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Cosine similarity between two vectors. Returns float 0-1."""
        dot = np.dot(vec1, vec2)
        norm = np.linalg.norm(vec1) * np.linalg.norm(vec2)
        if norm == 0:
            return 0.0
        return float(dot / norm)

    # ── Cached embedding ──────────────────────────────────────────────────────
    def embed_cached(self, texts: list[str]) -> np.ndarray:
        """Same result as embed_batch, but only texts never seen before go through the model
        (all of them together in one batch). Returns an (N, 384) array in the same order."""
        if not texts:
            return np.zeros((0, 384), dtype=np.float32)
        with self._lock:
            missing = list(dict.fromkeys(t for t in texts if t not in self._cache))
            if missing:
                vecs = self.model.encode(missing, convert_to_numpy=True,
                                         batch_size=128, show_progress_bar=len(missing) > 500)
                for t, v in zip(missing, vecs):
                    self._cache[t] = v.astype(np.float32)
                if self._use_disk_cache:
                    self._save_cache()
            return np.stack([self._cache[t] for t in texts])

    def _load_cache(self):
        try:
            with np.load(CACHE_FILE, allow_pickle=False) as data:
                if str(data["model"]) != MODEL_NAME:   # e.g. after fine-tuning (B5): start fresh
                    return
                texts = json.loads(str(data["texts"]))
                self._cache = dict(zip(texts, data["vectors"]))
        except FileNotFoundError:
            self._cache = {}
        except Exception as e:   # damaged/old-format file: ignore it, it gets rebuilt
            print(f"Embedding cache unreadable ({type(e).__name__}), rebuilding it")
            self._cache = {}

    def _save_cache(self):
        """Best effort: a failed save (e.g. Windows antivirus holding the file) must never
        break a request, the vectors are already in memory and will be saved next time."""
        try:
            texts = list(self._cache)
            CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
            tmp = CACHE_FILE.with_name("embedding_cache.tmp.npz")
            # Texts stored as one JSON string: a numpy string array pads every text to the
            # longest one, which makes the file balloon
            np.savez(tmp, model=np.array(MODEL_NAME), texts=np.array(json.dumps(texts)),
                     vectors=np.stack([self._cache[t] for t in texts]))
            os.replace(tmp, CACHE_FILE)   # write-then-rename, so a crash never leaves a broken file
        except Exception as e:
            print(f"Could not save embedding cache ({type(e).__name__}: {e}); will retry later")


_shared: Embedder | None = None
_shared_lock = threading.Lock()


def get_embedder() -> Embedder:
    """One shared Embedder for the whole app (loading the model twice wastes time and memory)."""
    global _shared
    with _shared_lock:
        if _shared is None:
            _shared = Embedder()
        return _shared
