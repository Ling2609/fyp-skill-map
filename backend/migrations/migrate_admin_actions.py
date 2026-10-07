"""
Run once to add the admin_actions table (7 Oct): the audit log of approve / reject / deactivate / reactivate, with
who, when and why. Running it twice changes nothing.
Usage (from backend/): python migrations/migrate_admin_actions.py
"""
import sys
sys.path.append(".")

from app.database import Base, engine
from app.models import user  # noqa: F401  (the table points at users)
from app.models.programme import AdminAction

Base.metadata.create_all(bind=engine, tables=[AdminAction.__table__])
print("Migration complete: admin_actions table ready.")
