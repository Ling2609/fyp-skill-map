"""
JobStreet Data Cleaner
======================
Cleans the raw JobStreet CSV for use in skill extraction and matching.

Steps:
  1. Filter to ICT category only
  2. Remove HTML tags from descriptions
  3. Remove special characters and normalise whitespace
  4. Remove duplicates
  5. Remove rows with empty descriptions
  6. Save cleaned CSV

Usage:
  cd backend
  python data/scripts/clean_jobstreet.py
"""

import pandas as pd
import re
from pathlib import Path

def remove_html(text):
    if pd.isna(text):
        return ""
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', ' ', str(text))
    # Remove HTML entities
    text = re.sub(r'&[a-zA-Z]+;', ' ', text)
    text = re.sub(r'&#\d+;', ' ', text)
    return text

def clean_text(text):
    if not text:
        return ""
    # Normalise whitespace
    text = re.sub(r'\s+', ' ', text)
    # Remove non-ASCII characters
    text = re.sub(r'[^\x00-\x7F]+', ' ', text)
    # Remove excessive punctuation
    text = re.sub(r'[^\w\s\.\,\!\?\-\(\)\/\+\#]', ' ', text)
    # Final whitespace normalisation
    text = text.strip()
    return text

def clean_jobstreet(input_path: str, output_path: str):
    print("=" * 60)
    print("JobStreet Data Cleaner")
    print("=" * 60)

    # Load
    print("\nStep 1: Loading data...")
    df = pd.read_csv(input_path)
    print(f"  Total rows: {len(df)}")

    # Filter ICT only
    print("\nStep 2: Filtering ICT category...")
    df = df[df["category"] == "Information & Communication Technology"].copy()
    print(f"  ICT rows: {len(df)}")

    # Remove HTML from descriptions
    print("\nStep 3: Removing HTML tags...")
    df["descriptions"] = df["descriptions"].apply(remove_html)

    # Clean text
    print("\nStep 4: Cleaning text...")
    df["descriptions"] = df["descriptions"].apply(clean_text)
    df["job_title"] = df["job_title"].apply(clean_text)
    df["company"] = df["company"].apply(clean_text)

    # Remove empty descriptions
    print("\nStep 5: Removing empty descriptions...")
    before = len(df)
    df = df[df["descriptions"].str.len() > 50].copy()
    print(f"  Removed {before - len(df)} rows with empty/short descriptions")

    # Remove duplicates
    print("\nStep 6: Removing duplicates...")
    before = len(df)
    df = df.drop_duplicates(subset=["descriptions"]).copy()
    print(f"  Removed {before - len(df)} duplicate rows")

    # Reset index
    df = df.reset_index(drop=True)

    # Save
    print("\nStep 7: Saving cleaned data...")
    Path(output_path).parent.mkdir(exist_ok=True)
    df.to_csv(output_path, index=False)
    print(f"  Saved to {output_path}")
    print(f"  Final rows: {len(df)}")

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  Original ICT jobs: 8,675")
    print(f"  Cleaned ICT jobs:  {len(df)}")
    print(f"  Columns: {df.columns.tolist()}")
    print(f"\nSample cleaned description:")
    print(f"  {df['descriptions'].iloc[0][:200]}...")

if __name__ == "__main__":
    clean_jobstreet(
        input_path="data/jobstreet_all_job_dataset.csv",
        output_path="data/jobstreet_clean.csv"
    )