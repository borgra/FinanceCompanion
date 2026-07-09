import pytest

from app.infrastructure.settings import Settings


def test_non_development_requires_non_default_session_secret():
    settings = Settings(
        environment="production",
        session_secret="local-dev-session-secret-change-me",
    )

    with pytest.raises(ValueError):
        settings.validate_security()


def test_session_secret_must_be_strong_enough():
    settings = Settings(
        environment="development",
        session_secret="short-secret-value",
    )

    with pytest.raises(ValueError):
        settings.validate_security()


def test_alpha_vantage_key_can_use_github_secret_name(monkeypatch):
    monkeypatch.setenv("ALPHA_VANTAGE_API_KEY", "test-alpha-key")

    settings = Settings()

    assert settings.alpha_vantage_api_key == "test-alpha-key"
