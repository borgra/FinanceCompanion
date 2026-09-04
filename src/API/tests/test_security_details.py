from app.application.use_cases.security_details import (
    RefreshHeldSecurityDetails,
    RefreshHoldingSecurityDetails,
)
from app.domain.models import (
    CorporateAction,
    Holding,
    HoldingAccountPosition,
    SecurityMetadata,
    SecurityPayoutDetails,
)
from app.infrastructure.in_memory_repositories import now_iso


class FakeHoldingRepository:
    def __init__(self, holdings):
        self.holdings = list(holdings)

    def list_for_user(self, user_id: str):
        return list(self.holdings)

    def create_for_user(self, user_id: str, holding: Holding):
        self.holdings.append(holding)
        return holding

    def update_for_user(self, user_id: str, holding_id: str, holding: Holding):
        self.holdings = [
            holding if item.id == holding_id else item
            for item in self.holdings
        ]
        return holding


class FakeSecurityDetailsProvider:
    def __init__(self):
        self.requested_symbols = []

    def get_details(self, security: SecurityMetadata):
        self.requested_symbols.append(security.symbol)
        return SecurityMetadata(
            symbol=security.symbol,
            name=security.name,
            exchange=security.exchange,
            asset_type=security.asset_type,
            currency=security.currency,
            price=321.45,
            pe_ratio=24.6,
            dividend_previous_year=3.4,
            dividend_current_year=3.6,
            dividend_growth_rate=0.0588,
            dividend_status="recent",
            sma20=318.2,
        )


def holding(
    holding_id: str,
    symbol: str = "VTI",
    details_updated_at: str | None = None,
) -> Holding:
    return Holding(
        id=holding_id,
        security=SecurityMetadata(
            symbol=symbol,
            name="Vanguard Total Stock Market ETF",
            exchange="NYSE Arca",
            dividend_previous_year=1.1,
            dividend_current_year=1.2,
            dividend_growth_rate=0.09,
            estimated_future_payout=1.3,
            dividend_status="manual",
            payout_details=[SecurityPayoutDetails(
                ex_dividend_date="2026-07-01",
                payment_date="2026-07-05",
                amount=0.31,
                source="user",
                mode="manual",
            )],
            source_payout_details=[SecurityPayoutDetails(
                ex_dividend_date="2025-07-01",
                amount=0.21,
                source="saved-source",
            )],
            manual_payout_details=[SecurityPayoutDetails(
                ex_dividend_date="2026-07-01", payment_date="2026-07-05", amount=0.31, source="user", mode="manual",
            )],
            corporate_actions=[CorporateAction(
                id="split-1",
                effective_date="2024-06-01",
                type="stock_split",
                old_shares=1,
                new_shares=2,
            )],
            dividend_research_retrieved_at="2026-09-04T00:00:00Z",
            dividend_research_provider="stub",
            dividend_research_source_url="https://example.test/stub",
            dividend_research_authoritative=False,
            dividend_research_schema_version=1,
            dividend_research_adjustment_basis="current_share_basis",
            dividend_research_warnings=["Non-authoritative stub data."],
            asset_type="ETF",
            currency="USD",
            price=315.12,
            details_updated_at=details_updated_at,
        ),
        account_positions=[
            HoldingAccountPosition("acc-taxable-brokerage", 12.5, 3100),
        ],
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
    )


