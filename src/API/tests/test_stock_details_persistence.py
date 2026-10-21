"""Research must survive real serializers without changing unrelated finance data."""
from copy import deepcopy
from dataclasses import fields, replace
from datetime import UTC, datetime, timedelta
import json
from unittest.mock import MagicMock

from azure.core import MatchConditions
from azure.data.tables import TableEntity
import httpx
import pytest
from fastapi.testclient import TestClient

from app.application.use_cases.security_details import (
    RefreshHeldSecurityDetails, RefreshHoldingSecurityDetails, merge_security_details,
    should_refresh_security_details,
)
from app.application.use_cases.holdings import UpdateHolding
from app.domain.exceptions import NotFoundError, SecurityDetailsUnavailableError
from app.domain.models import HoldingAccountPosition
from app.domain.security_details import DETAIL_FIELDS, SecurityDetailsResult
from app.infrastructure.cosmos_repositories import (
    CosmosHoldingRepository, _holding_to_entity, _holding_from_entity,
)
from app.infrastructure.in_memory_repositories import InMemoryDataStore, InMemoryHoldingRepository
from app.infrastructure.local_json_store import LocalJsonDataStore
from app.infrastructure.settings import Settings
from app.main import create_app
from test_foundry_stock_details import provider, security, details, NOW
from test_security_details import holding


def repository():
    store = InMemoryDataStore()
    store.holdings = {"owner": [holding("first"), holding("second")], "other": [holding("first")]}
    return store, InMemoryHoldingRepository(store)


def assert_preserved(before, after):
    allowed = {*DETAIL_FIELDS, "name", "details_updated_at", "details_status", "details_provenance"}
    for field in fields(before.security):
        if field.name not in allowed:
            assert getattr(after.security, field.name) == getattr(before.security, field.name), field.name
    assert after.account_positions == before.account_positions
    assert after.manage_dividends == before.manage_dividends
    assert after.created_at == before.created_at and after.id == before.id


def test_individual_fans_out_only_matching_owned_listing_and_preserves_all_other_fields():
    store, repo = repository()
    store.holdings["owner"][0].manage_dividends = False
    store.holdings["owner"].append(replace(holding("other-exchange"),
        security=replace(holding("unused").security, exchange="NASDAQ")))
    before = deepcopy(store.holdings)

    class Fake:
        def get_details(self, saved):
            return SecurityDetailsResult(price=99, thirty_day_yield=0)

    RefreshHoldingSecurityDetails(repo, Fake()).execute("owner", "first")
    for old, saved in zip(before["owner"][:2], repo.list_for_user("owner")[:2]):
        assert saved.security.price == 99 and saved.security.thirty_day_yield == 0
        assert_preserved(old, saved)
    assert repo.list_for_user("owner")[2] == before["owner"][2]
    assert repo.list_for_user("other") == before["other"]


@pytest.mark.parametrize("mutation", ["price", "sector", "name", "listing", "delete"])
def test_concurrent_stock_edits_or_deletion_are_not_overwritten(mutation):
    store, repo = repository()

    class Fake:
        def get_details(self, saved):
            latest = repo.list_for_user("owner")[0]
            if mutation == "delete":
                repo.delete_for_user("owner", latest.id)
            else:
                changes = {mutation: 55 if mutation == "price" else "changed"}
                if mutation == "listing":
                    changes = {"exchange": "NASDAQ"}
                repo.update_for_user("owner", latest.id, replace(latest, security=replace(latest.security, **changes)))
            self.after = deepcopy(store.holdings)
            return SecurityDetailsResult(price=99)

    fake = Fake()
    with pytest.raises((NotFoundError, SecurityDetailsUnavailableError)):
        RefreshHoldingSecurityDetails(repo, fake).execute("owner", "first")
    assert store.holdings == fake.after


def test_concurrent_position_and_dividend_changes_are_merged_from_latest_record():
    _, repo = repository()

    class Fake:
        def get_details(self, saved):
            latest = repo.list_for_user("owner")[0]
            repo.update_for_user("owner", latest.id, replace(latest,
                account_positions=[HoldingAccountPosition("account", 500, 1000)],
                security=replace(latest.security, dividend_growth_rate=0.25)))
            return SecurityDetailsResult(price=99)

    saved = RefreshHoldingSecurityDetails(repo, Fake()).execute("owner", "first")
    assert saved.security.price == 99 and saved.security.dividend_growth_rate == 0.25
    assert saved.account_positions == [HoldingAccountPosition("account", 500, 1000)]


def test_same_listing_cannot_refresh_twice_while_in_flight():
    _, repo = repository()

    class Fake:
        def get_details(self, saved):
            with pytest.raises(SecurityDetailsUnavailableError, match="in progress"):
                refresh.execute("owner", "second")
            return SecurityDetailsResult(price=99)

    refresh = RefreshHoldingSecurityDetails(repo, Fake())
    assert refresh.execute("owner", "first").security.price == 99


