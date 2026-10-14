"""
Count the rows in every table, to show an upgrade lost nothing (14 Oct audit: "verify an existing database
upgrades safely"). Run it before and after the migrations on the same database and compare the two files.

Usage (from backend/):  python scripts/tools/count_rows.py > before.txt
"""
import sys
sys.path.insert(0, ".")

from sqlalchemy import inspect, text
from app.database import engine

with engine.connect() as conn:
    print(f"database: {engine.url.database}")
    for table in sorted(inspect(engine).get_table_names()):
        n = conn.execute(text(f'SELECT count(*) FROM "{table}"')).scalar()
        print(f"{table:32} {n}")
