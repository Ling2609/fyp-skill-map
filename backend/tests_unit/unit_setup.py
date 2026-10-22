"""
Unit tests (22 Oct, system testing): the rules SkillMap's answers rest on, tested as plain functions. No database,
no server, no AI model, no network: each test gives a function its input and checks the output.

Run from backend/ with the venv on:   python -m pytest tests_unit
(`python -m pytest` on its own runs these and the integration tests in tests/.)

The app reads its settings when it is imported, so harmless values are set first; nothing here connects to them.
(Not called conftest.py: tests/ imports its own conftest by name, and two files with that name would clash.)
"""
import os
import sys
import types
from pathlib import Path

# setdefault: when tests/ runs in the same session, its settings (the throwaway test database) are kept
for _k, _v in dict(DATABASE_URL="postgresql+psycopg2://unit:unit@localhost:1/unit_tests_no_database",
                   SECRET_KEY="unit-test-key-not-used-for-anything-real", MONGODB_URL="mongodb://localhost:1",
                   RELATION_MODEL_DIR="", GROQ_API_KEY="", GEMINI_API_KEY="", COHERE_API_KEY="", JSEARCH_KEY="").items():
    os.environ.setdefault(_k, _v)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# The sentence model is not needed by any rule tested here; a stand-in stops it loading
_stub = types.ModuleType("app.nlp.embedder")
_stub.get_embedder = lambda: None
sys.modules.setdefault("app.nlp.embedder", _stub)
