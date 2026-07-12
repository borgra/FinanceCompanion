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
    assert details.dividend_status == "unavailable"
    assert details.details_status == "partial"


def test_details_provider_prioritizes_dividends_before_later_partial_failures(monkeypatch):
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

    assert requested_functions[:3] == ["DIVIDENDS", "GLOBAL_QUOTE", "OVERVIEW"]
    assert details.price == 512.88
    assert details.dividend_status == "unavailable"
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
    assert details.dividend_status == "unavailable"
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
    assert details.estimated_future_payout == 0.45
    assert details.dividend_growth_rate == 1.25
    assert details.dividend_status == "recent"
    assert details.payout_details[0].ex_dividend_date == "2026-06-28"
    assert details.payout_details[0].amount == 0.45
    assert details.payout_details[0].source == "daily_adjusted"
    assert details.details_status == "partial"


def test_details_provider_uses_daily_prices_when_quote_and_adjusted_are_unavailable(monkeypatch):
    def fake_get(url, params, timeout, headers):
        function = params["function"]
        if function == "OVERVIEW":
            return FakeResponse(
                {
                    "Name": "Microsoft Corporation",
                    "AssetType": "Common Stock",
                    "Exchange": "NASDAQ",
                    "PERatio": "23.04",
                    "DividendYield": "0.0092",
                    "52WeekLow": "349.20",
                    "52WeekHigh": "551.05",
                    "50DayMovingAverage": "406.13",
                    "200DayMovingAverage": "444.22",
                }
            )
        if function == "TIME_SERIES_DAILY":
            return FakeResponse(
                {
                    "Time Series (Daily)": {
                        f"2026-07-{day:02d}": {
                            "4. close": str(450 + day),
                        }
                        for day in range(1, 22)
                    }
                }
            )
        return FakeResponse({"Information": "endpoint unavailable"})

    monkeypatch.setattr(requests, "get", fake_get)

    details = AlphaVantageSecurityDetailsProvider("test-key").get_details(security("MSFT"))

    assert details.price == 471
    assert details.sma20 is not None
    assert details.pe_ratio == 23.04
    assert details.thirty_day_yield == 0.0092
    assert details.details_status == "partial"


