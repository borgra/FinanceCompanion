from __future__ import annotations

from dataclasses import dataclass, field, replace


CASH_ASSET_TYPE = "Cash"


def is_cash_asset_type(asset_type: str) -> bool:
    """Return true only for the canonical Cash asset type."""
    return asset_type == CASH_ASSET_TYPE


@dataclass(slots=True)
class SecurityPayoutDetails:
    ex_dividend_date: str
    amount: float
    declaration_date: str | None = None
    record_date: str | None = None
    payment_date: str | None = None
    source: str | None = None
    source_url: str | None = None
    status: str = "completed"
    mode: str = "source"


@dataclass(slots=True)
class CorporateAction:
    id: str
    effective_date: str
    type: str
    old_shares: float
    new_shares: float


@dataclass(slots=True)
class SecurityMetadata:
    symbol: str
    name: str
    exchange: str
    asset_type: str
    currency: str
    price: float | None = None
    sector: str | None = None
    industry: str | None = None
    pe_ratio: float | None = None
    thirty_day_yield: float | None = None
    fifty_two_week_low: float | None = None
    fifty_two_week_high: float | None = None
    dividend_previous_year: float | None = None
    dividend_current_year: float | None = None
    dividend_growth_rate: float | None = None
    estimated_future_payout: float | None = None
    dividend_status: str | None = None
    sma20: float | None = None
    sma50: float | None = None
    sma200: float | None = None
    details_updated_at: str | None = None
    details_status: str | None = None
    payout_details: list[SecurityPayoutDetails] = field(default_factory=list)
    source_payout_details: list[SecurityPayoutDetails] = field(default_factory=list)
    manual_payout_details: list[SecurityPayoutDetails] = field(default_factory=list)
    corporate_actions: list[CorporateAction] = field(default_factory=list)
    dividend_research_retrieved_at: str | None = None
    dividend_research_provider: str | None = None
    dividend_research_source_url: str | None = None
    dividend_research_authoritative: bool | None = None
    dividend_research_schema_version: int | None = None
    dividend_research_adjustment_basis: str | None = None
    dividend_research_warnings: list[str] = field(default_factory=list)


def is_cash_security(security: SecurityMetadata) -> bool:
    return is_cash_asset_type(security.asset_type)


def normalize_security_metadata(security: SecurityMetadata) -> SecurityMetadata:
    """Normalize Cash's identity and unit price while preserving other metadata."""
    if not is_cash_security(security):
        return security
    return replace(
        security,
        symbol="CASH",
        name="Cash",
        exchange="Cash",
        currency="USD",
        price=1,
    )