def test_refresh_holding_security_details_persists_merged_details():
    repository = FakeHoldingRepository([holding("holding-1")])
    provider = FakeSecurityDetailsProvider()

    refreshed = RefreshHoldingSecurityDetails(repository, provider).execute(
        "user-123",
        "holding-1",
    )

    assert provider.requested_symbols == ["VTI"]
    assert refreshed.security.price == 321.45
    assert refreshed.security.pe_ratio == 24.6
    assert refreshed.security.dividend_previous_year == 1.1
    assert refreshed.security.dividend_current_year == 1.2
    assert refreshed.security.dividend_growth_rate == 0.09
    assert refreshed.security.estimated_future_payout == 1.3
    assert refreshed.security.dividend_status == "manual"
    assert refreshed.security.payout_details[0].amount == 0.31
    assert refreshed.security.source_payout_details[0].amount == 0.21
    assert refreshed.security.manual_payout_details[0].amount == 0.31
    assert refreshed.security.payout_details[0].mode == "manual"
    assert refreshed.security.corporate_actions[0].id == "split-1"
    assert refreshed.security.dividend_research_retrieved_at == "2026-09-04T00:00:00Z"
    assert refreshed.security.dividend_research_provider == "stub"
    assert refreshed.security.dividend_research_source_url == "https://example.test/stub"
    assert refreshed.security.dividend_research_authoritative is False
    assert refreshed.security.dividend_research_schema_version == 1
    assert refreshed.security.dividend_research_adjustment_basis == "current_share_basis"
    assert refreshed.security.dividend_research_warnings == ["Non-authoritative stub data."]
    assert refreshed.security.sma20 == 318.2
    assert refreshed.security.details_status == "fresh"
    assert refreshed.security.details_updated_at is not None
    assert repository.holdings[0].security.price == 321.45


def test_refresh_holding_security_details_refreshes_same_day_details_when_requested():
    repository = FakeHoldingRepository([
        holding("holding-1", details_updated_at=now_iso()),
    ])
    provider = FakeSecurityDetailsProvider()

    refreshed = RefreshHoldingSecurityDetails(repository, provider).execute(
        "user-123",
        "holding-1",
    )

    assert provider.requested_symbols == ["VTI"]
    assert refreshed.security.price == 321.45


def test_bulk_refresh_deduplicates_symbols_and_updates_matching_holdings():
    repository = FakeHoldingRepository([
        holding("holding-1", "VTI"),
        holding("holding-2", "VTI"),
    ])
    provider = FakeSecurityDetailsProvider()

    result = RefreshHeldSecurityDetails(repository, provider).execute("user-123")

    assert provider.requested_symbols == ["VTI"]
    assert result.failed_symbols == []
    assert [item.security.price for item in result.holdings] == [321.45, 321.45]

    assert all(item.security.dividend_current_year == 1.2 for item in result.holdings)
    assert all(item.security.payout_details[0].amount == 0.31 for item in result.holdings)
    assert all(item.security.manual_payout_details[0].mode == "manual" for item in result.holdings)

def test_bulk_refresh_skips_details_updated_within_48_hours():
    repository = FakeHoldingRepository([
        holding("holding-1", "VTI", details_updated_at=now_iso()),
        holding("holding-2", "MSFT", details_updated_at="2026-01-01T00:00:00Z"),
    ])
    provider = FakeSecurityDetailsProvider()

    result = RefreshHeldSecurityDetails(repository, provider).execute("user-123")

    assert provider.requested_symbols == ["MSFT"]
    assert result.failed_symbols == []
    assert [item.security.price for item in result.holdings] == [315.12, 321.45]


def test_refresh_preserves_a_manually_saved_price_when_the_provider_returns_null():
    class NullPriceProvider:
        def get_details(self, security: SecurityMetadata):
            return SecurityMetadata(
                symbol=security.symbol,
                name=security.name,
                exchange=security.exchange,
                asset_type=security.asset_type,
                currency=security.currency,
                price=None,
            )

    manually_priced = holding("holding-1")
    manually_priced.security.price = 325.25
    repository = FakeHoldingRepository([manually_priced])

    refreshed = RefreshHoldingSecurityDetails(repository, NullPriceProvider()).execute(
        "user-123",
        "holding-1",
    )

    assert refreshed.security.price == 325.25
    assert refreshed.security.details_updated_at is None


def test_cash_security_refreshes_return_unchanged_without_provider_calls():
    cash = holding("cash", "CASH")
    cash.security.asset_type = "Cash"
    cash.security.name = "Legacy cash"
    cash.security.exchange = "Legacy"
    cash.security.currency = "EUR"
    cash.security.price = 99
    repository = FakeHoldingRepository([cash, holding("security")])
    provider = FakeSecurityDetailsProvider()

    individual = RefreshHoldingSecurityDetails(repository, provider).execute("user-123", "cash")
    bulk = RefreshHeldSecurityDetails(repository, provider).execute("user-123")

    assert individual == cash
    assert bulk.holdings[0] == cash
    assert provider.requested_symbols == ["VTI"]
