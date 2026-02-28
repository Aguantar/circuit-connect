from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Circuit Connect API"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False

    # PostgreSQL
    PG_HOST: str = "localhost"
    PG_PORT: int = 5432
    PG_USER: str = "calme"
    PG_PASSWORD: str = "calme"
    PG_DATABASE: str = "circuit_connect"

    # Kafka
    KAFKA_BOOTSTRAP: str = "localhost:9092"
    KAFKA_TOPIC_EVENTS: str = "game-events"
    KAFKA_TOPIC_DLQ: str = "game-events-dlq"

    # ClickHouse (읽기 전용, 대시보드용)
    CH_HOST: str = "localhost"
    CH_PORT: int = 8123

    class Config:
        env_file = ".env"
        env_prefix = "CC_"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
