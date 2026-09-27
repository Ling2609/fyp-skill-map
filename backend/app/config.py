from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    gemini_api_key: str = ""
    groq_api_key: str = ""
    jsearch_key: str = ""   # RapidAPI key for JSearch (live jobs)

    class Config:
        env_file = ".env"
        extra = "ignore"   # unknown keys in .env won't crash the app

settings = Settings()