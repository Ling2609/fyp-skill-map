"""
Test JobRecommender.
Run from backend/ folder:
    python data/scripts/test_recommender.py
"""
import sys
sys.path.append(".")

from app.nlp.recommender import JobRecommender

recommender = JobRecommender()

# Test with a Python/data science skill profile
skills = [
    "Python programming", "SQL querying", "Data visualization",
    "Machine learning fundamentals", "Pandas data analysis",
    "Statistical analysis", "NumPy arrays"
]

print("\n── Job Recommendations for Data Science profile ──")
results = recommender.recommend(skills, top_n=5)
for i, job in enumerate(results, 1):
    print(f"\n{i}. {job['job_title']} @ {job['company']}")
    print(f"   Match: {job['match_percent']}%")
    print(f"   Location: {job['location']}")

# Test with a DevOps profile
skills2 = [
    "Docker containerization", "Kubernetes orchestration",
    "CI/CD pipeline design", "AWS cloud deployment",
    "Bash scripting", "Git version control"
]

print("\n── Job Recommendations for DevOps profile ──")
results2 = recommender.recommend(skills2, top_n=5)
for i, job in enumerate(results2, 1):
    print(f"\n{i}. {job['job_title']} @ {job['company']}")
    print(f"   Match: {job['match_percent']}%")
    print(f"   Location: {job['location']}")