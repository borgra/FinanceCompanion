import json
import pytest
from pydantic import ValidationError

from app.domain.models import SecurityMetadata
from app.infrastructure.foundry_web_research import FoundryWebDividendResearchProvider, WebIdentity, WebSecurities
from app.infrastructure.settings import Settings
from app.presentation.http.schemas import SecurityPayoutDetailsPayload


def test_foundry_agent_configuration_defaults_and_environment_override(monkeypatch):
    monkeypatch.delenv("FINANCE_COMPANION_AZURE_FOUNDRY_AGENT_NAME", raising=False)
    assert Settings(_env_file=None).azure_foundry_agent_name == "dividend-history-agent"
    monkeypatch.setenv("FINANCE_COMPANION_AZURE_FOUNDRY_AGENT_NAME", "income-history-agent")
    assert Settings(_env_file=None).azure_foundry_agent_name == "income-history-agent"


def test_stock_details_agent_configuration_defaults_and_environment_override(monkeypatch):
    monkeypatch.delenv("FINANCE_COMPANION_AZURE_FOUNDRY_STOCK_DETAILS_AGENT_NAME", raising=False)
    assert Settings(_env_file=None).azure_foundry_stock_details_agent_name == "stock-details-agent"
    monkeypatch.setenv("FINANCE_COMPANION_AZURE_FOUNDRY_STOCK_DETAILS_AGENT_NAME", "custom-stock-agent")
    assert Settings(_env_file=None).azure_foundry_stock_details_agent_name == "custom-stock-agent"


@pytest.mark.parametrize("name", ["", "../other-agent", "agent?key=private", "agent name", "a" * 129])
def test_stock_details_agent_name_rejects_invalid_configuration(name):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, azure_foundry_stock_details_agent_name=name)


def test_foundry_reasoning_configuration_remains_optional():
    assert Settings(_env_file=None, azure_foundry_reasoning_effort="").azure_foundry_reasoning_effort is None
    assert Settings(_env_file=None, azure_foundry_reasoning_effort="low").azure_foundry_reasoning_effort == "low"


def test_foundry_configuration_has_no_market_data_vendor_key_requirement():
    settings = Settings(_env_file=None, dividend_research_provider="azure_foundry",
        azure_foundry_endpoint="https://demo.services.ai.azure.com/api/projects/income",
        azure_foundry_deployment="web-model", alpha_vantage_api_key=None)
    settings.validate_security()


@pytest.mark.parametrize("endpoint", ["https://127.0.0.1/private", "http://demo.openai.azure.com", "https://demo.openai.azure.com/unexpected", "https://demo.openai.azure.com?key=unsafe"])
def test_foundry_configuration_rejects_unsafe_or_unsupported_endpoints(endpoint):
    settings = Settings(_env_file=None, dividend_research_provider="azure_foundry",
        azure_foundry_endpoint=endpoint, azure_foundry_deployment="web-model")
    with pytest.raises(ValueError, match="Azure resource HTTPS endpoint"):
        settings.validate_security()


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


def test_production_rejects_the_former_infrastructure_fallback():
    settings = Settings(
        environment="production",
        session_secret="local-dev-session-secret-change-me-longer-32-chars",
        dividend_research_provider="stub",
    )
    with pytest.raises(ValueError, match="real session secret"):
        settings.validate_security()


def test_wildcard_origin_cannot_authorize_cookie_writes():
    with pytest.raises(ValueError, match="explicit trusted"):
        Settings(cors_origins=["*"]).validate_security()


def test_auth_bypass_is_rejected_outside_local_development():
    settings = Settings(
        environment="production",
        disable_auth_for_local_development=True,
        session_secret="a-real-production-session-secret-123456",
    )

    with pytest.raises(ValueError, match="only be disabled"):
        settings.validate_security()


def test_alpha_vantage_key_can_use_github_secret_name(monkeypatch):
    monkeypatch.setenv("ALPHA_VANTAGE_API_KEY", "test-alpha-key")

    settings = Settings()

    assert settings.alpha_vantage_api_key == "test-alpha-key"


def test_development_defaults_to_stub_dividend_research():
    assert Settings().dividend_research_provider == "stub"


def test_deployed_environment_requires_explicit_stub_opt_in():
    settings = Settings(
        environment="production",
        session_secret="a-real-production-session-secret-123456",
    )

    with pytest.raises(ValueError, match="explicitly opt in"):
        settings.validate_security()

    opted_in = Settings(
        environment="production",
        session_secret="a-real-production-session-secret-123456",
        dividend_research_provider="stub",
        allowed_email="user@example.test",
    )
    opted_in.validate_security()


