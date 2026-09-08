import pandas as pd
import re
from pathlib import Path

df = pd.read_csv("data/jobstreet_all_job_dataset.csv")
ict = df[df["category"].isin(["Information & Communication Technology", "Science & Technology"])]

print(f"Total ICT jobs analysed: {len(ict)}")

skill_terms = [
    "python", "java", "javascript", "typescript", "php", "ruby", "swift",
    "kotlin", "golang", "rust", "scala", "c#",
    "react", "angular", "vue", "node.js", "django", "flask", "spring",
    "laravel", "express", "html", "css", "android", "ios", "flutter",
    "react native", "rest api", "api",
    "sql", "mysql", "postgresql", "mongodb", "redis", "elasticsearch", "oracle",
    "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "jenkins",
    "linux", "cloud computing", "networking",
    "machine learning", "deep learning", "nlp", "tensorflow", "pytorch",
    "scikit-learn", "pandas", "numpy", "data analysis", "data science",
    "big data", "hadoop", "spark",
    "agile", "scrum", "devops", "ci/cd", "git", "software testing",
    "unit testing", "selenium", "design patterns", "microservices", "uml",
    "blockchain", "cyber security", "internet of things",
    "project management", "communication", "problem solving", "teamwork"
]

all_text = " ".join(ict["descriptions"].dropna().str.lower().tolist())

results = []
for term in skill_terms:
    pattern = r"\b" + re.escape(term) + r"\b"
    count = len(re.findall(pattern, all_text))
    results.append({"skill": term, "frequency": count})

results.sort(key=lambda x: -x["frequency"])

output_df = pd.DataFrame(results)
output_df["dataset"] = "JobStreet Malaysian ICT Jobs"
output_df["total_jobs_analysed"] = len(ict)
output_df["source_csv"] = "jobstreet_all_job_dataset.csv"
output_df.to_csv("data/skill_frequency_evidence.csv", index=False)

print("\nTop 20 skills by frequency:")
print(output_df.head(20).to_string(index=False))
print(f"\nEvidence saved to data/skill_frequency_evidence.csv")