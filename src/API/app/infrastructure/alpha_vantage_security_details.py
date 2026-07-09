from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime

import requests

from app.domain.exceptions import DomainError
from app.domain.models import SecurityMetadata


class SecurityDetailsUnavailableError(DomainError):
    """Raised when security details cannot be refreshed."""


def _to_float(value) -> float | None:
    if value in (None, "", "None", "N/A", "-"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _latest_sma(payload: dict) -> float | None:
    closes = _adjusted_closes(payload)
    if len(closes) < 20:
        return None
    return sum(closes[:20]) / 20


def _adjusted_closes(payload: dict) -> list[float]:
    values = payload.get("Time Series (Daily)")
    if not isinstance(values, dict) or not values:
        return []

    closes: list[float] = []
    for trade_date in sorted(values.keys(), reverse=True):
        close = _to_float(values.get(trade_date, {}).get("5. adjusted close"))
        if close is not None:
            closes.append(close)
    return closes


def _latest_adjusted_close(payload: dict) -> float | None:
    values = payload.get("Time Series (Daily)")
    if not isinstance(values, dict) or not values:
        return None

    latest_date = sorted(values.keys(), reverse=True)[0]
    return _to_float(values.get(latest_date, {}).get("5. adjusted close"))


def _annual_adjusted_dividend_totals(payload: dict) -> dict[int, float]:
    values = payload.get("Time Series (Daily)")
    if not isinstance(values, dict):
        return {}

    totals: dict[int, float] = defaultdict(float)
    for trade_date, item in values.items():
        dividend = _to_float(item.get("7. dividend amount"))
        if dividend is None or dividend <= 0:
            continue
        try:
            totals[int(trade_date[:4])] += dividend
        except ValueError:
            continue
    return dict(totals)


class AlphaVantageSecurityDetailsProvider:
    def __init__(self, api_key: str | None, timeout_seconds: float = 10.0) -> None:
        self._api_key = api_key
        self._timeout_seconds = timeout_seconds

    def _get(self, params: dict[str, str]) -> dict:
        if not self._api_key or self._api_key == "not-configured":
            raise SecurityDetailsUnavailableError("Security details are not configured.")

        try:
            response = requests.get(
                "https://www.alphavantage.co/query",
                params={**params, "apikey": self._api_key},
                timeout=self._timeout_seconds,
                headers={"User-Agent": "FinanceCompanion/1.0"},
            )
            response.raise_for_status()
            payload = response.json()
        except (requests.RequestException, ValueError) as exc:
            raise SecurityDetailsUnavailableError("Security details are unavailable.") from exc

        if "Error Message" in payload or "Information" in payload or "Note" in payload:
            raise SecurityDetailsUnavailableError("Security details are unavailable.")

        return payload

    def _try_get(self, params: dict[str, str]) -> tuple[dict, bool]:
        try:
            return self._get(params), False
        except SecurityDetailsUnavailableError:
            return {}, True

    def get_details(self, security: SecurityMetadata) -> SecurityMetadata:
        symbol = security.symbol.strip().upper()
        if not symbol:
            raise SecurityDetailsUnavailableError("Security symbol is required.")
        if not self._api_key or self._api_key == "not-configured":
            raise SecurityDetailsUnavailableError("Security details are not configured.")

        quote, quote_failed = self._try_get({"function": "GLOBAL_QUOTE", "symbol": symbol})
        overview, overview_failed = self._try_get({"function": "OVERVIEW", "symbol": symbol})
        daily_adjusted, daily_adjusted_failed = self._try_get(
            {
                "function": "TIME_SERIES_DAILY_ADJUSTED",
                "symbol": symbol,
                "outputsize": "full",
            }
        )

        current_year = datetime.now(tz=UTC).year
        dividend_totals = _annual_adjusted_dividend_totals(daily_adjusted)
        previous_dividend = dividend_totals.get(current_year - 1)
        current_dividend = dividend_totals.get(current_year)
        dividend_growth_rate = None
        if previous_dividend and current_dividend is not None:
            dividend_growth_rate = (current_dividend - previous_dividend) / previous_dividend

        quote_data = quote.get("Global Quote", {})
        price = (
            _to_float(quote_data.get("05. price"))
            or _latest_adjusted_close(daily_adjusted)
            or security.price
        )
        has_any_payload = any([overview, quote, daily_adjusted])
        had_partial_failure = any([
            overview_failed,
            quote_failed,
            daily_adjusted_failed,
        ])
        details_status = (
            "unavailable"
            if not has_any_payload
            else "partial"
            if had_partial_failure
            else "fresh"
        )

        return SecurityMetadata(
            symbol=symbol,
            name=(overview.get("Name") or security.name).strip(),
            exchange=(overview.get("Exchange") or security.exchange).strip(),
            asset_type=(overview.get("AssetType") or security.asset_type).strip(),
            currency=security.currency,
            price=price,
            sector=overview.get("Sector") or security.sector,
            industry=overview.get("Industry") or security.industry,
            pe_ratio=_to_float(overview.get("PERatio")),
            thirty_day_yield=(
                _to_float(overview.get("30DayYield"))
                or _to_float(overview.get("DividendYield"))
            ),
            fifty_two_week_low=_to_float(overview.get("52WeekLow")),
            fifty_two_week_high=_to_float(overview.get("52WeekHigh")),
            dividend_previous_year=previous_dividend,
            dividend_current_year=current_dividend,
            dividend_growth_rate=dividend_growth_rate,
            estimated_future_payout=current_dividend or previous_dividend,
            sma20=_latest_sma(daily_adjusted),
            sma50=_to_float(overview.get("50DayMovingAverage")),
            sma200=_to_float(overview.get("200DayMovingAverage")),
            details_status=details_status,
        )
