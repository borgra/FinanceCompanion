"""Synthetic HTTP contracts for the configured AI price/details refresh path."""
from copy import deepcopy
from datetime import date
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


SOURCE = "https://www.nasdaq.com/market-activity/etf/jepq"
TODAY = date(2026, 11, 1)
IDENTITY = "Ticker: JEPQ; Exchange: NASDAQ; Name: Synthetic Income ETF; Asset type: ETF; Currency: USD"
PRICE = "Ticker: JEPQ; Exchange: NASDAQ; Currency: USD; Price: 56.78; Price date: 2026-10-30; Price basis: latest_close"
DETAIL = "Ticker: JEPQ; Exchange: NASDAQ; Currency: USD; Field: pe_ratio; Value: 25.4"


def security():
    return SecurityMetadata(symbol="JEPQ", name="Saved Income ETF", exchange="NASDAQ", asset_type="ETF", currency="USD", price=50)


def facts():
    return dict(identity=dict(symbol="JEPQ", name="Synthetic Income ETF", exchange="NASDAQ", asset_type="ETF", currency="USD",
                              source_url=SOURCE, evidence_excerpt=IDENTITY),
                price=dict(value="56.78", as_of="2026-10-30", basis="latest_close", source_url=SOURCE, evidence_excerpt=PRICE),
                details=[dict(field="pe_ratio", value="25.4", source_url=SOURCE, evidence_excerpt=DETAIL)])


def provider(data=None, *, answer=None, citations=True, http_status=200):
    data = deepcopy(data if data is not None else facts())
    answer = answer if answer is not None else "\n".join((IDENTITY, PRICE, DETAIL))
    calls = []
    def respond(req):
        assert req.headers["Authorization"] == "Bearer synthetic-token"
        body = json.loads(req.content)
        calls.append(body)
        if http_status != 200:
            return httpx.Response(http_status, json={"detail": "private upstream diagnostics"})
        if "tools" in body:
            annotations, offset = [], 0
            for line in answer.split("\n"):
                if citations:
                    annotations.append(dict(type="url_citation", url=SOURCE, title="Synthetic quote", start_index=offset, end_index=offset + len(line)))
                offset += len(line) + 1
            return httpx.Response(200, json={"id": "research-1", "status": "completed", "output": [
                {"type": "web_search_call", "status": "completed", "action": {"type": "search", "sources": [{"url": SOURCE}]}},
                {"type": "message", "content": [{"type": "output_text", "text": answer, "annotations": annotations}]},
            ]})
        return httpx.Response(200, json={"status": "completed", "output": [
            {"type": "message", "content": [{"type": "output_text", "text": json.dumps(data)}]},
        ]})
    research = FoundryWebDividendResearchProvider(endpoint="https://demo.openai.azure.com", deployment="web-model",
        token_provider=lambda: "synthetic-token", client=httpx.Client(transport=httpx.MockTransport(respond)))
    return FoundrySecurityDetailsProvider(research, today=lambda: TODAY), calls


def test_market_research_uses_existing_foundry_auth_cited_search_and_strict_extraction():
    instance, calls = provider()
    result = instance.get_details(security())
    assert result.price == 56.78 and result.pe_ratio == 25.4
    assert result.price_as_of == "2026-10-30" and result.price_basis == "latest_close"
    assert result.price_source_url == SOURCE
    assert result.sma20 is None and result.payout_details == []
    assert "delayed" in result.details_status
    assert len(calls) == 2
    assert calls[0]["model"] == "web-model" and calls[0]["store"] is False
    assert calls[0]["tools"] == [{"type": "web_search"}] and calls[0]["tool_choice"] == "required"
    query = json.loads(calls[0]["input"][1]["content"][0]["text"])
    assert query["as_of"] == TODAY.isoformat() and query["symbol"] == "JEPQ"
    assert calls[1]["text"]["format"]["strict"] is True
    assert "tools" not in calls[1]


@pytest.mark.parametrize("change", [
    {"value": "0"}, {"value": "-1"}, {"value": "NaN"}, {"value": "Infinity"}, {"value": "1000001"},
    {"value": "99.9"}, {"as_of": "2026-11-02"}, {"as_of": "2026-09-01"},
    {"as_of": "2026-10-29"}, {"basis": "delayed_quote"},
    {"source_url": "https://unrelated.example/quote"},
    {"source_url": "https://127.0.0.1/private"}, {"evidence_excerpt": "Invented price evidence"},
])
def test_invalid_stale_future_mismatched_or_uncited_price_is_rejected(change):
    data = facts()
    data["price"].update(change)
    instance, _ = provider(data)
    with pytest.raises(SecurityDetailsUnavailableError, match="preserved"):
        instance.get_details(security())


