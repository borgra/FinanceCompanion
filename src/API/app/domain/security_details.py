"""Stock research contracts; intentionally exclude payments and account positions."""
from __future__ import annotations

from dataclasses import dataclass, field

from app.domain.models import SecurityMetadata


DETAIL_FIELDS = (
    "price", "sector", "industry", "pe_ratio", "thirty_day_yield",
    "fifty_two_week_low", "fifty_two_week_high", "sma20", "sma50", "sma200",
)


def canonical_exchange(value: str) -> str:
    value = " ".join(value.strip().rstrip(".").upper().split())
    return {
        "XNAS": "NASDAQ", "NASDAQGS": "NASDAQ", "NASDAQGM": "NASDAQ", "NASDAQCM": "NASDAQ",
        "NASDAQ GLOBAL SELECT": "NASDAQ", "XNYS": "NYSE", "NYSEARCA": "NYSE ARCA",
        "ARCX": "NYSE ARCA", "NYSE ARCA, INC": "NYSE ARCA", "NYSE ARCA INC": "NYSE ARCA",
        "NYSE MKT": "NYSE AMERICAN",
    }.get(value, value)


def canonical_asset_type(value: str) -> str:
    value = " ".join(value.strip().lower().split())
    return {
        "equity": "Stock", "stock": "Stock", "common stock": "Stock",
        "etf": "ETF", "etfs": "ETF", "exchange traded fund": "ETF", "exchange-traded fund": "ETF",
        "mutual fund": "Mutual Fund", "mutualfund": "Mutual Fund", "mutual funds": "Mutual Fund",
    }.get(value, value)


def listing_key(security: SecurityMetadata) -> tuple[str, ...]:
    asset = canonical_asset_type(security.asset_type)
    return (security.symbol.strip().upper(), canonical_exchange(security.exchange), asset,
            security.currency.strip().upper(), " ".join(security.name.upper().split()) if asset == "Mutual Fund" else "")


@dataclass(slots=True)
class SecurityDetailsResult:
    name: str | None = None
    price: float | None = None
    sector: str | None = None
    industry: str | None = None
    pe_ratio: float | None = None
    thirty_day_yield: float | None = None
    fifty_two_week_low: float | None = None
    fifty_two_week_high: float | None = None
    sma20: float | None = None
    sma50: float | None = None
    sma200: float | None = None
    provenance: dict = field(default_factory=dict)
    status: str = "partial"
