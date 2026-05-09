from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Veridict API"
    app_env: str = "dev"
    gemini_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "GEMINI_API_KEY",
            "GOOGLE_AI_API_KEY",
            "GOOGLE_API_KEY",
            "VERIDICT_GEMINI_API_KEY",
        ),
    )
    gemini_model: str = Field(
        default="gemini-2.0-flash",
        validation_alias=AliasChoices("GEMINI_MODEL", "VERIDICT_GEMINI_MODEL"),
        description="Gemini model id for generateContent (default: Gemini 2.0 Flash).",
    )
    gemini_max_retries: int = Field(
        default=4,
        ge=0,
        le=10,
        validation_alias=AliasChoices("GEMINI_MAX_RETRIES", "VERIDICT_GEMINI_MAX_RETRIES"),
        description="Max automatic retries for retryable Gemini errors (429/5xx/timeouts).",
    )
    gemini_backoff_initial_s: float = Field(
        default=1.0,
        ge=0.0,
        le=60.0,
        validation_alias=AliasChoices("GEMINI_BACKOFF_INITIAL_S", "VERIDICT_GEMINI_BACKOFF_INITIAL_S"),
        description="Initial exponential backoff delay (seconds) for Gemini retries.",
    )
    gemini_backoff_max_s: float = Field(
        default=20.0,
        ge=0.0,
        le=300.0,
        validation_alias=AliasChoices("GEMINI_BACKOFF_MAX_S", "VERIDICT_GEMINI_BACKOFF_MAX_S"),
        description="Maximum backoff delay (seconds) for Gemini retries.",
    )
    gemini_min_interval_s: float = Field(
        default=0.35,
        ge=0.0,
        le=10.0,
        validation_alias=AliasChoices("GEMINI_MIN_INTERVAL_S", "VERIDICT_GEMINI_MIN_INTERVAL_S"),
        description="Minimum delay between Gemini calls to smooth burst traffic.",
    )
    storage_dir: Path = Field(
        default=Path("storage"),
        validation_alias=AliasChoices("VERIDICT_STORAGE_DIR", "STORAGE_DIR"),
    )
    audit_log_path: Path = Field(default=Path("storage/audit/audit_trail.jsonl"))
    # Load .env from cwd; primary key: GEMINI_API_KEY (see also GOOGLE_AI_API_KEY aliases above).
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
