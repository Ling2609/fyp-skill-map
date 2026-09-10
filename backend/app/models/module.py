from sqlalchemy import Column, Integer, String, JSON, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base


class Module(Base):
    __tablename__ = "modules"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    level = Column(Integer, nullable=False)
    type = Column(String, nullable=False)  # common, specialised, elective
    institution = Column(String, default="Representative SE Programme")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ModuleSkill(Base):
    __tablename__ = "module_skills"

    id = Column(Integer, primary_key=True, index=True)
    module_id = Column(Integer, ForeignKey("modules.id"), nullable=False)
    module_code = Column(String, nullable=False)
    skill_name = Column(String, nullable=False)
    extracted_by = Column(String, default="gemini-3.6-flash")
    created_at = Column(DateTime(timezone=True), server_default=func.now())