def test_production_requires_explicit_allowed_email_instead_of_demo_default():
    settings = Settings(_env_file=None, environment="production",
        session_secret="a-real-production-session-secret-123456", dividend_research_provider="stub")
    with pytest.raises(ValueError, match="explicitly configured"):
        settings.validate_security()


def test_demo_email_is_public_safe_and_environment_config_can_authorize_production(monkeypatch):
    monkeypatch.delenv("FINANCE_COMPANION_ALLOWED_EMAIL", raising=False)
    assert Settings(_env_file=None).allowed_email == "user@example.test"
    monkeypatch.setenv("FINANCE_COMPANION_ALLOWED_EMAIL", "configured@example.test")
    settings = Settings(_env_file=None, environment="production",
        session_secret="a-real-production-session-secret-123456", dividend_research_provider="stub")
    settings.validate_security()
    assert settings.allowed_email == "configured@example.test"


def test_cosmos_connection_string_is_redacted_in_repr():
    secret_conn = "DefaultEndpointsProtocol=https;AccountName=test;AccountKey=super-secret-key;"
    settings = Settings(cosmos_table_connection_string=secret_conn)
    assert "super-secret-key" not in repr(settings)


def test_non_development_cosmos_requires_entra_client_and_tenant():
    settings = Settings(
        environment="production",
        session_secret="a-real-production-session-secret-123456",
        dividend_research_provider="stub",
        cosmos_table_connection_string="DefaultEndpointsProtocol=https;AccountName=test;AccountKey=key;",
    )
    with pytest.raises(ValueError, match="Entra client ID and tenant ID"):
        settings.validate_security()


def test_empty_allowed_email_is_rejected():
    with pytest.raises(ValueError, match="allowed user email"):
        Settings(allowed_email="   ").validate_security()


def test_payout_payload_rejects_negative_or_invalid_date_values():
    with pytest.raises(ValidationError):
        SecurityPayoutDetailsPayload(
            exDividendDate="2026-03-15",
            amount=-1.25,
            frequency="Quarterly",
            isEstimate=False,
        )
    with pytest.raises(ValidationError):
        SecurityPayoutDetailsPayload(
            exDividendDate="not-a-date",
            amount=1.25,
            frequency="Quarterly",
            isEstimate=False,
        )


def test_search_securities_caches_repeated_queries_and_separates_task_from_user_query():
    provider = FoundryWebDividendResearchProvider(
        endpoint="https://example.services.ai.azure.com/api/projects/p",
        deployment="gpt-6-luna",
        token_provider=lambda: "tok",
    )
    calls = []
    excerpt = "Ticker: AAPL; Exchange: NASDAQ; Name: Apple Inc.; Asset type: Stock; Currency: USD"

    def fake_search(prompt: str, deadline: float, *, task: str = "") -> dict:
        calls.append((prompt, task))
        return {
            "kind": "foundry_web_search",
            "answer": excerpt,
            "citations": [{"url": "https://investor.apple.com/dividends", "title": "Apple", "start_index": 0, "end_index": len(excerpt)}],
            "sources": [{"url": "https://investor.apple.com/dividends"}],
            "searches": [{"id": "ws_1", "status": "completed", "action": {"type": "search"}}],
            "response_id": "resp_1",
        }

    provider._search = fake_search
    provider._extract = lambda evidence, schema, deadline: WebSecurities(
        securities=[
            WebIdentity(
                symbol="AAPL",
                exchange="NASDAQ",
                name="Apple Inc.",
                asset_type="Stock",
                currency="USD",
                source_url="https://investor.apple.com/dividends",
                evidence_excerpt=excerpt,
            )
        ]
    )

    first = provider.search_securities("  aapl ")
    second = provider.search_securities("AAPL")
    assert len(calls) == 1
    assert json.loads(calls[0][0]) == {"query": "aapl"}
    assert "Find up to eight matching US-listed USD stocks or ETFs" in calls[0][1]
    assert first == second == [
        SecurityMetadata(
            symbol="AAPL",
            name="Apple Inc.",
            exchange="NASDAQ",
            asset_type="Stock",
            currency="USD",
            details_status="AI-researched identity; market price unavailable",
        )
    ]
