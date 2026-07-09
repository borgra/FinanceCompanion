import pytest
import requests

from app.infrastructure.yahoo_finance_security_search import (
    SecuritySearchUnavailableError,
    YahooFinanceSecuritySearchProvider,
)


class FakeResponse:
    def __init__(self, payload, status_error=None):
        self._payload = payload
        self._status_error = status_error

    def raise_for_status(self):
        if self._status_error:
            raise self._status_error

    def json(self):
        return self._payload


def test_yahoo_finance_search_maps_quote_results(monkeypatch):
    def fake_get(url, params, timeout, headers):
        assert url == "https://query1.finance.yahoo.com/v1/finance/search"
        assert params == {"q": "vti", "quotesCount": 8, "newsCount": 0}
        assert timeout == 8.0
        assert headers["User-Agent"] == "FinanceCompanion/1.0"
        return FakeResponse(
            {
                "quotes": [
                    {
                        "symbol": "VTI",
                        "shortname": "Vanguard Total Stock Market ETF",
                        "quoteType": "ETF",
                        "exchDisp": "NYSEArca",
                        "currency": "USD",
                        "regularMarketPrice": 315.12,
                    }
                ]
            }
        )

    monkeypatch.setattr(requests, "get", fake_get)

    results = YahooFinanceSecuritySearchProvider().search("vti")

    assert len(results) == 1
    assert results[0].symbol == "VTI"
    assert results[0].name == "Vanguard Total Stock Market ETF"
    assert results[0].exchange == "NYSEArca"
    assert results[0].asset_type == "ETF"
    assert results[0].currency == "USD"
    assert results[0].price == 315.12


def test_yahoo_finance_search_uses_symbol_name_fallback(monkeypatch):
    monkeypatch.setattr(
        requests,
        "get",
        lambda *args, **kwargs: FakeResponse(
            {"quotes": [{"symbol": "MSFT", "quoteType": "EQUITY", "exchange": "NMS"}]}
        ),
    )

    assert YahooFinanceSecuritySearchProvider().search("msft") == []


def test_yahoo_finance_search_reports_provider_failure(monkeypatch):
    def fake_get(*args, **kwargs):
        return FakeResponse({}, requests.RequestException("failed"))

    monkeypatch.setattr(requests, "get", fake_get)

    with pytest.raises(SecuritySearchUnavailableError):
        YahooFinanceSecuritySearchProvider().search("vti")
