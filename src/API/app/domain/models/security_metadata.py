from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class SecurityPayoutDetails:
    ex_dividend_date: str
    amount: float
    declaration_date: str | None = None
    record_date: str | None = None
    payment_date: str | None = None
    source: str | None = None


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
    sma20: float | None = None
    sma50: float | None = None
    sma200: float | None = None
    details_updated_at: str | None = None
    details_status: str | None = None
    payout_details: list[SecurityPayoutDetails] = field(default_factory=list)
