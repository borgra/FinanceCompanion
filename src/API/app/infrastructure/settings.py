from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit
import re

from pydantic import AliasChoices, Field, field_validator, model_validator
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
    data_backend: Literal["memory", "json"] = "memory"
    local_json_path: str = ".local-data/finance.json"
    disable_auth_for_local_development: bool = False
    local_development_user_id: str = "user-steve"
    allowed_email: str = "user@example.test"
    cosmos_table_connection_string: str | None = Field(default=None, repr=False)
    cosmos_table_name: str = "finance"
    alpha_vantage_api_key: str | None = Field(
        default=None,
        repr=False,
        validation_alias=AliasChoices(
            "FINANCE_COMPANION_ALPHA_VANTAGE_API_KEY",
            "ALPHA_VANTAGE_API_KEY",
        ),
    )
    dividend_research_provider: Literal["stub", "azure_foundry"] | None = None
    azure_foundry_endpoint: str | None = None
    azure_foundry_deployment: str | None = None
    azure_foundry_agent_name: str = Field(default="dividend-history-agent", min_length=1, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
    azure_foundry_stock_details_agent_name: str = Field(default="stock-details-agent", min_length=1, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
    azure_foundry_reasoning_effort: Literal["none", "low", "medium", "high"] | None = None
    azure_foundry_api_version: str | None = None
    azure_foundry_auth_mode: Literal["entra", "key"] = "entra"
    azure_foundry_api_key: str | None = Field(default=None, repr=False)
    azure_foundry_managed_identity_client_id: str | None = None
    entra_client_id: str | None = None
    entra_tenant_id: str | None = None
    session_secret: str = Field(default="local-dev-session-secret-change-me", min_length=16, repr=False)
    session_expiration_seconds: int = 60 * 60 * 12
    session_cookie_name: str = "finance_companion_session"
    session_cookie_secure: bool = False
    session_cookie_samesite: str = "lax"
    session_issuer: str = "finance-companion-api"
    session_audience: str = "finance-companion-ui"
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "https://finance-companion-ui.example.com"]
    )

    @field_validator("azure_foundry_reasoning_effort", mode="before")
    @classmethod
    def blank_reasoning_effort(cls, value):
        return None if value == "" else value

    @model_validator(mode="after")
    def adjust_production_cookie_settings(self) -> 'Settings':
        if self.environment == "development" and self.dividend_research_provider is None:
            self.dividend_research_provider = "stub"
        if self.environment != "development":
            self.session_cookie_secure = True
            self.session_cookie_samesite = "none"
        return self

    def validate_security(self) -> None:
        if self.dividend_research_provider == "azure_foundry":
            if not self.azure_foundry_endpoint or not self.azure_foundry_deployment or not self.azure_foundry_deployment.strip():
                raise ValueError("Foundry endpoint and deployment must be configured.")
            endpoint = urlsplit(self.azure_foundry_endpoint)
            project_endpoint = bool(re.fullmatch(r"/api/projects/[A-Za-z0-9._-]+(?:/openai/v1)?", endpoint.path.rstrip("/")))
            if endpoint.scheme != "https" or not endpoint.hostname or not endpoint.hostname.endswith((".openai.azure.com", ".services.ai.azure.com")) or endpoint.username or endpoint.password or endpoint.query or endpoint.fragment or endpoint.port not in {None, 443} or (endpoint.path.rstrip("/") not in {"", "/openai/v1"} and not project_endpoint):
                raise ValueError("Foundry requires an Azure resource HTTPS endpoint or /api/projects/{project-name} endpoint, optionally ending in /openai/v1.")
            if self.azure_foundry_api_version:
                raise ValueError("Foundry uses the GA OpenAI v1 API; leave API_VERSION empty.")
            if self.azure_foundry_auth_mode == "key" and not self.azure_foundry_api_key:
                raise ValueError("Foundry key authentication requires an API key.")
            if project_endpoint and self.azure_foundry_auth_mode != "entra":
                raise ValueError("Foundry project endpoints require Entra authentication.")
        if self.disable_auth_for_local_development and self.environment != "development":
            raise ValueError("Authentication can only be disabled in the local development environment.")

        if self.environment != "development" and self.session_secret.startswith("local-dev-session-secret"):
            raise ValueError("A real session secret must be configured outside local development.")

        if "*" in self.cors_origins:
            raise ValueError("Credentialed requests require explicit trusted CORS origins.")

        if not self.allowed_email or not self.allowed_email.strip():
            raise ValueError("An allowed user email must be configured.")

        if self.environment != "development" and (
            self.cosmos_table_connection_string or self.entra_client_id or self.entra_tenant_id
        ):
            if not (self.entra_client_id and self.entra_client_id.strip() and self.entra_tenant_id and self.entra_tenant_id.strip()):
                raise ValueError("Entra client ID and tenant ID must both be configured outside local development.")

        if self.environment != "development" and self.dividend_research_provider is None:
            raise ValueError(
                "FINANCE_COMPANION_DIVIDEND_RESEARCH_PROVIDER must explicitly opt in to stub mode outside development."
            )

        if len(self.session_secret) < 32:
            raise ValueError("The session secret must be at least 32 characters long.")

        if self.data_backend == "json" and self.environment != "development":
            raise ValueError("The local JSON data backend can only be used in the development environment.")
        if self.data_backend == "json" and self.cosmos_table_connection_string:
            raise ValueError("The local JSON data backend is mutually exclusive with Cosmos Table storage.")
        if self.environment != "development" and "allowed_email" not in self.model_fields_set:
            raise ValueError("An allowed user email must be explicitly configured outside local development.")
