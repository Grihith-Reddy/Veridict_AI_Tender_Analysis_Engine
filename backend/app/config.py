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
    storage_dir: Path = Field(
        default=Path("storage"),
        validation_alias=AliasChoices("VERIDICT_STORAGE_DIR", "STORAGE_DIR"),
    )
    audit_log_path: Path = Field(default=Path("storage/audit/audit_trail.jsonl"))
    # Load .env from cwd; primary key: GEMINI_API_KEY (see also GOOGLE_AI_API_KEY aliases above).
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
