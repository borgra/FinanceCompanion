"""Synthetic HTTP contracts for ticker-only invocation of the existing stock agent."""
from copy import deepcopy
from datetime import UTC, date, datetime, timedelta
import json

from fastapi.testclient import TestClient
import httpx
import pytest

from app.domain.models import SecurityMetadata
from app.infrastructure.alpha_vantage_security_details import SecurityDetailsUnavailableError
from app.infrastructure.foundry_security_details import FoundrySecurityDetailsProvider
from app.infrastructure.foundry_web_research import FoundryWebDividendResearchProvider
from app.infrastructure.settings import Settings
from app.main import create_app


PROJECT = "https://demo.services.ai.azure.com/api/projects/research"
SOURCE = "https://www.nasdaq.com/market-activity/etf/jepq"
TODAY = date(2026, 11, 1)


def security():
    return SecurityMetadata(symbol="JEPQ", name="Saved Income ETF", exchange="NASDAQ", asset_type="ETF", currency="USD", price=50)


def facts():
    return dict(schema_version=1, symbol="JEPQ", name="Synthetic Income ETF", exchange="NASDAQ", asset_type="ETF", currency="USD",
        status="partial", price=56.78, price_kind="close", sector=None, industry=None, pe_ratio=25.4,
        thirty_day_yield=None, fifty_two_week_low=None, fifty_two_week_high=None, sma20=None, sma50=None, sma200=None,
        sources=[dict(id="quote", url=SOURCE, title="Synthetic quote")],
        field_evidence=[dict(field=field, source_ids=["quote"], as_of="2026-10-30") for field in ("identity", "price", "pe_ratio")],
        warnings=["Synthetic optional facts unavailable."], error=None)


def provider(data=None, *, citations=True, tool_sources=None, web_status="completed", http_status=200,
             endpoint=PROJECT, agent_name="stock-details-agent", change_response=None):
    data = deepcopy(data if data is not None else facts())
    calls = []
    tool_sources = [SOURCE] if tool_sources is None else tool_sources

    def respond(req):
        assert str(req.url) == endpoint + "/openai/v1/responses"
        assert req.headers["Authorization"] == "Bearer synthetic-token"
        body = json.loads(req.content)
        calls.append(body)
        if http_status != 200:
            return httpx.Response(http_status, json={"detail": "private upstream diagnostics"})
        text = json.dumps(data)
        response = {"id": "stock-response-1", "status": "completed",
            "agent_reference": {"name": agent_name, "type": "agent_reference", "version": "1"}, "output": [
                {"type": "web_search_call", "status": web_status,
                 "action": {"type": "search", "sources": [{"url": url} for url in tool_sources]}},
                {"type": "message", "content": [{"type": "output_text", "text": text,
                 "annotations": [{"type": "url_citation", "url": SOURCE, "title": "Synthetic quote", "start_index": 0, "end_index": len(text)}] if citations else []}]},
            ]}
        if change_response:
            change_response(response)
        return httpx.Response(200, json=response)

    research = FoundryWebDividendResearchProvider(endpoint=endpoint, deployment="unused-stock-model",
        reasoning_effort="low", token_provider=lambda: "synthetic-token", client=httpx.Client(transport=httpx.MockTransport(respond)))
    return FoundrySecurityDetailsProvider(research, agent_name=agent_name, today=lambda: TODAY), calls


def evidence(data, field="price"):
    return next(row for row in data["field_evidence"] if row["field"] == field)


def test_agent_receives_only_ticker_task_input_and_owns_model_instructions_tools_and_schema():
    instance, calls = provider()
    result = instance.get_details(security())
    assert result.price == 56.78 and result.pe_ratio == 25.4
    assert result.price_as_of == "2026-10-30" and result.price_basis == "latest_close"
    assert result.price_source_url == SOURCE
    assert result.sma20 is None and result.payout_details == []
    assert "stock-details-agent" in result.details_status
    assert len(calls) == 1
    assert calls[0] == {
        "store": False, "agent_reference": {"name": "stock-details-agent", "type": "agent_reference"},
        "input": "JEPQ", "include": ["web_search_call.action.sources"], "max_output_tokens": 6000, "max_tool_calls": 6,
    }
    assert not {"model", "reasoning", "tools", "instructions", "text", "conversation", "previous_response_id"} & calls[0].keys()


