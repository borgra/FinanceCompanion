from dataclasses import fields, replace
from datetime import date
from unittest.mock import Mock

import pytest

from app.application.use_cases.dividend_refresh import RefreshHoldingDividends
from app.application.use_cases.holdings import RemoveHoldingPaymentData
from app.domain.exceptions import NotFoundError
from app.domain.models import CorporateAction
from app.infrastructure.in_memory_repositories import InMemoryDataStore, InMemoryHoldingRepository, now_iso
from app.infrastructure.stub_dividend_research import StubDividendResearchProvider
from test_api_contracts import authenticate, build_test_client
from test_dividend_refresh import holding


def populated_holding(holding_id="target", *, manage_dividends=False):
    original = holding(holding_id)
    payment = original.security.manual_payout_details[0]
    return replace(original, manage_dividends=manage_dividends, security=replace(
        original.security,
        price=123.45,
        source_payout_details=[replace(payment, mode="source")],
        payout_details=[payment, replace(payment, status="projected", mode="source")],
        payout_audit_details=[replace(payment, status="superseded")],
        corporate_actions=[CorporateAction("split", "2025-01-01", "stock_split", 1, 2)],
        dividend_previous_year=3,
        dividend_current_year=4,
        estimated_future_payout=5,
        dividend_status="researched",
        dividend_research_retrieved_at=now_iso(),
        dividend_research_provider="test",
        dividend_research_source_url="https://example.test/dividends",
        dividend_research_authoritative=True,
        dividend_research_schema_version=2,
        dividend_research_adjustment_basis="current_share_basis",
        dividend_research_warnings=["saved warning"],
        dividend_research_as_of="2026-09-04",
        dividend_research_status="fresh",
        dividend_research_history_start="2024-09-04",
        dividend_research_forecast_end="2027-12-31",
        dividend_research_snapshot_id="snapshot-id",
        dividend_research_cache_key="provider-v1",
        dividend_research_snapshot={"inputEvents": [{"id": "event"}]},
    ))


def assert_payment_data_cleared(original, cleared):
    assert cleared.account_positions == original.account_positions
    assert cleared.manage_dividends is original.manage_dividends
    assert cleared.created_at == original.created_at
    assert cleared.id == original.id
    for name in ("payout_details", "source_payout_details", "manual_payout_details", "payout_audit_details"):
        assert getattr(cleared.security, name) == []
    for item in fields(cleared.security):
        if item.name.startswith("dividend_research_"):
            value = getattr(cleared.security, item.name)
            assert value == ([] if item.name.endswith("warnings") else {} if item.name.endswith("snapshot") else None)
    for name in ("dividend_previous_year", "dividend_current_year", "estimated_future_payout", "dividend_status"):
        assert getattr(cleared.security, name) is None
    for name in ("symbol", "name", "exchange", "asset_type", "currency", "price", "corporate_actions", "dividend_growth_rate"):
        assert getattr(cleared.security, name) == getattr(original.security, name)


def test_remove_clears_only_selected_holding_payment_data_and_preserves_configuration():
    original = populated_holding()
    sibling = populated_holding("same-security")
    foreign = populated_holding("foreign")
    store = InMemoryDataStore()
    store.holdings["user"] = [original, sibling]
    store.holdings["other-user"] = [foreign]
    repository = InMemoryHoldingRepository(store)

    cleared = RemoveHoldingPaymentData(repository).execute("user", original.id)

    assert_payment_data_cleared(original, cleared)
    assert repository.list_for_user("user") == [cleared, sibling]
    assert repository.list_for_user("other-user") == [foreign]


def test_remove_uses_ownership_and_cash_is_unchanged():
    store = InMemoryDataStore()
    cash = holding("cash", "CASH")
    cash.security.asset_type = "Cash"
    store.holdings["user"] = [cash]
    store.holdings["other-user"] = [populated_holding("foreign")]
    repository = InMemoryHoldingRepository(store)
    use_case = RemoveHoldingPaymentData(repository)

    for holding_id in ("missing", "foreign"):
        with pytest.raises(NotFoundError):
            use_case.execute("user", holding_id)
    assert use_case.execute("user", "cash") == cash
    assert repository.list_for_user("user") == [cash]


def test_remove_invalidates_fresh_research_cache_so_next_refresh_calls_provider():
    original = populated_holding(manage_dividends=True)
    store = InMemoryDataStore()
    store.holdings["user"] = [original]
    repository = InMemoryHoldingRepository(store)
    provider = Mock(wraps=StubDividendResearchProvider())
    provider.cache_key = "provider-v1"
    refresh = RefreshHoldingDividends(repository, provider, today=lambda: date(2026, 9, 4))
    assert refresh.execute("user", original.id) == original
    provider.research.assert_not_called()

    RemoveHoldingPaymentData(repository).execute("user", original.id)
    refreshed = refresh.execute("user", original.id)

    provider.research.assert_called_once()
    assert refreshed.security.source_payout_details
    assert refreshed.security.dividend_research_cache_key == "provider-v1"
    assert refreshed.security.dividend_growth_rate == original.security.dividend_growth_rate


def test_remove_payments_http_is_scoped_and_returns_updated_holding_with_ownership_errors():
    client = build_test_client()
    authenticate(client)
    store = client.app.state.container.list_holdings._repository._store
    original = populated_holding()
    sibling = populated_holding("same-security")
    foreign = populated_holding("foreign")
    store.holdings["user-steve"] = [original, sibling]
    store.holdings["other-user"] = [foreign]

    for holding_id in ("missing", "foreign"):
        response = client.delete(f"/api/v1/holdings/{holding_id}/payouts")
        assert response.status_code == 404

    response = client.delete(f"/api/v1/holdings/{original.id}/payouts")
    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == original.id
    assert payload["manageDividends"] is False
    assert payload["security"]["dividendGrowthRate"] == original.security.dividend_growth_rate
    assert payload["security"]["payoutDetails"] == []
    assert payload["security"]["dividendResearchRetrievedAt"] is None
    saved = {item.id: item for item in store.holdings["user-steve"]}
    assert_payment_data_cleared(original, saved[original.id])
    assert saved[sibling.id] == sibling
    assert store.holdings["other-user"] == [foreign]


def test_remove_payments_http_requires_authentication():
    response = build_test_client().delete("/api/v1/holdings/target/payouts")
    assert response.status_code == 401
