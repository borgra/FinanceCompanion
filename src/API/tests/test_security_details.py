from app.application.use_cases.security_details import (
    RefreshHeldSecurityDetails,
    RefreshHoldingSecurityDetails,
)
from app.domain.models import Holding, HoldingAccountPosition, SecurityMetadata
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
    assert refreshed.security.dividend_previous_year == 3.4
    assert refreshed.security.dividend_current_year == 3.6
    assert refreshed.security.dividend_growth_rate == 0.0588
    assert refreshed.security.dividend_status == "recent"
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


def test_bulk_refresh_refreshes_all_requested_details():
    repository = FakeHoldingRepository([
        holding("holding-1", "VTI", details_updated_at=now_iso()),
        holding("holding-2", "MSFT", details_updated_at="2026-01-01T00:00:00Z"),
    ])
    provider = FakeSecurityDetailsProvider()

    result = RefreshHeldSecurityDetails(repository, provider).execute("user-123")

    assert provider.requested_symbols == ["VTI", "MSFT"]
    assert result.failed_symbols == []
    assert [item.security.price for item in result.holdings] == [321.45, 321.45]
