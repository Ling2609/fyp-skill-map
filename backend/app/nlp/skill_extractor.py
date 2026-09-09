"""
Skill Extractor
===============
Uses spaCy PhraseMatcher to extract skills from text
against the ESCO-based skill taxonomy.

Usage:
    from app.nlp.skill_extractor import SkillExtractor
    extractor = SkillExtractor()
    skills = extractor.extract("Python programming and SQL database design")
"""

import json
import spacy
from spacy.matcher import PhraseMatcher
from pathlib import Path


class SkillExtractor:
    def __init__(self, taxonomy_path: str = "data/skill_taxonomy.json"):
        # Load spaCy model
        self.nlp = spacy.load("en_core_web_sm")

        # Load taxonomy
        taxonomy_file = Path(taxonomy_path)
        if not taxonomy_file.exists():
            raise FileNotFoundError(f"Taxonomy not found at {taxonomy_path}")

        with open(taxonomy_file, "r", encoding="utf-8") as f:
            self.taxonomy = json.load(f)

        # Build lookup: normalised term → skill entry
        # Priority: exact name > short name > alias (first match wins)
        self.skill_lookup = {}

        def add_term(term, skill):
            term = term.strip().lower()
            if len(term) > 1 and term not in self.skill_lookup:
                self.skill_lookup[term] = skill

        for skill in self.taxonomy:
            # Full name — highest priority
            add_term(skill["name"], skill)

            # Short name from bracketed ESCO names
            # e.g. "Python (computer programming)" → "python"
            name = skill["name"]
            if "(" in name:
                short = name[:name.index("(")].strip()
                add_term(short, skill)

            # Aliases — ESCO uses | as separator
            for alias_group in skill.get("aliases", []):
                for alias in alias_group.split("|"):
                    add_term(alias, skill)

        # Build PhraseMatcher from all known terms
        self.matcher = PhraseMatcher(self.nlp.vocab, attr="LOWER")
        patterns = []
        for term in self.skill_lookup:
            doc = self.nlp.make_doc(term)
            patterns.append(doc)
        self.matcher.add("SKILLS", patterns)

        print(f"SkillExtractor loaded: {len(self.taxonomy)} skills, "
              f"{len(self.skill_lookup)} terms (including aliases)")

    def extract(self, text: str) -> list[dict]:
        """
        Extract skills from text.
        Returns list of matched skill entries (deduplicated).
        """
        if not text or not text.strip():
            return []

        doc = self.nlp(text.lower())
        matches = self.matcher(doc)

        seen_ids = set()
        results = []

        for _, start, end in matches:
            span_text = doc[start:end].text.lower()
            skill = self.skill_lookup.get(span_text)
            if skill and skill["skill_id"] not in seen_ids:
                seen_ids.add(skill["skill_id"])
                results.append({
                    "skill_id": skill["skill_id"],
                    "name": skill["name"],
                    "category": skill["category"],
                    "jobstreet_frequency": skill["jobstreet_frequency"],
                    "esco_uri": skill["esco_uri"],
                })

        # Sort by market frequency descending
        results.sort(key=lambda x: -x["jobstreet_frequency"])
        return results

    def extract_from_module(self, module: dict) -> dict:
        """
        Extract skills from a module dict (from modules.json).
        Combines module name + description for extraction.
        """
        text = f"{module.get('name', '')} {module.get('description', '')}"
        skills = self.extract(text)
        return {
            "module_code": module.get("code"),
            "module_name": module.get("name"),
            "level": module.get("level"),
            "extracted_skills": skills,
            "skill_count": len(skills),
        }