"""
Job Recommender
===============
Matches a graduate skill profile against job postings
using SBERT cosine similarity.

Usage:
    from app.nlp.recommender import JobRecommender
    recommender = JobRecommender()
    results = recommender.recommend(skills=["Python", "SQL"], top_n=10)
"""

import pandas as pd
import numpy as np
from pathlib import Path
from app.nlp.embedder import Embedder


class JobRecommender:
    def __init__(self, jobs_path: str = "data/jobstreet_clean.csv"):
        self.embedder = Embedder()
        self.jobs_path = jobs_path
        self.jobs_df = None
        self.job_embeddings = None
        self._load_jobs()

    def _load_jobs(self):
        """Load and embed job descriptions."""
        print("Loading job data...")
        path = Path(self.jobs_path)
        if not path.exists():
            raise FileNotFoundError(f"Job data not found at {self.jobs_path}")

        self.jobs_df = pd.read_csv(self.jobs_path)
        print(f"  Loaded {len(self.jobs_df)} jobs")

        print("Embedding job descriptions (this may take a minute)...")
        # Combine job title + description for richer embedding
        texts = (
            self.jobs_df["job_title"].fillna("") + " " +
            self.jobs_df["descriptions"].fillna("")
        ).tolist()

        # Truncate to 512 chars to keep embedding fast
        texts = [t[:512] for t in texts]
        self.job_embeddings = self.embedder.embed_batch(texts)
        print(f"  Embedded {len(self.job_embeddings)} jobs")

    def recommend(self, skills: list[str], top_n: int = 10) -> list[dict]:
        """
        Given a list of skills, return top N matching jobs.

        Args:
            skills: list of skill strings from graduate profile
            top_n: number of jobs to return

        Returns:
            list of job dicts with match_score
        """
        if not skills:
            return []

        # Build graduate profile text from skills
        profile_text = " ".join(skills)
        profile_vec = self.embedder.embed(profile_text)

        # Compute cosine similarity against all jobs
        scores = []
        for i, job_vec in enumerate(self.job_embeddings):
            score = self.embedder.similarity(profile_vec, job_vec)
            scores.append((i, score))

        # Sort by score descending
        scores.sort(key=lambda x: -x[1])
        top = scores[:top_n]

        # Build result list
        results = []
        for idx, score in top:
            row = self.jobs_df.iloc[idx]
            results.append({
                "job_id": str(row.get("job_id", "")),
                "job_title": row.get("job_title", ""),
                "company": row.get("company", ""),
                "location": row.get("location", ""),
                "category": row.get("category", ""),
                "subcategory": row.get("subcategory", ""),
                "salary": row.get("salary", ""),
                "match_score": round(score, 4),
                "match_percent": round(score * 100, 1),
            })

        return results