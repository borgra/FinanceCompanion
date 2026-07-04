from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_env_files = []
try:
    _REPO_ROOT = Path(__file__).resolve().parents[4]
    _ROOT_ENV_FILE = _REPO_ROOT / ".env.local"
    _API_ENV_FILE = _REPO_ROOT / "src" / "API" / ".env"
    if _ROOT_ENV_FILE.exists():
        _env_files.append(str(_ROOT_ENV_FILE))
    if _API_ENV_FILE.exists():
        _env_files.append(str(_API_ENV_FILE))
except (IndexError, OSError):
    pass


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="FINANCE_COMPANION_",
        extra="ignore",
        env_file=tuple(_env_files),
        env_file_encoding="utf-8",
    )

    app_name: str = "Finance Companion API"
    api_prefix: str = "/api/v1"
    environment: str = "development"
    allowed_email: str = "steveborgra@gmail.com"
    cosmos_table_connection_string: str | None = None
    cosmos_table_name: str = "finance"
    entra_client_id: str | None = None
    entra_tenant_id: str | None = None
    session_secret: str = Field(default="local-dev-session-secret-change-me", min_length=16)
    session_expiration_seconds: int = 60 * 60 * 12
    session_cookie_name: str = "finance_companion_session"
    session_cookie_secure: bool = False
    session_cookie_samesite: str = "lax"
    session_issuer: str = "finance-companion-api"
    session_audience: str = "finance-companion-ui"
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "https://finance-companion-ui.example.com"]
    )

    def validate_security(self) -> None:
        if self.environment != "development" and self.session_secret == "local-dev-session-secret-change-me":
            raise ValueError("A real session secret must be configured outside local development.")

        if len(self.session_secret) < 32:
            raise ValueError("The session secret must be at least 32 characters long.")
