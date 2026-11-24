from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    gemini_api_key: str = ""
    groq_api_key: str = ""
    mistral_api_key: str = ""   # skill checker option (app/services/skill_checker.py), Mistral's free API tier
    cohere_api_key: str = ""    # skill checker (app/services/skill_checker.py), Cohere trial key
    jsearch_key: str = ""   # RapidAPI key for JSearch (live jobs)
    # MongoDB: chatbot conversations (app/mongo.py). Defaults match a local install; override in backend/.env
    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_db: str = "skillmap"
    # Skill relationship model (app/services/skill_relation.py). Empty = off: matching uses cosine >= 0.7.
    # e.g. RELATION_MODEL_DIR=data/relation_model_esco_onet_v1_skillmap_v2_nli_rw3x20 (folder unzipped from Colab)
    relation_model_dir: str = ""
    # p_satisfies at or above = has it. 0.8 is RUN 4's cut-off, chosen on blind set v1 only (6 Oct); run 5's is chosen
    # on v1 + v2 before blind set v3 exists (references.md, run-5 pass rule)
    relation_cutoff: float = 0.8
    # Email for "Forgot password" (Gmail SMTP + app password; see references.md "OTP, email verification and
    # forgot password"). Empty = not set up: the code is printed in the backend console instead (development only)
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    # Browser tests only (23 Nov, email verification): E2E_OUTBOX=1 writes every email to backend/.e2e_outbox/
    # instead of sending it, so the tests can read the code. Allowed only on the skillmap_e2e database; on any other
    # database the backend refuses to start (app/services/mailer.py check_outbox).
    e2e_outbox: bool = False
    # 24 Nov (deployment audit, item 2): PRODUCTION=1 on a real server. The backend then refuses to start without
    # email (SMTP), a strong SECRET_KEY and a real database password, refuses the e2e outbox, and never prints an
    # email (or its code) to the log (app/services/production.py). Unset = local development, as before.
    production: bool = False
    # 24 Nov (deployment audit, item 3): AI requests per user, all AI features together (app/services/rate_limit.py).
    # Starting values: adjust after measuring real use
    ai_requests_per_hour: int = 60
    ai_requests_per_day: int = 200
    ai_parallel_per_user: int = 2      # AI calls one user may have running at the same moment
    # Per-address limits x this number. Only for tests and local browser runs, where every request comes from one
    # address; PRODUCTION=1 refuses a value above 1 (app/services/production.py)
    ip_limit_multiplier: int = 1
    # Websites allowed to call the API (13 Oct audit): comma-separated, e.g. for a Docker / demo address
    # CORS_ORIGINS=http://localhost:5173,http://192.168.1.20:5173
    cors_origins: str = "http://localhost:5173"
    # Connect GitHub (14 Oct): a GitHub OAuth app proves which GitHub accounts are a student's own. Empty = not set up:
    # students can't connect, repos are still read but can't be checked as theirs. README "Connect GitHub".
    github_client_id: str = ""
    github_client_secret: str = ""
    # Where the frontend runs: GitHub sends the student back to <frontend_url>/github/callback after connecting
    frontend_url: str = "http://localhost:5173"

    class Config:
        env_file = ".env"
        extra = "ignore"   # unknown keys in .env won't crash the app

settings = Settings()