from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    gemini_api_key: str = ""
    groq_api_key: str = ""
    jsearch_key: str = ""   # RapidAPI key for JSearch (live jobs)
    # MongoDB: chatbot conversations (app/mongo.py). Defaults match a local install; override in backend/.env
    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_db: str = "skillmap"
    # Skill relationship model (app/services/skill_relation.py). Empty = off: matching uses cosine >= 0.7.
    # e.g. RELATION_MODEL_DIR=data/relation_model_esco_onet_v1_skillmap_v2_nli_rw3x20 (folder unzipped from Colab)
    relation_model_dir: str = ""
    relation_cutoff: float = 0.8     # p_satisfies at or above = has it (chosen on blind set v1, 6 Oct)
    # Email for "Forgot password" (Gmail SMTP + app password; see references.md "OTP, email verification and
    # forgot password"). Empty = not set up: the code is printed in the backend console instead (development only)
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"   # unknown keys in .env won't crash the app

settings = Settings()