def test_details_provider_populates_voo_without_premium_adjusted_daily_call(monkeypatch):
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
        if function == "TIME_SERIES_DAILY":
            return FakeResponse(
                {
                    "Time Series (Daily)": {
                        f"2026-07-{day:02d}": {
                            "4. close": str(530 + day),
                        }
                        for day in range(1, 22)
                    }
                }
            )
        if function == "DIVIDENDS":
            return FakeResponse(
                {
                    "data": [
                        {
                            "ex_dividend_date": "2026-06-28",
                            "declaration_date": "2026-06-10",
                            "record_date": "2026-06-29",
                            "payment_date": "2026-07-02",
                            "amount": "1.25",
                        },
                        {
                            "ex_dividend_date": "2024-12-20",
                            "declaration_date": "2024-12-01",
                            "record_date": "2024-12-21",
                            "payment_date": "2025-01-02",
                            "amount": "1.05",
                        }
                    ]
                }
            )
        return FakeResponse({"Information": "unexpected endpoint"})

    monkeypatch.setattr(requests, "get", fake_get)

    details = AlphaVantageSecurityDetailsProvider("test-key").get_details(security("VOO"))

    assert requested_functions == [
        "DIVIDENDS",
        "GLOBAL_QUOTE",
        "OVERVIEW",
        "TIME_SERIES_DAILY",
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
    assert details.dividend_current_year == 1.25
    assert details.estimated_future_payout == 1.25
    assert details.dividend_growth_rate is None
    assert details.dividend_status == "recent"
    assert [payout.ex_dividend_date for payout in details.payout_details] == ["2026-06-28"]
    assert details.payout_details[0].payment_date == "2026-07-02"
    assert details.payout_details[0].source == "dividends"
    assert details.details_status == "fresh"


def test_details_provider_marks_symbols_with_only_old_dividends_as_none_recent(monkeypatch):
    def fake_get(url, params, timeout, headers):
        function = params["function"]
        if function == "DIVIDENDS":
            return FakeResponse(
                {
                    "data": [
                        {
                            "ex_dividend_date": "2020-02-13",
                            "declaration_date": "2019-12-16",
                            "record_date": "2020-02-14",
                            "payment_date": "2020-03-06",
                            "amount": "2.055",
                        }
                    ]
                }
            )
        if function == "GLOBAL_QUOTE":
            return FakeResponse({"Global Quote": {"05. price": "229.66"}})
        return FakeResponse({})

    monkeypatch.setattr(requests, "get", fake_get)

    details = AlphaVantageSecurityDetailsProvider("test-key").get_details(security("BA"))

    assert details.price == 229.66
    assert details.dividend_status == "none_recent"
    assert details.dividend_previous_year is None
    assert details.dividend_current_year is None
    assert details.estimated_future_payout is None
    assert details.payout_details == []


def test_details_provider_calculates_growth_from_trailing_average(monkeypatch):
    def fake_get(url, params, timeout, headers):
        function = params["function"]
        if function == "DIVIDENDS":
            return FakeResponse(
                {
                    "data": [
                        {
                            "ex_dividend_date": "2026-07-31",
                            "declaration_date": "2026-07-07",
                            "record_date": "2026-07-31",
                            "payment_date": "2026-08-14",
                            "amount": "0.271",
                        },
                        {
                            "ex_dividend_date": "2026-06-30",
                            "declaration_date": "2026-06-09",
                            "record_date": "2026-06-30",
                            "payment_date": "2026-07-15",
                            "amount": "1.6225",
                        },
                        {
                            "ex_dividend_date": "2025-12-31",
                            "declaration_date": "2025-12-09",
                            "record_date": "2025-12-31",
                            "payment_date": "2026-01-15",
                            "amount": "3.21",
                        },
                        {
                            "ex_dividend_date": "2024-12-31",
                            "declaration_date": "2024-12-09",
                            "record_date": "2024-12-31",
                            "payment_date": "2025-01-15",
                            "amount": "3.00",
                        },
                        {
                            "ex_dividend_date": "2023-12-31",
                            "declaration_date": "2023-12-09",
                            "record_date": "2023-12-31",
                            "payment_date": "2024-01-15",
                            "amount": "2.80",
                        },
                        {
                            "ex_dividend_date": "2022-12-31",
                            "declaration_date": "2022-12-09",
                            "record_date": "2022-12-31",
                            "payment_date": "2023-01-15",
                            "amount": "2.65",
                        },
                        {
                            "ex_dividend_date": "2021-12-31",
                            "declaration_date": "2021-12-09",
                            "record_date": "2021-12-31",
                            "payment_date": "2022-01-15",
                            "amount": "2.55",
                        },
                        {
                            "ex_dividend_date": "2020-12-31",
                            "declaration_date": "2020-12-09",
                            "record_date": "2020-12-31",
                            "payment_date": "2021-01-15",
                            "amount": "2.20",
                        },
                        {
                            "ex_dividend_date": "2019-12-31",
                            "declaration_date": "2019-12-09",
                            "record_date": "2019-12-31",
                            "payment_date": "2020-01-15",
                            "amount": "2.00",
                        },
                    ]
                }
            )
        if function == "GLOBAL_QUOTE":
            return FakeResponse({"Global Quote": {"05. price": "63.31"}})
        return FakeResponse({})

    monkeypatch.setattr(requests, "get", fake_get)

    details = AlphaVantageSecurityDetailsProvider("test-key").get_details(security("O"))

    assert round(details.dividend_current_year or 0, 4) == 1.8935
    assert round(details.estimated_future_payout or 0, 4) == 1.8935
    expected_growth_rates = [
        (2.65 - 2.55) / 2.55,
        (2.80 - 2.65) / 2.65,
        (3.00 - 2.80) / 2.80,
        (3.21 - 3.00) / 3.00,
        ((1.8935 + 1.8935) - 3.21) / 3.21,
    ]
    expected_average_growth = sum(expected_growth_rates) / len(expected_growth_rates)
    assert round(details.dividend_growth_rate or 0, 4) == round(expected_average_growth, 4)
