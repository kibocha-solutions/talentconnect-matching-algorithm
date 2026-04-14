from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

AppEnvironment = Literal["development", "test", "staging", "production"]
EmbeddingProvider = Literal["gemini", "local"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
        protected_namespaces=("settings_",),
    )

    app_name: str = Field(default="TalentConnect Matching Algorithm", alias="APP_NAME")
    environment: AppEnvironment = Field(default="development", alias="ENVIRONMENT")
    embedding_provider: EmbeddingProvider = Field(
        default="gemini",
        alias="EMBEDDING_PROVIDER",
    )
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    gemini_embedding_model: str = Field(
        default="text-embedding-004",
        alias="GEMINI_EMBEDDING_MODEL",
    )
    local_embedding_model: str = Field(
        default="sentence-transformers/all-MiniLM-L6-v2",
        alias="LOCAL_EMBEDDING_MODEL",
    )
    shortlist_size: int = Field(default=20, alias="SHORTLIST_SIZE", ge=1)
    xgboost_random_seed: int = Field(default=42, alias="XGBOOST_RANDOM_SEED")
    model_dir: Path = Field(default=Path("models"), alias="MODEL_DIR")
    ranker_model_path: Path | None = Field(default=None, alias="RANKER_MODEL_PATH")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    @property
    def resolved_model_dir(self) -> Path:
        return self.model_dir.expanduser().resolve()

    @property
    def resolved_ranker_model_path(self) -> Path:
        if self.ranker_model_path is not None:
            return self.ranker_model_path.expanduser().resolve()
        return self.resolved_model_dir / "xgboost-ranker.json"

    @property
    def prefers_gemini_embeddings(self) -> bool:
        return self.embedding_provider == "gemini"

    def validate_embedding_provider(self) -> None:
        if self.prefers_gemini_embeddings and not self.gemini_api_key:
            raise ValueError(
                "GEMINI_API_KEY is required when EMBEDDING_PROVIDER=gemini."
            )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
