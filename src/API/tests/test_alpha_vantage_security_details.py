import requests

from app.domain.models import SecurityMetadata
from app.infrastructure.alpha_vantage_security_details import AlphaVantageSecurityDetailsProvider


class FakeResponse:
    def __init__(self, payload, status_error=None):
        self._payload = payload
        self._status_error = status_error

    def raise_for_status(self):
        if self._status_error:
            raise self._status_error

    def json(self):
        return self._payload


def security(symbol: str = "VTI") -> SecurityMetadata:
    return SecurityMetadata(
        symbol=symbol,
        name="Vanguard Total Stock Market ETF",
        exchange="NYSE Arca",
        asset_type="ETF",
        currency="USD",
        price=None,
    )


def test_details_provider_keeps_quote_when_optional_endpoints_fail(monkeypatch):
    def fake_get(url, params, timeout, headers):
        function = params["function"]
        if function == "GLOBAL_QUOTE":
            return FakeResponse({"Global Quote": {"05. price": "321.45"}})
        return FakeResponse({"Information": "endpoint unavailable"})

    monkeypatch.setattr(requests, "get", fake_get)

    details = AlphaVantageSecurityDetailsProvider("test-key").get_details(security())

    assert details.price == 321.45
    assert details.details_status == "partial"


def test_details_provider_prioritizes_quote_price_before_later_partial_failures(monkeypatch):
    requested_functions = []

    def fake_get(url, params, timeout, headers):
        function = params["function"]
        requested_functions.append(function)
        if function == "GLOBAL_QUOTE":
            return FakeResponse({"Global Quote": {"05. price": "512.88"}})
        if function == "OVERVIEW":
            return FakeResponse(
                {
                    "Name": "Microsoft Corporation",
                    "AssetType": "Common Stock",
                    "Exchange": "NASDAQ",
                    "PERatio": "23.04",
                    "52WeekLow": "349.20",
                    "52WeekHigh": "551.05",
                }
            )
        return FakeResponse({"Information": "rate limit"})

    monkeypatch.setattr(requests, "get", fake_get)

    details = AlphaVantageSecurityDetailsProvider("test-key").get_details(security("MSFT"))

    assert requested_functions[:2] == ["GLOBAL_QUOTE", "OVERVIEW"]
    assert details.price == 512.88
    assert details.pe_ratio == 23.04
    assert details.fifty_two_week_low == 349.2
    assert details.fifty_two_week_high == 551.05
    assert details.details_status == "partial"


def test_details_provider_marks_unavailable_when_all_optional_endpoints_fail(monkeypatch):
    monkeypatch.setattr(
        requests,
        "get",
        lambda *args, **kwargs: FakeResponse({"Information": "rate limit"}),
    )

    details = AlphaVantageSecurityDetailsProvider("test-key").get_details(security("FXAIX"))

    assert details.symbol == "FXAIX"
    assert details.price is None
    assert details.details_status == "unavailable"


def test_details_provider_uses_daily_adjusted_for_price_and_dividends(monkeypatch):
    def fake_get(url, params, timeout, headers):
        function = params["function"]
        if function == "OVERVIEW":
            return FakeResponse(
                {
                    "Name": "Fidelity 500 Index Fund",
                    "AssetType": "Mutual Fund",
                    "Exchange": "NASDAQ",
                    "DividendYield": "0.0123",
                    "PERatio": "25.5",
                    "52WeekLow": "180.00",
                    "52WeekHigh": "210.00",
                }
            )
        if function == "TIME_SERIES_DAILY_ADJUSTED":
            return FakeResponse(
                {
                    "Time Series (Daily)": {
                        "2026-07-08": {
                            "5. adjusted close": "201.25",
                            "7. dividend amount": "0.0000",
                        },
                        "2026-06-28": {
                            "5. adjusted close": "199.75",
                            "7. dividend amount": "0.4500",
                        },
                        "2025-12-20": {
                            "5. adjusted close": "190.00",
                            "7. dividend amount": "0.4000",
                        },
                    }
                }
            )
        return FakeResponse({"Information": "endpoint unavailable"})

    monkeypatch.setattr(requests, "get", fake_get)

    details = AlphaVantageSecurityDetailsProvider("test-key").get_details(security("FXAIX"))

    assert details.price == 201.25
    assert details.thirty_day_yield == 0.0123
    assert details.dividend_current_year == 0.45
    assert details.dividend_previous_year == 0.4
    assert details.dividend_growth_rate == 0.12499999999999997
    assert details.details_status == "partial"


def test_details_provider_populates_voo_with_three_alpha_vantage_calls(monkeypatch):
    requested_functions = []

    def fake_get(url, params, timeout, headers):
        function = params["function"]
        requested_functions.append(function)
        if function == "OVERVIEW":
            return FakeResponse(
                {
                    "Name": "Vanguard S&P 500 ETF",
                    "AssetType": "ETF",
                    "Exchange": "NYSEARCA",
                    "DividendYield": "0.0128",
                    "PERatio": "24.7",
                    "52WeekLow": "420.00",
                    "52WeekHigh": "560.00",
                    "50DayMovingAverage": "535.10",
                    "200DayMovingAverage": "508.40",
                }
            )
        if function == "GLOBAL_QUOTE":
            return FakeResponse({"Global Quote": {"05. price": "551.23"}})
        if function == "TIME_SERIES_DAILY_ADJUSTED":
            return FakeResponse(
                {
                    "Time Series (Daily)": {
                        f"2026-07-{day:02d}": {
                            "5. adjusted close": str(530 + day),
                            "7. dividend amount": "0.0000",
                        }
                        for day in range(1, 22)
                    }
                }
            )
        return FakeResponse({"Information": "unexpected endpoint"})

    monkeypatch.setattr(requests, "get", fake_get)

    details = AlphaVantageSecurityDetailsProvider("test-key").get_details(security("VOO"))

    assert requested_functions == [
        "GLOBAL_QUOTE",
        "OVERVIEW",
        "TIME_SERIES_DAILY_ADJUSTED",
    ]
    assert details.name == "Vanguard S&P 500 ETF"
    assert details.price == 551.23
    assert details.pe_ratio == 24.7
    assert details.thirty_day_yield == 0.0128
    assert details.fifty_two_week_low == 420
    assert details.fifty_two_week_high == 560
    assert details.sma20 is not None
    assert details.sma50 == 535.1
    assert details.sma200 == 508.4
    assert details.details_status == "fresh"