@pytest.mark.parametrize("change", [{"symbol": "OTHER"}, {"exchange": "NYSE"}, {"asset_type": "Stock"}, {"currency": "CAD"}])
def test_wrong_listing_or_identity_is_rejected(change):
    data = facts()
    data["identity"].update(change)
    instance, _ = provider(data)
    with pytest.raises(SecurityDetailsUnavailableError):
        instance.get_details(security())


def test_no_citations_and_upstream_errors_fail_without_leaking_diagnostics():
    for options in ({"citations": False}, {"http_status": 401}, {"http_status": 403}, {"http_status": 429}, {"http_status": 500}):
        instance, _ = provider(**options)
        with pytest.raises(SecurityDetailsUnavailableError) as error:
            instance.get_details(security())
        assert "private upstream" not in str(error.value) and "synthetic-token" not in str(error.value)


def test_missing_price_cannot_return_success_and_optional_uncited_details_are_ignored():
    data = facts()
    data["price"] = None
    with pytest.raises(SecurityDetailsUnavailableError):
        provider(data)[0].get_details(security())
    data = facts()
    data["details"][0]["value"] = "1234"
    result = provider(data)[0].get_details(security())
    assert result.price == 56.78 and result.pe_ratio is None


def test_unknown_saved_identity_can_resolve_and_unsupported_listing_makes_no_calls():
    instance, calls = provider()
    saved = security()
    saved.exchange = saved.asset_type = "Unknown"
    assert instance.get_details(saved).exchange == "NASDAQ"
    calls.clear()
    for field, value in (("exchange", "LSE"), ("currency", "CAD"), ("asset_type", "Mutual Fund")):
        saved = security()
        setattr(saved, field, value)
        with pytest.raises(SecurityDetailsUnavailableError):
            instance.get_details(saved)
    assert calls == []


def test_sentence_punctuation_on_cited_fields_is_accepted():
    data = facts()
    data["price"]["evidence_excerpt"] += "."
    data["details"][0]["evidence_excerpt"] += "."
    result = provider(data, answer="\n".join((IDENTITY, PRICE + ".", DETAIL + ".")))[0].get_details(security())
    assert result.price == 56.78 and result.pe_ratio == 25.4


def test_refresh_cannot_replace_a_newer_saved_quote_with_an_older_one():
    saved = security()
    saved.price_as_of = "2026-10-31"
    with pytest.raises(SecurityDetailsUnavailableError):
        provider()[0].get_details(saved)


def test_http_refresh_in_ai_mode_persists_prices_and_preserves_distribution_data(monkeypatch, tmp_path):
    import app.infrastructure.foundry_web_research as module
    instance, calls = provider()
    monkeypatch.setattr(module, "FoundryWebDividendResearchProvider", lambda **kwargs: instance._research)
    settings = Settings(_env_file=None, data_backend="json", local_json_path=str(tmp_path / "finance.json"),
        disable_auth_for_local_development=True, dividend_research_provider="azure_foundry",
        azure_foundry_endpoint="https://demo.openai.azure.com", azure_foundry_deployment="web-model", alpha_vantage_api_key=None)
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
    # A real application restart reloads the saved metadata from JSON.
    restarted = TestClient(create_app(settings))
    reloaded = next(row for row in restarted.get("/api/v1/holdings").json() if row["id"] == holding_id)
    assert reloaded == updated
    duplicate = client.post(f"/api/v1/holdings/{holding_id}/security-details/refresh")
    assert duplicate.status_code == 429
    assert int(duplicate.headers["Retry-After"]) > 0
    assert len(calls) == 2
    # Unavailable research must return an error and leave every saved field intact.
    import time
    app.state.container.refresh_holding_security_details._admission._clock = lambda: time.time() + 61
    instance._research._client = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(429)))
    failed = client.post(f"/api/v1/holdings/{holding_id}/security-details/refresh")
    assert failed.status_code == 503
    after = next(row for row in client.get("/api/v1/holdings").json() if row["id"] == holding_id)
    assert after == updated
    assert len(calls) == 2
