from __future__ import annotations

import requests

from app.domain.exceptions import DomainError
from app.domain.models import SecurityMetadata


class SecuritySearchUnavailableError(DomainError):
    """Raised when the security search provider cannot serve a request."""


class YahooFinanceSecuritySearchProvider:
    def __init__(self, timeout_seconds: float = 8.0) -> None:
        self._timeout_seconds = timeout_seconds

    def search(self, query: str) -> list[SecurityMetadata]:
        try:
            response = requests.get(
                "https://query1.finance.yahoo.com/v1/finance/search",
                params={
                    "q": query.strip(),
                    "quotesCount": 8,
                    "newsCount": 0,
                },
                timeout=self._timeout_seconds,
                headers={"User-Agent": "FinanceCompanion/1.0"},
            )
            response.raise_for_status()
            payload = response.json()
        except (requests.RequestException, ValueError) as exc:
            raise SecuritySearchUnavailableError("Security search is unavailable.") from exc

        quotes = payload.get("quotes", [])
        return [
            SecurityMetadata(
                symbol=item.get("symbol", "").strip().upper(),
                name=(
                    item.get("longname")
                    or item.get("shortname")
                    or item.get("name")
                    or item.get("symbol")
                    or ""
                ).strip(),
                exchange=(
                    item.get("exchDisp")
                    or item.get("exchange")
                    or item.get("exchangeName")
                    or "Unknown"
                ).strip(),
                asset_type=(item.get("quoteType") or item.get("typeDisp") or "Unknown").strip(),
                currency=(item.get("currency") or "USD").strip(),
                price=(
                    float(item["regularMarketPrice"])
                    if item.get("regularMarketPrice") is not None
                    else None
                ),
                sector=None,
                industry=None,
            )
            for item in quotes
            if item.get("symbol") and (item.get("longname") or item.get("shortname") or item.get("name"))
        ][:8]