def test_bulk_retains_successes_reports_failure_once_and_deduplicates_listings():
    store, repo = repository()
    store.holdings["owner"] += [holding("failed", "FAIL"), holding("failed2", "FAIL")]
    calls = []

    class Fake:
        def get_details(self, saved):
            calls.append(saved.symbol)
            if saved.symbol == "FAIL":
                raise SecurityDetailsUnavailableError("No reliable price")
            return SecurityDetailsResult(price=99)

    before = deepcopy(store.holdings["owner"])
    result = RefreshHeldSecurityDetails(repo, Fake()).execute("owner")
    assert calls == ["VTI", "FAIL"] and result.failed_symbols == ["FAIL"]
    assert [item.security.price for item in result.holdings[:2]] == [99, 99]
    assert result.holdings[2:] == before[2:]


@pytest.mark.parametrize("timestamp", [None, "bad", "2026-01-01T00:00:00", (datetime.now(UTC) + timedelta(days=2)).isoformat()])
def test_missing_invalid_naive_and_future_success_times_are_eligible(timestamp):
    assert should_refresh_security_details(replace(security(), details_updated_at=timestamp))


def test_partial_refresh_preserves_old_metric_evidence_without_reusing_new_source_id():
    first = provider(details(pe_ratio=10, field_evidence=[
        dict(field=field, source_ids=["s1"], as_of="2026-10-20") for field in ("identity", "price", "pe_ratio")
    ])).get_details(security())
    current = merge_security_details(security(), first, status="partial", updated_at=NOW.isoformat())
    next_result = provider(details(sources=[dict(id="s1", url="https://other.example/quote", title="New quote")]),
        change_response=lambda response: response["output"][0]["action"]["sources"].append(dict(url="https://other.example/quote"))).get_details(security())
    merged = merge_security_details(current, next_result, status="partial", updated_at=NOW.isoformat())
    assert merged.pe_ratio == 10
    old = next(item for item in merged.details_provenance["fieldEvidence"] if item["field"] == "pe_ratio")
    assert old["sourceIds"] == ["saved-s1"] and old["asOf"] == "2026-10-20"
    source = next(item for item in merged.details_provenance["sources"] if item["id"] == "saved-s1")
    assert source["url"] != "https://other.example/quote"


def test_json_stock_refresh_roundtrip_is_atomic_and_keeps_metric_names_in_evidence(tmp_path):
    path = tmp_path / "finance.json"
    store = LocalJsonDataStore("local@example.test", path)
    entry = replace(holding("synthetic"), security=replace(holding("old").security,
        symbol="MSFT", name="Microsoft Corporation", exchange="NASDAQ", asset_type="Equity"))
    # Match the canonical distribution merge that all persisted holdings receive
    # on load; this fixture initially omits its source row from merged payouts.
    entry = _holding_from_entity(_holding_to_entity("owner", entry))
    store.holdings["owner"] = [entry]
    store.save()
    repo = InMemoryHoldingRepository(store)
    refreshed = RefreshHoldingSecurityDetails(repo, provider()).execute("owner", entry.id)
    restored = LocalJsonDataStore("local@example.test", path).holdings["owner"][0]
    assert refreshed == restored
    assert_preserved(entry, restored)
    assert restored.security.details_provenance["fieldEvidence"][0]["sourceIds"]
    assert restored.security.details_status == "partial"

    before = path.read_bytes()
    with pytest.raises(SecurityDetailsUnavailableError):
        RefreshHoldingSecurityDetails(repo, provider(status=403)).execute("owner", entry.id)
    assert path.read_bytes() == before and repo.list_for_user("owner")[0] == restored


def test_json_save_failure_rolls_back_memory_and_preserves_previous_file(tmp_path, monkeypatch):
    path = tmp_path / "finance.json"
    store = LocalJsonDataStore("local@example.test", path)
    store.holdings["owner"] = [holding("first")]
    store.save()
    before, disk = deepcopy(store.holdings), path.read_bytes()

    class Fake:
        def get_details(self, saved):
            return SecurityDetailsResult(price=99)

    def fail():
        raise OSError("cannot write")
    monkeypatch.setattr(store, "save", fail)
    with pytest.raises(SecurityDetailsUnavailableError):
        RefreshHoldingSecurityDetails(InMemoryHoldingRepository(store), Fake()).execute("owner", "first")
    assert store.holdings == before and path.read_bytes() == disk


def test_memory_conditional_batch_rejects_change_between_read_and_write():
    store, repo = repository()
    expected = repo.list_for_user("owner")
    repo.update_for_user("owner", "first", replace(expected[0], manage_dividends=False))
    before = deepcopy(store.holdings)
    with pytest.raises(SecurityDetailsUnavailableError, match="changed"):
        repo.update_batch_for_user("owner", [replace(expected[0], security=security(price=99))], expected=expected)
    assert store.holdings == before