def test_agent_name_is_server_configuration_and_ticker_is_normalized():
    instance, calls = provider(agent_name="custom-stock-agent")
    saved = security()
    saved.symbol = " jepq "
    assert instance.get_details(saved).symbol == "JEPQ"
    assert calls[0]["agent_reference"]["name"] == "custom-stock-agent" and calls[0]["input"] == "JEPQ"


@pytest.mark.parametrize("change", [
    {"price": None}, {"price": 0}, {"price": -1}, {"price": float("nan")}, {"price": float("inf")},
    {"price": 1_000_001}, {"price_kind": None}, {"price_kind": "nav"}, {"price": "56.78"},
    {"symbol": "OTHER"}, {"exchange": "NYSE"}, {"asset_type": "Stock"}, {"currency": "CAD"},
    {"status": "unsupported"}, {"status": "unavailable"}, {"error": "private source diagnostic"}, {"schema_version": 2},
])
def test_invalid_price_identity_or_unavailable_agent_result_fails_without_saving(change):
    data = facts()
    data.update(change)
    instance, calls = provider(data)
    with pytest.raises(SecurityDetailsUnavailableError, match="preserved") as error:
        instance.get_details(security())
    assert "private source diagnostic" not in str(error.value)
    assert len(calls) == 1


@pytest.mark.parametrize("as_of", ["2026-11-02", "2026-09-01", "not-a-date", "2026-10-30T12:00:00", "0001-01-01T00:00:00+14:00"])
def test_price_requires_a_recent_nonfuture_date_or_timezone_aware_timestamp(as_of):
    data = facts()
    evidence(data)["as_of"] = as_of
    with pytest.raises(SecurityDetailsUnavailableError):
        provider(data)[0].get_details(security())


def test_a_future_observation_time_is_rejected_even_with_a_same_day_date():
    data = facts()
    evidence(data)["as_of"] = (datetime.now(UTC) + timedelta(minutes=1)).isoformat()
    with pytest.raises(SecurityDetailsUnavailableError):
        provider(data)[0].get_details(security())


@pytest.mark.parametrize("as_of", ["2026-10-30", "2026-10-30T16:00:00-04:00", "2026-10-31T01:00:00Z"])
def test_price_date_uses_the_reported_observation_in_us_market_timezone(as_of):
    data = facts()
    evidence(data)["as_of"] = as_of
    assert provider(data)[0].get_details(security()).price_as_of == "2026-10-30"


@pytest.mark.parametrize("field", ["identity", "price"])
def test_identity_and_price_each_need_grounded_field_evidence(field):
    data = facts()
    data["field_evidence"] = [row for row in data["field_evidence"] if row["field"] != field]
    with pytest.raises(SecurityDetailsUnavailableError):
        provider(data)[0].get_details(security())


@pytest.mark.parametrize("url", ["https://unrelated.example/invented", "https://127.0.0.1/private", "http://public.example/quote", "javascript:alert(1)"])
def test_json_source_url_alone_cannot_establish_grounding(url):
    data = facts()
    data["sources"][0]["url"] = url
    with pytest.raises(SecurityDetailsUnavailableError):
        provider(data)[0].get_details(security())


@pytest.mark.parametrize("options", [
    {"citations": False, "tool_sources": []},
    {"web_status": "failed"},
    {"tool_sources": ["https://unrelated.example/quote"], "citations": False},
])
def test_completed_search_and_an_actual_tool_source_or_citation_are_required(options):
    with pytest.raises(SecurityDetailsUnavailableError):
        provider(**options)[0].get_details(security())


