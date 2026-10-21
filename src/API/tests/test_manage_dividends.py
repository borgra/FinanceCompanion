import json
from dataclasses import replace
from datetime import date
from unittest.mock import Mock

import pytest

from app.application.use_cases.dividend_refresh import RefreshHoldingDividends
from app.infrastructure.cosmos_repositories import _holding_from_entity, _holding_to_entity
from app.infrastructure.in_memory_repositories import InMemoryDataStore, InMemoryHoldingRepository
from app.infrastructure.local_json_store import LocalJsonDataStore
from app.infrastructure.stub_dividend_research import StubDividendResearchProvider
from test_api_contracts import authenticate, build_test_client
from test_dividend_refresh import holding


def test_disabled_holding_returns_unchanged_without_researching_or_writing():
    original = replace(holding("disabled"), manage_dividends=False)
    repository = Mock()
    repository.list_for_user.return_value = [original]
    provider = Mock()

    assert RefreshHoldingDividends(repository, provider).execute("user", "disabled") == original
    provider.research.assert_not_called()
    repository.update_batch_for_user.assert_not_called()


def test_distribution_refresh_updates_default_enabled_holdings_but_not_disabled_same_security():
    enabled = holding("enabled")
    disabled = replace(holding("disabled"), manage_dividends=False)
    store = InMemoryDataStore()
    store.holdings["user"] = [enabled, disabled]
    repository = InMemoryHoldingRepository(store)
    provider = Mock(wraps=StubDividendResearchProvider())
    provider.cache_key = None

    refreshed = RefreshHoldingDividends(repository, provider, today=lambda: date(2026, 9, 4)).execute("user", "enabled")

    provider.research.assert_called_once()
    assert refreshed.manage_dividends is True
    assert refreshed.security.dividend_research_provider == "stub"
    assert repository.list_for_user("user")[1] == disabled


def test_opt_out_and_manual_edits_during_research_are_preserved():
    store = InMemoryDataStore()
    store.holdings["user"] = [holding("target"), holding("sibling"), holding("still-enabled")]
    repository = InMemoryHoldingRepository(store)

    class ConcurrentEditProvider:
        def research(self, request):
            for item in repository.list_for_user("user"):
                if item.id in {"target", "sibling"}:
                    changed = replace(item, manage_dividends=False, updated_at="concurrent-edit")
                else:
                    manual = replace(item.security.manual_payout_details[0], amount=123.45)
                    changed = replace(item, security=replace(item.security, manual_payout_details=[manual]))
                repository.update_for_user("user", item.id, changed)
            return StubDividendResearchProvider().research(request)

    refreshed = RefreshHoldingDividends(repository, ConcurrentEditProvider(), today=lambda: date(2026, 9, 4)).execute("user", "target")
    saved = {item.id: item for item in repository.list_for_user("user")}

    assert refreshed == saved["target"]
    assert refreshed.manage_dividends is False
    assert refreshed.updated_at == "concurrent-edit"
    assert refreshed.security.dividend_research_provider is None
    assert saved["sibling"].manage_dividends is False
    assert saved["sibling"].security.dividend_research_provider is None
    assert saved["still-enabled"].security.dividend_research_provider == "stub"
    assert saved["still-enabled"].security.manual_payout_details[0].amount == 123.45
    assert any(item.amount == 123.45 for item in saved["still-enabled"].security.payout_details)


@pytest.mark.parametrize("enabled", [True, False])
def test_manage_dividends_cosmos_roundtrip_and_legacy_default(enabled):
    original = replace(holding("saved"), manage_dividends=enabled)
    entity = _holding_to_entity("user", original)
    assert entity["manageDividends"] is enabled
    assert _holding_from_entity(entity).manage_dividends is enabled

    del entity["manageDividends"]
    assert _holding_from_entity(entity).manage_dividends is True


def test_manage_dividends_survives_local_store_restart_and_defaults_legacy_records(tmp_path):
    path = tmp_path / "finance.json"
    store = LocalJsonDataStore("local@example.test", path)
    store.holdings["user"] = [replace(holding("disabled"), manage_dividends=False), holding("legacy")]
    store.save()
    data = json.loads(path.read_text())
    assert data["holdings"]["user"][0]["manageDividends"] is False
    del data["holdings"]["user"][1]["manageDividends"]
    path.write_text(json.dumps(data))

    restored = LocalJsonDataStore("local@example.test", path)
    assert [item.manage_dividends for item in restored.holdings["user"]] == [False, True]


def test_manage_dividends_api_defaults_updates_and_preserves_omitted_value():
    client = build_test_client()
    authenticate(client)
    security = client.get("/api/v1/securities/search?q=vti").json()[0]
    payload = {
        "security": security,
        "accountPositions": [{"accountId": "acc-taxable-brokerage", "quantity": 1}],
    }
    created = client.post("/api/v1/holdings", json=payload)
    assert created.status_code == 201
    saved = created.json()
    assert saved["manageDividends"] is True
    holding_url = f"/api/v1/holdings/{saved['id']}"

    disabled = client.put(holding_url, json={**payload, "manageDividends": False})
    assert disabled.status_code == 200
    assert disabled.json()["manageDividends"] is False
    unchanged = client.post(f"{holding_url}/dividends/refresh")
    assert unchanged.status_code == 200
    assert unchanged.json() == disabled.json()

    legacy_update = client.put(holding_url, json=payload)
    assert legacy_update.status_code == 200
    assert legacy_update.json()["manageDividends"] is False
    legacy_batch = client.put("/api/v1/holdings/batch", json={"holdings": [{**payload, "id": saved["id"]}]})
    assert legacy_batch.status_code == 200
    assert legacy_batch.json()[0]["manageDividends"] is False

    enabled = client.put("/api/v1/holdings/batch", json={"holdings": [{**payload, "id": saved["id"], "manageDividends": True}]})
    assert enabled.status_code == 200
    assert enabled.json()[0]["manageDividends"] is True


def test_disabled_setting_created_explicitly_survives_other_holding_mutations():
    client = build_test_client()
    authenticate(client)
    security = client.get("/api/v1/securities/search?q=vti").json()[0]
    created = client.post("/api/v1/holdings", json={
        "security": security,
        "accountPositions": [{"accountId": "acc-taxable-brokerage", "quantity": 1}],
        "manageDividends": False,
    })
    assert created.status_code == 201
    saved = created.json()
    assert saved["manageDividends"] is False
    holding_url = f"/api/v1/holdings/{saved['id']}"

    refreshed = client.post(f"{holding_url}/security-details/refresh")
    assert refreshed.status_code == 200
    assert refreshed.json()["manageDividends"] is False
    imported = client.put("/api/v1/holdings/import", json={"rows": [{
        "symbol": security["symbol"], "name": "Imported name", "price": 200,
    }]})
    assert imported.status_code == 200
    assert imported.json()["holdings"][0]["manageDividends"] is False
    manual = client.put(f"{holding_url}/manual-payouts", json={"manualPayoutDetails": []})
    assert manual.status_code == 200
    assert manual.json()["manageDividends"] is False
    assert next(item for item in client.get("/api/v1/holdings").json() if item["id"] == saved["id"])["manageDividends"] is False
    workspace = client.get("/api/v1/workspace")
    assert workspace.status_code == 200
    assert next(item for item in workspace.json()["holdings"] if item["id"] == saved["id"])["manageDividends"] is False
