"""
Academic structure, kept by Admin (the career office), 7 Oct: programmes, their intakes, and which modules each
programme teaches in which year. Scope: one university; the prototype has one programme (a representative APU BSc
Software Engineering, data/modules.json). A module can belong to several programmes (programme_modules).
Students pick programme + intake in a one-step setup after registration (references.md, "Programme + intake").
"""
from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.sql import func

from app.database import Base
from app.models import module  # noqa: F401  (programme_modules points at modules)


class Programme(Base):
    __tablename__ = "programmes"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, nullable=False)       # e.g. "SE"
    name = Column(String(120), nullable=False)                   # e.g. "BSc (Hons) Software Engineering"
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Intake(Base):
    __tablename__ = "intakes"

    id = Column(Integer, primary_key=True, index=True)
    programme_id = Column(Integer, ForeignKey("programmes.id", ondelete="CASCADE"), nullable=False, index=True)
    code = Column(String(30), unique=True, nullable=False)       # the university's own intake code
    start_date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ProgrammeModule(Base):
    __tablename__ = "programme_modules"

    id = Column(Integer, primary_key=True, index=True)
    programme_id = Column(Integer, ForeignKey("programmes.id", ondelete="CASCADE"), nullable=False, index=True)
    module_id = Column(Integer, ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    year = Column(Integer, nullable=False)                       # year of study the module is taken in

    __table_args__ = (UniqueConstraint("programme_id", "module_id", name="uq_programme_module"),)
