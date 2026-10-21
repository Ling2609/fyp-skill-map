from sqlalchemy import JSON, BigInteger, Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.sql import func
from app.database import Base

ADDED_BY_YOU = "Added by you"   # skill_quotes value for a project skill the student typed in herself (4 Oct)


class UserProject(Base):
    __tablename__ = "user_projects"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    github_url = Column(String(500), nullable=True)
    extracted_skills = Column(ARRAY(String), nullable=False, default=[])
    # skill -> the words from the student's description that show it (4 Oct; migrate_profile_skill_evidence.py).
    # Projects added before have {} (no quotes shown).
    skill_quotes = Column(JSON, nullable=False, default=dict, server_default='{}')
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # 14 Oct (Connect GitHub): is the linked repo the student's own? "yours" = one of her connected GitHub accounts
    # owns it or contributed to it (repo_check_as = which); "not_linked" = none did; NULL = no repo, or GitHub
    # couldn't be asked. Employers see it next to the repo link. Never blocks saving.
    repo_check = Column(String(12), nullable=True)
    repo_check_as = Column(String(40), nullable=True)
    # 21 Oct (references.md "What employers look for in graduates"): the project's context, all optional.
    # Recruiters ask what the student did in a team project and what came of it; a demo shows it works
    role = Column(String(80), nullable=True)          # "Back-end developer", "Team lead"
    team_size = Column(Integer, nullable=True)        # 1 = on her own
    outcome = Column(String(300), nullable=True)      # "Used by 120 students in the 2025 club fair", "Grade A"
    demo_url = Column(String(500), nullable=True)     # a live site or a video


class GithubAccount(Base):
    """A GitHub account the student proved is hers by signing in to GitHub (14 Oct). Several are allowed (personal,
    school). One GitHub account can belong to one SkillMap account only. GitHub's token is not kept."""
    __tablename__ = "github_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    github_id = Column(BigInteger, nullable=False, unique=True)
    login = Column(String(40), nullable=False)
    connected_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class UserCertification(Base):
    __tablename__ = "user_certifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    cert_name = Column(String(300), nullable=False)
    issuer = Column(String(200), nullable=False)
    mapped_skills = Column(ARRAY(String), nullable=False, default=[])
    # "listed" = typed by the student from the certificate; "estimated" = guessed by the AI from the name;
    # "confirmed" = an estimate the student checked and confirmed (4 Oct). NULL = added before 4 Oct (= estimated)
    skills_source = Column(String(10), nullable=True)
    added_skills = Column(JSON, nullable=False, default=list, server_default='[]')   # typed in via "+ Add skill"
    credly_url = Column(String(500), nullable=True)   # shown as a link so anyone can verify the badge
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class UserAward(Base):
    """Honours and awards (8 Oct, Mr Au: "portfolio, LinkedIn, awards, certifications" on one profile). Fields follow
    LinkedIn's Honors & awards form (title, issuer, date, description). Skills work like certificates: the AI suggests
    them from the title and description, the student keeps or removes them before saving, so every skill was seen."""
    __tablename__ = "user_awards"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(150), nullable=False)                 # "Champion, APU Hackathon 2025"
    issuer = Column(String(100), nullable=False)                # who gave it, e.g. "Asia Pacific University"
    award_date = Column(String(7), nullable=True)               # "2025-11" (month and year), optional
    description = Column(Text, nullable=True)                   # what it was for, optional
    mapped_skills = Column(ARRAY(String), nullable=False, default=[])
    added_skills = Column(JSON, nullable=False, default=list, server_default='[]')   # typed in via "+ Add skill"
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UserExperience(Base):
    """Work experience and activities (21 Oct, references.md "What employers look for in graduates": internships
    and leadership roles are among what graduate recruiters weigh most). One table, two kinds:
      - "work": an internship, industrial placement, part-time job or freelance work
      - "activity": a club or society role, a hackathon, volunteering, organising an event
    Skills work like awards: the AI suggests them from the student's own description (each must be in her words),
    she keeps or removes them before saving, so every saved skill was seen by her."""
    __tablename__ = "user_experiences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String(10), nullable=False)                   # "work" / "activity"
    category = Column(String(20), nullable=False)               # internship / placement / ... (EXPERIENCE_CATEGORIES)
    role = Column(String(120), nullable=False)                  # "Software Engineering Intern", "Vice President"
    organisation = Column(String(120), nullable=False)          # "Grab", "APU Google Developer Student Club"
    start_month = Column(String(7), nullable=False)             # "2025-06"
    end_month = Column(String(7), nullable=True)                # empty = still doing it
    description = Column(Text, nullable=True)                   # what she did, in her words
    mapped_skills = Column(ARRAY(String), nullable=False, default=[])
    added_skills = Column(JSON, nullable=False, default=list, server_default='[]')   # typed in via "+ Add skill"
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# "Other" is always offered (her rule). Labels are in the frontend (experienceKinds.js)
EXPERIENCE_CATEGORIES = {
    "work": ("internship", "placement", "part_time", "freelance", "other"),
    "activity": ("club", "hackathon", "competition", "volunteering", "event", "other"),
}