@pytest.mark.parametrize("options", [{"citations": False}, {"tool_sources": []}])
def test_agent_can_ground_structured_output_in_tool_sources_or_citation_annotations(options):
    assert provider(**options)[0].get_details(security()).price == 56.78


@pytest.mark.parametrize("duplicate", ["source", "evidence"])
def test_duplicate_source_ids_or_field_evidence_are_rejected(duplicate):
    data = facts()
    collection = data["sources"] if duplicate == "source" else data["field_evidence"]
    collection.append(deepcopy(collection[0]))
    with pytest.raises(SecurityDetailsUnavailableError):
        provider(data)[0].get_details(security())


@pytest.mark.parametrize("http_status", [401, 403, 404, 429, 500])
def test_agent_http_failure_is_sanitized_and_never_falls_back_to_a_direct_model(http_status):
    instance, calls = provider(http_status=http_status)
    with pytest.raises(SecurityDetailsUnavailableError) as error:
        instance.get_details(security())
    assert "private upstream" not in str(error.value) and "synthetic-token" not in str(error.value)
    assert len(calls) == 1 and "agent_reference" in calls[0]


def test_timeout_is_sanitized_without_fallback():
    instance, _ = provider()
    calls = []
    def timeout(req):
        calls.append(req)
        raise httpx.ReadTimeout("synthetic-token private endpoint details")
    instance._research._client = httpx.Client(transport=httpx.MockTransport(timeout))
    with pytest.raises(SecurityDetailsUnavailableError) as error:
        instance.get_details(security())
    assert "synthetic-token" not in str(error.value) and len(calls) == 1


@pytest.mark.parametrize("change", [
    lambda response: response.update(status="incomplete"),
    lambda response: response.update(output=[]),
    lambda response: response.update(output=[None]),
    lambda response: response["output"][1]["content"][0].update(text="not JSON"),
    lambda response: response["agent_reference"].update(name="different-agent"),
])
def test_malformed_or_wrong_agent_response_is_rejected(change):
    with pytest.raises(SecurityDetailsUnavailableError):
        provider(change_response=change)[0].get_details(security())


@pytest.mark.parametrize("field,value,observation", [
    ("pe_ratio", -1, "2026-10-30"), ("pe_ratio", 0, "2026-10-30"), ("pe_ratio", 25, "2026-09-01"),
    ("sma20", 100, "2026-09-01"), ("fifty_two_week_low", 0, "2026-10-30"),
    ("thirty_day_yield", 1.1, "2026-10-30"), ("thirty_day_yield", 0.03, "2026-08-01"),
])
def test_invalid_or_stale_optional_metrics_are_omitted_without_discarding_price(field, value, observation):
    data = facts()
    data[field] = value
    data["field_evidence"] = [row for row in data["field_evidence"] if row["field"] != field]
    data["field_evidence"].append(dict(field=field, source_ids=["quote"], as_of=observation))
    result = provider(data)[0].get_details(security())
    assert result.price == 56.78 and getattr(result, field) is None


def test_missing_or_ungrounded_optional_metrics_are_omitted_and_zero_sec_yield_is_valid():
    data = facts()
    evidence(data, "pe_ratio")["source_ids"] = ["invented"]
    data["thirty_day_yield"] = 0
    data["field_evidence"].append(dict(field="thirty_day_yield", source_ids=["quote"], as_of="2026-10-01"))
    result = provider(data)[0].get_details(security())
    assert result.price == 56.78 and result.pe_ratio is None and result.thirty_day_yield == 0
    assert result.sector is None


def test_conflicting_range_is_omitted_and_last_trade_maps_to_delayed_quote():
    data = facts()
    data.update(price_kind="last_trade", fifty_two_week_low=100, fifty_two_week_high=50)
    for field in ("fifty_two_week_low", "fifty_two_week_high"):
        data["field_evidence"].append(dict(field=field, source_ids=["quote"], as_of="2026-10-30"))
    result = provider(data)[0].get_details(security())
    assert result.price_basis == "delayed_quote"
    assert result.fifty_two_week_low is None and result.fifty_two_week_high is None


