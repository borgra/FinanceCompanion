from __future__ import annotations

from dataclasses import dataclass


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
