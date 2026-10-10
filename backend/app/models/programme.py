"""
Academic structure, kept by Admin (the career office), 7 Oct: programmes, their intakes, and which modules each
programme teaches in which year. Scope: one university; since 10 Oct the 17 computing programmes of APU's July 2026
brochure (data/programmes.json, modules in data/modules.json). A module can belong to several programmes
(programme_modules), with its own year and kind in each (e.g. Mathematical Concepts for Computing is common in IT,
specialised in SE).
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
    code = Column(String(30), unique=True, nullable=False)       # the university's own intake code (Year 1's)
    start_date = Column(Date, nullable=True)
    # 10 Oct: APU gives each year of study its own code (APU1F2409CS(DA), APU2F…, APU3F…), and the month can shift
    # between years, so the admin may list the group's later codes here (comma-separated); students find their intake
    # by the code on their current timetable
    other_codes = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ProgrammeModule(Base):
    __tablename__ = "programme_modules"

    id = Column(Integer, primary_key=True, index=True)
    programme_id = Column(Integer, ForeignKey("programmes.id", ondelete="CASCADE"), nullable=False, index=True)
    module_id = Column(Integer, ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    year = Column(Integer, nullable=False)                       # year of study the module is taken in
    kind = Column(String(12), nullable=False, default="common")  # common / specialised / elective, in this programme

    __table_args__ = (UniqueConstraint("programme_id", "module_id", name="uq_programme_module"),)


class IntakeModule(Base):
    """10 Oct: each intake has its own module list (references.md "Module lists per intake"): a student follows the
    list of the intake they joined. A new intake starts as a copy of the latest intake's list (a "rollover"), then only
    what is new is changed; editing one intake never changes another. A module's description and skills stay one per
    module; only membership, year and kind belong to the intake. programme_modules is kept as the programme's starting
    list, copied into its first intake."""
    __tablename__ = "intake_modules"

    id = Column(Integer, primary_key=True, index=True)
    intake_id = Column(Integer, ForeignKey("intakes.id", ondelete="CASCADE"), nullable=False, index=True)
    module_id = Column(Integer, ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    year = Column(Integer, nullable=False)
    kind = Column(String(12), nullable=False, default="common")

    __table_args__ = (UniqueConstraint("intake_id", "module_id", name="uq_intake_module"),)


class AdminAction(Base):
    """Audit log of admin decisions on accounts (7 Oct; OWASP: log user administration actions with "when, where,
    who and what"; NIST SP 800-53 AC-2: audit enabling and disabling of accounts; GitHub asks a reason for both
    suspending and unsuspending). Never edited or deleted by the app."""
    __tablename__ = "admin_actions"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    admin_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    target_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String(20), nullable=False)       # approve / reject / deactivate / reactivate
    reason = Column(String(300), nullable=True)
