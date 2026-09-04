from dataclasses import replace
from datetime import date

import pytest

from app.application.dividend_payouts import merge_dividend_payouts
from app.application.use_cases.dividend_refresh import RefreshHoldingDividends
from app.domain.dividend_research import (
    DividendResearchProvenance,
    DividendResearchRequest,
    DividendResearchValidationError,
    validate_dividend_research_result,
)
from app.domain.models import Holding, HoldingAccountPosition, SecurityMetadata, SecurityPayoutDetails
from app.infrastructure.in_memory_repositories import InMemoryDataStore, InMemoryHoldingRepository
from app.infrastructure.stub_dividend_research import StubDividendResearchProvider


def request(symbol: str = "VTI") -> DividendResearchRequest:
    return DividendResearchRequest(
        symbol=symbol,
        exchange="NYSE Arca",
        currency="USD",
        retrieval_start=date(2024, 1, 1),
        retrieval_end=date(2026, 9, 4),
    )


def holding(holding_id: str, symbol: str = "VTI", growth: float | None = 0.08) -> Holding:
    manual = SecurityPayoutDetails(
        ex_dividend_date="2026-03-01",
        payment_date="2026-03-07",
        amount=9.99,
        source="user",
        mode="manual",
    )
    return Holding(
        id=holding_id,
        security=SecurityMetadata(
            symbol=symbol,
            name=f"{symbol} Fund",
            exchange="NYSE Arca",
            asset_type="ETF",
            currency="USD",
            dividend_growth_rate=growth,
            payout_details=[manual],
            manual_payout_details=[manual],
        ),
        account_positions=[HoldingAccountPosition(account_id="brokerage", quantity=10)],
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
    )


def test_stub_is_deterministic_contract_valid_and_covers_required_years():
    provider = StubDividendResearchProvider()
    first = provider.research(request())
    second = provider.research(request())

    assert first == second
    assert first.symbol == "VTI"
    assert first.provenance.provider == "stub"
    assert first.provenance.authoritative is False
    assert {int(payment.ex_dividend_date[:4]) for payment in first.payments} == {2024, 2025, 2026}
    assert {payment.status for payment in first.payments} == {"completed", "announced"}
    assert validate_dividend_research_result(first, request()) is first


def test_validation_rejects_symbol_and_provenance_mismatches():
    result = StubDividendResearchProvider().research(request())
    with pytest.raises(DividendResearchValidationError, match="symbol"):
        validate_dividend_research_result(replace(result, symbol="MSFT"), request())
    with pytest.raises(DividendResearchValidationError, match="provenance"):
        validate_dividend_research_result(
            replace(result, provenance=DividendResearchProvenance(provider="stub", source_url=None, authoritative=False)),
            request(),
        )


def test_refresh_atomically_updates_same_symbol_and_preserves_each_manual_schedule_and_growth_rate():
    store = InMemoryDataStore()
    store.holdings["user"] = [holding("first", growth=0.08), holding("second", growth=0.12)]
    repository = InMemoryHoldingRepository(store)

    refreshed = RefreshHoldingDividends(repository, StubDividendResearchProvider()).execute("user", "first")
    saved = repository.list_for_user("user")

    assert refreshed.security.dividend_research_provider == "stub"
    assert refreshed.security.dividend_research_adjustment_basis == "current_share_basis"
    assert len(refreshed.security.source_payout_details) == 12
    assert len(refreshed.security.payout_details) == 13
    assert any(payout.amount == 9.99 for payout in refreshed.security.payout_details)
    assert any(payout.source == "stub" for payout in refreshed.security.payout_details)
    assert [item.security.dividend_growth_rate for item in saved] == [0.08, 0.12]
    assert all(item.security.manual_payout_details[0].amount == 9.99 for item in saved)
    assert all(item.security.dividend_research_provider == "stub" for item in saved)


def test_manual_payment_overrides_matching_researched_date_without_hiding_other_facts():
    store = InMemoryDataStore()
    saved = holding("first")
    provider = StubDividendResearchProvider()
    source = provider.research(request()).payments[0]
    override = replace(
        saved.security.manual_payout_details[0],
        ex_dividend_date=source.ex_dividend_date,
        payment_date=source.payment_date,
    )
    saved.security.manual_payout_details = [override]
    store.holdings["user"] = [saved]

    refreshed = RefreshHoldingDividends(InMemoryHoldingRepository(store), provider).execute(
        "user", "first"
    )

    assert len(refreshed.security.payout_details) == 12
    matching = [
        payout for payout in refreshed.security.payout_details
        if payout.ex_dividend_date == source.ex_dividend_date
    ]
    assert len(matching) == 1
    assert matching[0].amount == 9.99
    assert matching[0].mode == "manual"


def test_invalid_provider_result_does_not_mutate_saved_holding():
    class InvalidProvider:
        def research(self, research_request):
            return replace(StubDividendResearchProvider().research(research_request), symbol="WRONG")

    store = InMemoryDataStore()
    original = holding("first")
    store.holdings["user"] = [original]
    repository = InMemoryHoldingRepository(store)

    with pytest.raises(DividendResearchValidationError):
        RefreshHoldingDividends(repository, InvalidProvider()).execute("user", "first")

    assert repository.list_for_user("user") == [original]


def test_merge_preserves_distinct_same_ex_date_source_facts():
    first = SecurityPayoutDetails(
        ex_dividend_date="2026-03-01",
        payment_date="2026-03-07",
        amount=1,
        source="stub",
    )
    second = replace(first, payment_date="2026-03-08", amount=2)
    manual = replace(first, amount=9.99, source="user", mode="manual")

    merged = merge_dividend_payouts([first, second], [manual])

    assert len(merged) == 2
    assert {(payout.payment_date, payout.amount) for payout in merged} == {
        ("2026-03-07", 9.99),
        ("2026-03-08", 2),
    }
