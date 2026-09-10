"""
SBERT Embedder
==============
Generates sentence embeddings using all-MiniLM-L6-v2.
Used for semantic similarity matching between graduate
skill profiles and job descriptions.

Usage:
    from app.nlp.embedder import Embedder
    embedder = Embedder()
    vector = embedder.embed("Python programming SQL database")
    score = embedder.similarity(vec1, vec2)
"""

from sentence_transformers import SentenceTransformer
import numpy as np


class Embedder:
    def __init__(self):
        self.model = SentenceTransformer("all-MiniLM-L6-v2")
        print("Embedder loaded: all-MiniLM-L6-v2")

    def embed(self, text: str) -> np.ndarray:
        """Embed a single text string into a 384-dim vector."""
        return self.model.encode(text, convert_to_numpy=True)

    def embed_batch(self, texts: list[str]) -> np.ndarray:
        """Embed a list of texts — faster than one by one."""
        return self.model.encode(texts, convert_to_numpy=True, show_progress_bar=False)

    def similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Cosine similarity between two vectors. Returns float 0-1."""
        dot = np.dot(vec1, vec2)
        norm = np.linalg.norm(vec1) * np.linalg.norm(vec2)
        if norm == 0:
            return 0.0
        return float(dot / norm)