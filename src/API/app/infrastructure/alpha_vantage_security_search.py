from __future__ import annotations

import requests

from app.domain.exceptions import DomainError
from app.domain.models import SecurityMetadata


class SecuritySearchUnavailableError(DomainError):
    """Raised when the security search provider cannot serve a request."""


class AlphaVantageSecuritySearchProvider:
    def __init__(self, api_key: str | None, timeout_seconds: float = 10.0) -> None:
        self._api_key = api_key
        self._timeout_seconds = timeout_seconds

    def search(self, query: str) -> list[SecurityMetadata]:
        if not self._api_key or self._api_key == "not-configured":
            raise SecuritySearchUnavailableError("Security search is not configured.")

        try:
            response = requests.get(
                "https://www.alphavantage.co/query",
                params={
                    "function": "SYMBOL_SEARCH",
                    "keywords": query.strip(),
                    "apikey": self._api_key,
                },
                timeout=self._timeout_seconds,
                headers={"User-Agent": "FinanceCompanion/1.0"},
            )
            response.raise_for_status()
            payload = response.json()
        except (requests.RequestException, ValueError) as exc:
            raise SecuritySearchUnavailableError("Security search is unavailable.") from exc

        if "Error Message" in payload or "Information" in payload:
            raise SecuritySearchUnavailableError("Security search is unavailable.")

        matches = payload.get("bestMatches", [])
        return [
            SecurityMetadata(
                symbol=item.get("1. symbol", "").strip().upper(),
                name=(item.get("2. name") or item.get("1. symbol") or "").strip(),
                exchange=(item.get("4. region") or "Unknown").strip(),
                asset_type=(item.get("3. type") or "Unknown").strip(),
                currency=(item.get("8. currency") or "USD").strip(),
                price=None,
                sector=None,
                industry=None,
            )
            for item in matches
            if item.get("1. symbol") and (item.get("2. name") or item.get("1. symbol"))
        ][:8]
