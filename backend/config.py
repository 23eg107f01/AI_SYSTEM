from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # LLM
    GROQ_API_KEY: str = ""

    # PostgreSQL
    DATABASE_URL: str = "postgresql://aicsa:aicsa_pass@localhost:5432/aicsa_db"

    # Redis
    REDIS_ENABLED: bool = False
    REDIS_URL: str = "redis://localhost:6379"

    # ChromaDB (local path OR cloud credentials)
    CHROMA_PATH: str = "./chroma_db"
    CHROMA_API_KEY: str = ""
    CHROMA_TENANT: str = ""
    CHROMA_DATABASE: str = ""

    # JWT
    JWT_SECRET: str = "change-me-to-a-256-bit-random-secret"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Cost controls
    MAX_TOKENS_PER_CALL: int = 1000
    DAILY_BUDGET_USD: float = 20.00

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # Rate limiting
    RATE_LIMIT_PER_MINUTE: int = 10

    # SLA Thresholds
    SLA_AMBER_MINUTES: int = 5
    SLA_RED_MINUTES: int = 15

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
