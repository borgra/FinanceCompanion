"""Regression proofs for server-owned price provenance; all data is synthetic."""
from dataclasses import replace

from fastapi.testclient import TestClient
import pytest

from app.infrastructure.settings import Settings
from app.main import create_app
from app.presentation.http.schemas import SecurityMetadataWritePayload


def setup_client():
    app = create_app(Settings(_env_file=None, dividend_research_provider="stub", disable_auth_for_local_development=True))
    repository = app.state.container.refresh_holding_security_details._repository
    original = next(item for item in repository.list_for_user("user-steve") if item.id == "holding-jepq")
    researched = replace(original, security=replace(original.security,
        price=56.78, price_as_of="2026-10-30", price_basis="latest_close",
        price_source_url="https://www.nasdaq.com/market-activity/etf/jepq",
        details_status="AI web research; delayed or latest closing price", details_updated_at="2026-11-01T12:00:00Z"))
    repository.update_for_user("user-steve", original.id, researched)
    client = TestClient(app)
    payload = next(item for item in client.get("/api/v1/holdings").json() if item["id"] == original.id)
    return app, client, payload


def forge(security):
    security.update(priceAsOf="9999-12-31", priceSourceUrl="https://attacker.example/claimed-source",
                    priceBasis="latest_close", detailsStatus="AI web research", detailsUpdatedAt="9999-12-31T00:00:00Z")


def assert_manual(security):
    assert security["priceAsOf"] is None
    assert security["priceSourceUrl"] is None
    assert security["priceBasis"] is None
    assert security["detailsStatus"] == "manual"
    assert security["detailsUpdatedAt"] is None


def test_create_ignores_all_client_assertions_of_research_origin():
    _, client, payload = setup_client()
    payload["security"].update(symbol="SYNTH", name="Synthetic Test Security")
    forge(payload["security"])
    response = client.post("/api/v1/holdings", json=payload)
    assert response.status_code == 201, response.text
    assert_manual(response.json()["security"])


@pytest.mark.parametrize("batch", [False, True])
def test_unrelated_edits_preserve_saved_provenance_and_ignore_forged_replacement(batch):
    _, client, payload = setup_client()
    original = dict(payload["security"])
    forge(payload["security"])
    payload["accountPositions"][0]["quantity"] += 1
    if batch:
        response = client.put("/api/v1/holdings/batch", json={"holdings": [payload]})
        assert response.status_code == 200, response.text
        updated = response.json()[0]
    else:
        response = client.put(f"/api/v1/holdings/{payload['id']}", json=payload)
        assert response.status_code == 200, response.text
        updated = response.json()
    for key in ("priceAsOf", "priceSourceUrl", "priceBasis", "detailsStatus", "detailsUpdatedAt"):
        assert updated["security"][key] == original[key]


@pytest.mark.parametrize("batch", [False, True])
@pytest.mark.parametrize("field,value", [("price", 999), ("symbol", "SYNTH"), ("exchange", "NYSE"), ("assetType", "Stock"), ("currency", "EUR")])
def test_price_or_listing_changes_clear_attribution_in_individual_and_batch_writes(batch, field, value):
    _, client, payload = setup_client()
    payload["security"][field] = value
    forge(payload["security"])
    if batch:
        response = client.put("/api/v1/holdings/batch", json={"holdings": [payload]})
        assert response.status_code == 200, response.text
        updated = response.json()[0]
    else:
        response = client.put(f"/api/v1/holdings/{payload['id']}", json=payload)
        assert response.status_code == 200, response.text
        updated = response.json()
    assert_manual(updated["security"])


def test_domain_update_policy_also_prevents_bypassing_http_schema():
    app, _, payload = setup_client()
    repository = app.state.container.refresh_holding_security_details._repository
    saved = next(item for item in repository.list_for_user("user-steve") if item.id == payload["id"])
    forged = replace(saved, security=replace(saved.security, price=999, price_as_of="9999-12-31", details_status="AI web research"))
    updated = app.state.container.update_holding.execute("user-steve", saved.id, forged)
    assert updated.security.price_as_of is None
    assert updated.security.price_source_url is None
    assert updated.security.details_status == "manual"


def test_legacy_clients_can_roundtrip_corrupt_provenance_without_storing_it():
    payload = SecurityMetadataWritePayload(symbol="SYNTH", name="Synthetic", exchange="NASDAQ", assetType="Stock", currency="USD",
        priceAsOf="not a date", priceSourceUrl="javascript:alert(1)", priceBasis="untrusted", detailsStatus="AI web research")
    assert payload.price_as_of is None and payload.price_source_url is None and payload.price_basis is None
    assert payload.details_status is None


@pytest.mark.parametrize("saved_date", ["9999-12-31", "corrupt", 123])
def test_legacy_future_or_invalid_saved_date_cannot_permanently_block_research(saved_date):
    from test_foundry_security_details import provider, security
    instance, _ = provider()
    saved = security()
    saved.price_as_of = saved_date
    assert instance.get_details(saved).price_as_of == "2026-10-30"