def test_cosmos_roundtrip_and_conditional_transaction_use_etag():
    entry = replace(holding("first"), security=security())
    result = provider().get_details(entry.security)
    updated = replace(entry, security=merge_security_details(entry.security, result,
        status="partial", updated_at=NOW.isoformat()))
    current = TableEntity(_holding_to_entity("owner", entry))
    current._metadata = {"etag": 'W/"version-1"'}
    client = MagicMock()
    client.query_entities.return_value = [current]
    client.get_entity.return_value = current
    CosmosHoldingRepository(client).update_batch_for_user("owner", [updated], expected=[entry])
    operation, entity, options = client.submit_transaction.call_args.args[0][0]
    assert operation == "update" and options["etag"] == 'W/"version-1"'
    assert options["match_condition"] is MatchConditions.IfNotModified
    assert _holding_from_entity(entity) == updated
    assert json.loads(entity["securityDetails"])["detailsProvenance"] == updated.security.details_provenance
    assert entity["accountPositionsJson"] == current["accountPositionsJson"]


def test_cosmos_does_not_submit_when_expected_holding_changed():
    entry = holding("first")
    changed = replace(entry, manage_dividends=False)
    current = TableEntity(_holding_to_entity("owner", changed))
    current._metadata = {"etag": 'W/"version-2"'}
    client = MagicMock()
    client.query_entities.return_value = [current]
    client.get_entity.return_value = current
    with pytest.raises(SecurityDetailsUnavailableError, match="changed"):
        CosmosHoldingRepository(client).update_batch_for_user("owner", [entry], expected=[entry])
    client.submit_transaction.assert_not_called()


def test_oversized_evidence_fails_before_any_repository_write():
    store, repo = repository()
    before = deepcopy(store.holdings)

    class Fake:
        def get_details(self, saved):
            return SecurityDetailsResult(price=99, provenance={"warnings": ["x" * 16_000]})

    with pytest.raises(SecurityDetailsUnavailableError, match="capacity"):
        RefreshHoldingSecurityDetails(repo, Fake()).execute("owner", "first")
    assert store.holdings == before


def test_http_roundtrip_uses_agent_once_persists_once_and_rejects_failed_refresh(tmp_path, monkeypatch):
    path = tmp_path / "finance.json"
    from app.infrastructure import foundry_stock_details as stock
    calls = []
    instance = provider(calls=calls)
    monkeypatch.setattr(stock, "FoundryStockDetailsProvider", lambda **kwargs: instance)
    settings = Settings(_env_file=None, data_backend="json", local_json_path=str(path),
        disable_auth_for_local_development=True, dividend_research_provider="azure_foundry",
        azure_foundry_endpoint="https://demo.services.ai.azure.com/api/projects/income", azure_foundry_deployment="gpt-6-luna",
        azure_foundry_agent_version="1", azure_foundry_stock_details_agent_version="1",
        azure_foundry_rai_policy_id="/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/finance/providers/Microsoft.CognitiveServices/accounts/demo/raiPolicies/research")
    app = create_app(settings)
    store = app.state.container.data_store
    entry = replace(holding("synthetic"), security=security(price=80, dividend_growth_rate=0.1))
    store.holdings["user-steve"] = [entry]
    store.save()
    actual_save = store.save
    saves = []
    def save():
        saves.append(True)
        actual_save()
    monkeypatch.setattr(store, "save", save)
    client = TestClient(app)
    response = client.post("/api/v1/holdings/synthetic/security-details/refresh")
    assert response.status_code == 200, response.text
    assert len(calls) == 1 and len(saves) == 1
    assert response.json()["security"]["detailsProvenance"]["agentName"] == "stock-details-agent"
    before, disk = deepcopy(store.holdings), path.read_bytes()
    instance._transport._client = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(403, text="secret")))
    response = client.post("/api/v1/holdings/synthetic/security-details/refresh")
    assert response.status_code == 503 and "secret" not in response.text
    assert path.read_bytes() == disk and store.holdings == before
    assert len(saves) == 1


def test_manual_price_edit_does_not_inherit_or_forge_ai_quote_evidence():
    _, repo = repository()
    entry = repo.list_for_user("owner")[0]
    researched = replace(entry, security=merge_security_details(security(), provider().get_details(security()),
        status="partial", updated_at=NOW.isoformat()))
    repo.update_for_user("owner", entry.id, researched)
    draft = replace(researched, security=replace(researched.security, price=999,
        details_provenance={"provider": "fabricated", "fieldEvidence": [{"field": "price"}]}))
    saved = UpdateHolding(repo).execute("owner", entry.id, draft)
    assert saved.security.price == 999 and saved.security.details_status == "manual"
    assert saved.security.details_provenance["provider"] == "azure_foundry"
    assert saved.security.details_provenance["priceKind"] is None
    assert all(item["field"] != "price" for item in saved.security.details_provenance["fieldEvidence"])
    assert any(item["field"] == "sector" for item in saved.security.details_provenance["fieldEvidence"])
