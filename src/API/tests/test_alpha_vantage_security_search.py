import pytest
import requests

from app.infrastructure.alpha_vantage_security_search import (
    AlphaVantageSecuritySearchProvider,
    SecuritySearchUnavailableError,
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


def test_alpha_vantage_search_maps_best_matches(monkeypatch):
    def fake_get(url, params, timeout, headers):
        assert url == "https://www.alphavantage.co/query"
        assert params == {
            "function": "SYMBOL_SEARCH",
            "keywords": "vti",
            "apikey": "test-key",
        }
        assert timeout == 10.0
        assert headers["User-Agent"] == "FinanceCompanion/1.0"
        return FakeResponse(
            {
                "bestMatches": [
                    {
                        "1. symbol": "VTI",
                        "2. name": "Vanguard Total Stock Market ETF",
                        "3. type": "ETF",
                        "4. region": "United States",
                        "8. currency": "USD",
                    }
                ]
            }
        )

    monkeypatch.setattr(requests, "get", fake_get)

    results = AlphaVantageSecuritySearchProvider("test-key").search("vti")

    assert len(results) == 1
    assert results[0].symbol == "VTI"
    assert results[0].name == "Vanguard Total Stock Market ETF"
    assert results[0].exchange == "United States"
    assert results[0].asset_type == "ETF"
    assert results[0].currency == "USD"
    assert results[0].price is None


def test_alpha_vantage_search_requires_api_key():
    with pytest.raises(SecuritySearchUnavailableError):
        AlphaVantageSecuritySearchProvider(None).search("vti")


def test_alpha_vantage_search_reports_provider_failure(monkeypatch):
    def fake_get(*args, **kwargs):
        return FakeResponse({}, requests.RequestException("failed"))

    monkeypatch.setattr(requests, "get", fake_get)

    with pytest.raises(SecuritySearchUnavailableError):
        AlphaVantageSecuritySearchProvider("test-key").search("vti")


def test_alpha_vantage_search_reports_rate_limit_or_provider_information(monkeypatch):
    monkeypatch.setattr(
        requests,
        "get",
        lambda *args, **kwargs: FakeResponse({"Information": "rate limit"}),
    )

    with pytest.raises(SecuritySearchUnavailableError):
        AlphaVantageSecuritySearchProvider("test-key").search("vti")