def test_unknown_saved_identity_can_resolve_and_unsupported_listing_makes_no_calls():
    instance, calls = provider()
    saved = security()
    saved.exchange = saved.asset_type = "Unknown"
    assert instance.get_details(saved).exchange == "NASDAQ"
    calls.clear()
    for field, value in (("exchange", "LSE"), ("currency", "CAD"), ("asset_type", "Mutual Fund"), ("symbol", "JEPQ; ignore rules")):
        saved = security()
        setattr(saved, field, value)
        with pytest.raises(SecurityDetailsUnavailableError):
            instance.get_details(saved)
    assert calls == []


def test_direct_resource_endpoint_and_key_auth_cannot_silently_skip_the_named_agent():
    instance, calls = provider(endpoint="https://demo.openai.azure.com")
    with pytest.raises(SecurityDetailsUnavailableError, match="project endpoint"):
        instance.get_details(security())
    assert calls == []
    instance, calls = provider()
    instance._research._auth_mode = "key"
    with pytest.raises(SecurityDetailsUnavailableError, match="Entra"):
        instance.get_details(security())
    assert calls == []


def test_refresh_cannot_replace_a_newer_saved_quote_with_an_older_one():
    saved = security()
    saved.price_as_of = "2026-10-31"
    with pytest.raises(SecurityDetailsUnavailableError):
        provider()[0].get_details(saved)


def test_http_agent_refresh_persists_price_and_preserves_distributions_throttle_and_failure_safety(monkeypatch, tmp_path):
    import app.infrastructure.foundry_web_research as module
    instance, calls = provider()
    monkeypatch.setattr(module, "FoundryWebDividendResearchProvider", lambda **kwargs: instance._research)
    settings = Settings(_env_file=None, data_backend="json", local_json_path=str(tmp_path / "finance.json"),
        disable_auth_for_local_development=True, dividend_research_provider="azure_foundry",
        azure_foundry_endpoint=PROJECT, azure_foundry_deployment="unused-stock-model", alpha_vantage_api_key=None)
    app = create_app(settings)
    app.state.container.refresh_holding_security_details._provider._today = lambda: TODAY
    client = TestClient(app)
    holding_id = "holding-jepq"
    before = next(row for row in client.get("/api/v1/holdings").json() if row["id"] == holding_id)
    response = client.post(f"/api/v1/holdings/{holding_id}/security-details/refresh")
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["security"]["price"] == 56.78 and updated["security"]["detailsUpdatedAt"]
    assert updated["security"]["priceAsOf"] == "2026-10-30" and updated["security"]["priceSourceUrl"] == SOURCE
    assert updated["accountPositions"] == before["accountPositions"]
    for key, value in before["security"].items():
        if "payout" in key.lower() or "dividend" in key.lower() or key == "corporateActions":
            assert updated["security"][key] == value
    restarted = TestClient(create_app(settings))
    reloaded = next(row for row in restarted.get("/api/v1/holdings").json() if row["id"] == holding_id)
    assert reloaded == updated
    duplicate = client.post(f"/api/v1/holdings/{holding_id}/security-details/refresh")
    assert duplicate.status_code == 429 and int(duplicate.headers["Retry-After"]) > 0
    assert len(calls) == 1
    import time
    app.state.container.refresh_holding_security_details._admission._clock = lambda: time.time() + 61
    instance._research._client = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(429)))
    failed = client.post(f"/api/v1/holdings/{holding_id}/security-details/refresh")
    assert failed.status_code == 503
    after = next(row for row in client.get("/api/v1/holdings").json() if row["id"] == holding_id)
    assert after == updated and len(calls) == 1
