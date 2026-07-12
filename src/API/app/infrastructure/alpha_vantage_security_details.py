from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime

import requests

from app.domain.exceptions import DomainError
from app.domain.models import SecurityMetadata, SecurityPayoutDetails


class SecurityDetailsUnavailableError(DomainError):
    """Raised when security details cannot be refreshed."""


def _to_float(value) -> float | None:
    if value in (None, "", "None", "N/A", "-"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_optional_text(value) -> str | None:
    if value in (None, "", "None", "N/A", "-"):
        return None
    return str(value)


def _latest_sma(payload: dict) -> float | None:
    closes = _daily_closes(payload)
    if len(closes) < 20:
        return None
    return sum(closes[:20]) / 20


def _daily_closes(payload: dict) -> list[float]:
    values = payload.get("Time Series (Daily)")
    if not isinstance(values, dict) or not values:
        return []

    closes: list[float] = []
    for trade_date in sorted(values.keys(), reverse=True):
        item = values.get(trade_date, {})
        close = _to_float(item.get("5. adjusted close")) or _to_float(item.get("4. close"))
        if close is not None:
            closes.append(close)
    return closes


def _latest_close(payload: dict) -> float | None:
    values = payload.get("Time Series (Daily)")
    if not isinstance(values, dict) or not values:
        return None

    latest_date = sorted(values.keys(), reverse=True)[0]
    latest = values.get(latest_date, {})
    return _to_float(latest.get("5. adjusted close")) or _to_float(latest.get("4. close"))


def _payout_details_from_dividends(items: list[dict]) -> list[SecurityPayoutDetails]:
    payouts: list[SecurityPayoutDetails] = []
    for item in items:
        ex_date = item.get("ex_dividend_date")
        amount = _to_float(item.get("amount"))
        if not ex_date or amount is None or amount <= 0:
            continue
        payouts.append(
            SecurityPayoutDetails(
                ex_dividend_date=ex_date,
                amount=amount,
                declaration_date=_to_optional_text(item.get("declaration_date")),
                record_date=_to_optional_text(item.get("record_date")),
                payment_date=_to_optional_text(item.get("payment_date")),
                source="dividends",
            )
        )
    return sorted(payouts, key=lambda payout: payout.ex_dividend_date, reverse=True)


def _payout_details_from_daily_adjusted(payload: dict) -> list[SecurityPayoutDetails]:
    values = payload.get("Time Series (Daily)")
    if not isinstance(values, dict):
        return []

    payouts: list[SecurityPayoutDetails] = []
    for trade_date, item in values.items():
        dividend = _to_float(item.get("7. dividend amount"))
        if dividend is None or dividend <= 0:
            continue
        payouts.append(
            SecurityPayoutDetails(
                ex_dividend_date=trade_date,
                amount=dividend,
                source="daily_adjusted",
            )
        )
    return sorted(payouts, key=lambda payout: payout.ex_dividend_date, reverse=True)


def _annual_payout_totals(payouts: list[SecurityPayoutDetails]) -> dict[int, float]:
    totals: dict[int, float] = defaultdict(float)
    for payout in payouts:
        try:
            totals[int(payout.ex_dividend_date[:4])] += payout.amount
        except ValueError:
            continue
    return dict(totals)


def _payouts_since_year(
    payouts: list[SecurityPayoutDetails],
    earliest_year: int,
) -> list[SecurityPayoutDetails]:
    recent: list[SecurityPayoutDetails] = []
    for payout in payouts:
        try:
            payout_year = int(payout.ex_dividend_date[:4])
        except ValueError:
            continue
        if payout_year >= earliest_year:
            recent.append(payout)
    return recent


def _average_annual_growth_rate(
    annual_totals: dict[int, float],
    current_year: int,
    projected_current_year_dividend: float | None,
    *,
    transitions: int = 5,
) -> float | None:
    totals = dict(annual_totals)
    if projected_current_year_dividend is not None:
        totals[current_year] = projected_current_year_dividend

    growth_rates: list[float] = []
    for year in range(current_year - transitions + 1, current_year + 1):
        previous_total = totals.get(year - 1)
        current_total = totals.get(year)
        if not previous_total or current_total is None:
            continue
        growth_rates.append((current_total - previous_total) / previous_total)

    if not growth_rates:
        return None
    return sum(growth_rates) / len(growth_rates)


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
        dividends, dividends_failed = self._try_get({"function": "DIVIDENDS", "symbol": symbol})
        overview, overview_failed = self._try_get({"function": "OVERVIEW", "symbol": symbol})
        daily, daily_failed = self._try_get(
            {
                "function": "TIME_SERIES_DAILY",
                "symbol": symbol,
                "outputsize": "compact",
            }
        )

        current_year = datetime.now(tz=UTC).year
        all_payout_details = _payout_details_from_dividends(dividends.get("data", []))
        daily_adjusted: dict = {}
        daily_adjusted_failed = False
        if not all_payout_details:
            daily_adjusted, daily_adjusted_failed = self._try_get(
                {
                    "function": "TIME_SERIES_DAILY_ADJUSTED",
                    "symbol": symbol,
                    "outputsize": "compact",
                }
            )
            all_payout_details = _payout_details_from_daily_adjusted(daily_adjusted)
        recent_payout_details = _payouts_since_year(all_payout_details, current_year - 1)
        dividend_status = (
            "recent"
            if recent_payout_details
            else "none_recent"
            if all_payout_details
            else "unavailable"
            if dividends_failed and daily_adjusted_failed
            else "none"
        )
        all_dividend_totals = _annual_payout_totals(all_payout_details)
        previous_dividend = all_dividend_totals.get(current_year - 1)
        current_dividend = all_dividend_totals.get(current_year)
        estimated_future_payout = current_dividend if current_dividend is not None else None
        projected_current_year_dividend = (
            current_dividend + estimated_future_payout
            if current_dividend is not None and estimated_future_payout is not None
            else None
        )
        dividend_growth_rate = _average_annual_growth_rate(
            all_dividend_totals,
            current_year,
            projected_current_year_dividend,
        )

        quote_data = quote.get("Global Quote", {})
        price = (
            _to_float(quote_data.get("05. price"))
            or _latest_close(daily)
            or _latest_close(daily_adjusted)
            or security.price
        )
        sma20 = _latest_sma(daily) or _latest_sma(daily_adjusted)
        has_any_payload = any([overview, quote, daily_adjusted, daily, dividends])
        had_partial_failure = any([
            overview_failed,
            quote_failed,
            daily_adjusted_failed,
            daily_failed,
            dividends_failed,
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
            estimated_future_payout=estimated_future_payout,
            dividend_status=dividend_status,
            sma20=sma20,
            sma50=_to_float(overview.get("50DayMovingAverage")),
            sma200=_to_float(overview.get("200DayMovingAverage")),
            details_status=details_status,
            payout_details=all_payout_details,
            source_payout_details=all_payout_details,
        )
