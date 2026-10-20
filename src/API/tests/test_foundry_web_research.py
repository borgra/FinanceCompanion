"""Foundry-only discovery/import contracts; HTTP and Entra token boundary mocked."""
from copy import deepcopy
from datetime import date
import json

from fastapi.testclient import TestClient
import httpx
import pytest

from app.domain.dividend_research import DividendResearchProviderError, DividendResearchRequest, DividendResearchValidationError
from app.domain.distribution_forecasting import forecast_distributions, normalize_research
from app.infrastructure.foundry_web_research import FoundryWebDividendResearchProvider
from app.infrastructure.settings import Settings
from app.main import create_app

SOURCE = "https://issuer.example/distributions"
PROJECT = "https://demo.services.ai.azure.com/api/projects/income"
TOKEN = "private-test-entra-token"
IDENTITY_TEXT = "Ticker: JEPQ; Exchange: NASDAQ; Name: JPMorgan Nasdaq Equity Premium Income ETF; Asset type: ETF; Currency: USD."
IDENTITY = dict(symbol="JEPQ", exchange="NASDAQ", name="JPMorgan Nasdaq Equity Premium Income ETF", asset_type="ETF", currency="USD", source_url=SOURCE, evidence_excerpt=IDENTITY_TEXT)


def request(exchange="NASDAQ"):
    return DividendResearchRequest("JEPQ", exchange, "USD", date(2021, 9, 4), date(2026, 9, 4), schema_version=2)


def payment(month, amount="0.451", year=2026):
    day = f"{year}-{month:02d}-01"
    pay = f"{year}-{month:02d}-03"
    excerpt = f"Ticker: JEPQ; Exchange: NASDAQ; distribution paid; Ex-date: {day}; Payment date: {pay}; Amount: USD {amount}."
    return dict(ex_dividend_date=day, amount_per_share=amount, currency="USD", status="completed", distribution_type="other", is_regular=None,
        share_basis="unverified", payment_date=pay, declaration_date=None, record_date=None, source_url=SOURCE, evidence_excerpt=excerpt)


def research(payments=None, actions=None):
    return {"identity": deepcopy(IDENTITY), "payments": payments if payments is not None else [payment(month) for month in range(1, 10)], "corporate_actions": actions or [], "warnings": []}


def grounded(data):
    lines = [data["identity"]["evidence_excerpt"], *[fact["evidence_excerpt"] for fact in data["corporate_actions"] + data["payments"]]]
    answer = "\n".join(lines)
    annotations, start = [], 0
    for line in lines:
        annotations.append({"type": "url_citation", "url": SOURCE, "title": "Issuer distribution history", "start_index": start, "end_index": start + len(line)})
        start += len(line) + 1
    return {"id": "research-response", "status": "completed", "output": [
        {"type": "web_search_call", "id": "search-1", "status": "completed", "action": {"type": "search", "query": "JEPQ NASDAQ distributions", "sources": [{"type": "url", "url": SOURCE}]}},
        {"type": "message", "content": [{"type": "output_text", "text": answer, "annotations": annotations}]},
    ]}


def provider(data=None, *, endpoint=PROJECT, change_grounded=None, change_extracted=None, calls=None):
    data = data or research()
    calls = calls if calls is not None else []
    def handle(req):
        assert str(req.url) == endpoint + "/openai/v1/responses"
        assert req.headers["Authorization"] == "Bearer " + TOKEN
        body = json.loads(req.content)
        calls.append(body)
        assert body["store"] is False
        assert all(item["type"] == "message" and item["content"][0]["type"] == "input_text" for item in body["input"])
        if "tools" in body:
            assert body["tools"] == [{"type": "web_search"}]
            assert body["tool_choice"] == "required"
            assert body["include"] == ["web_search_call.action.sources"]
            result = grounded(data)
            if change_grounded:
                change_grounded(result)
            return httpx.Response(200, json=result)
        assert body["text"]["format"]["strict"] is True
        assert "tools" not in body
        result = deepcopy(data)
        if "securities" in body["text"]["format"]["schema"]["properties"]:
            result = {"securities": [deepcopy(data["identity"])]}
        if change_extracted:
            change_extracted(result)
        return httpx.Response(200, json={"status": "completed", "output": [{"type": "message", "content": [{"type": "output_text", "text": json.dumps(result)}]}]})
    return FoundryWebDividendResearchProvider(endpoint=endpoint, deployment="web-model", token_provider=lambda: TOKEN, client=httpx.Client(transport=httpx.MockTransport(handle)))


@pytest.mark.parametrize("endpoint", [PROJECT, "https://demo.openai.azure.com"])
def test_searches_then_imports_cited_facts_without_vendor_credentials(endpoint):
    calls = []
    result = provider(endpoint=endpoint, calls=calls).research(request())
    assert len(calls) == 2 and len(result.payments) == 9
    assert all(item.regularity_basis == "inferred_cadence_v1" for item in result.payments)
    assert result.provenance.provider == "azure_foundry" and not result.provenance.authoritative
    assert result.status == "partial" and any("not independently verified" in warning for warning in result.warnings)
    assert result.evidence_snapshot["kind"] == "foundry_web_search"
    assert result.evidence_snapshot["answer"].startswith(IDENTITY_TEXT)
    assert len(result.evidence_snapshot["facts"]) == 9
    assert TOKEN not in json.dumps(result.evidence_snapshot)
    events, _ = normalize_research(result, request())
    forecasts, _ = forecast_distributions(events, request())
    assert len([item for item in forecasts if item.ex_dividend_date.startswith("2027")]) == 12
    assert all(item.amount_per_share == "0.451" for item in forecasts)


def test_compressed_azure_responses_are_not_decompressed_twice():
    import gzip
    data = research()
    def handle(req):
        body = json.loads(req.content)
        answer = grounded(data) if "tools" in body else {"status": "completed", "output": [{"type": "message", "content": [{"type": "output_text", "text": json.dumps(data)}]}]}
        return httpx.Response(200, headers={"content-encoding": "gzip", "content-type": "application/json"}, content=gzip.compress(json.dumps(answer).encode()))
    instance = provider()
    instance._client = httpx.Client(transport=httpx.MockTransport(handle))
    assert len(instance.research(request()).payments) == 9


def voo_research():
    """Quarterly rows from the 2026-10-20 live VOO research reproduction."""
    identity = dict(symbol="VOO", exchange="NYSE Arca", name="Vanguard S&P 500 ETF",
        asset_type="ETF", currency="USD", source_url=SOURCE,
        evidence_excerpt="Ticker: VOO; Exchange: NYSE Arca; Name: Vanguard S&P 500 ETF; Asset type: ETF; Currency: USD.")
    rows = [
        ("2024-12-23", "2024-12-26", "1.7385"),
        ("2025-03-27", "2025-03-31", "1.8121"),
        ("2025-06-30", "2025-07-02", "1.7447"),
        ("2025-09-29", "2025-10-01", "1.740"),
        ("2025-12-22", "2025-12-24", "1.771"),
        ("2026-03-27", "2026-03-31", "1.8724"),
        ("2026-06-26", "2026-06-30", "1.9622"),
        ("2026-09-28", "2026-09-30", "1.8226"),
    ]
    payments = [dict(ex_dividend_date=ex_date, amount_per_share=amount, currency="USD",
        status="completed", distribution_type="other", is_regular=None, share_basis="unverified",
        payment_date=pay_date, declaration_date=None, record_date=ex_date, source_url=SOURCE,
        evidence_excerpt=f"Ticker: VOO; Exchange: NYSE Arca; Ex-date: {ex_date}; Amount: USD {amount} per share; Record date: {ex_date}; Payment date: {pay_date}; Status: paid/completed; Classification/type: not specified in the cited history; Share basis: not specified.")
        for ex_date, pay_date, amount in rows]
    return dict(identity=identity, payments=payments, corporate_actions=[], warnings=[])


@pytest.mark.parametrize("exchange", ["NYSE ARCA", "NYSE Arca", "ARCX", "United States"])
def test_voo_quarterly_history_imports_with_exact_amounts_and_forecasts(exchange):
    req = DividendResearchRequest("VOO", exchange, "USD", date(2021, 10, 20), date(2026, 10, 20), schema_version=2)
    result = provider(voo_research()).research(req)
    assert result.resolved_exchange == "NYSE ARCA"
    assert len(result.payments) == 8
    assert result.payments[-1].amount_per_share == "1.8226"
    assert all(item.regularity_basis == "inferred_cadence_v1" for item in result.payments)
    assert all(item.distribution_type == "other" for item in result.payments)
    events, _ = normalize_research(result, req)
    forecasts, _ = forecast_distributions(events, req)
    assert all(not item.excluded_from_totals for item in events)
    assert len(forecasts) == 5
    assert len([item for item in forecasts if item.ex_dividend_date.startswith("2027")]) == 4


def test_voo_cannot_import_a_different_listing_or_similarly_named_fund():
    for symbol, exchange in [("VOO", "NYSE"), ("VOOG", "NYSE ARCA")]:
        req = DividendResearchRequest(symbol, exchange, "USD", date(2021, 10, 20), date(2026, 10, 20), schema_version=2)
        with pytest.raises(DividendResearchValidationError, match="ticker and exchange"):
            provider(voo_research()).research(req)


def test_voo_refresh_persists_quarterly_income_and_preserves_it_on_failure(monkeypatch, tmp_path):
    from app.infrastructure import foundry_web_research as module
    instance = provider(voo_research())
    monkeypatch.setattr(module, "FoundryWebDividendResearchProvider", lambda **options: instance)
    settings = Settings(_env_file=None, data_backend="json", local_json_path=str(tmp_path / "voo.json"),
        disable_auth_for_local_development=True, dividend_research_provider="azure_foundry",
        azure_foundry_endpoint=PROJECT, azure_foundry_deployment="web-model")
    app = create_app(settings)
    app.state.container.refresh_holding_dividends._today = lambda: date(2026, 10, 20)
    app.state.container.refresh_holding_dividends._freshness_seconds = 0
    with TestClient(app) as client:
        account = next(item for item in client.get("/api/v1/accounts").json() if item.get("manageHoldings"))
        added = client.post("/api/v1/holdings", json={"security": {
            "symbol": "VOO", "exchange": "NYSE ARCA", "name": "Vanguard S&P 500 ETF",
            "assetType": "ETF", "currency": "USD"},
            "accountPositions": [{"accountId": account["id"], "quantity": 10}]})
        assert added.status_code == 201, added.text
        holding_id = added.json()["id"]
        url = f"/api/v1/holdings/{holding_id}/dividends/refresh"
        refreshed = client.post(url)
        assert refreshed.status_code == 200, refreshed.text
        saved = refreshed.json()["security"]
        actuals = [item for item in saved["payoutDetails"] if item["status"] == "completed"]
        assert len(actuals) == 8
        assert len([item for item in actuals if item["exDividendDate"].startswith("2026")]) == 3
        assert next(item for item in actuals if item["exDividendDate"] == "2025-09-29")["paymentDate"] == "2025-10-01"
        assert actuals[-1]["amountPerShare"] == "1.8226"
        assert len([item for item in saved["payoutDetails"] if item["status"] == "projected"]) == 5
        assert saved["dividendResearchStatus"] == "partial"
        assert saved["dividendResearchSnapshot"]["evidence"]["citations"]
        instance._client = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(403)))
        assert client.post(url).status_code == 503
        assert next(item["security"] for item in client.get("/api/v1/holdings").json() if item["id"] == holding_id) == saved
    with TestClient(create_app(settings)) as client:
        restored = next(item["security"] for item in client.get("/api/v1/holdings").json() if item["id"] == holding_id)
        assert restored["payoutDetails"] == saved["payoutDetails"]
        assert restored["dividendResearchSnapshotId"] == saved["dividendResearchSnapshotId"]


def vym_research():
    """Quarterly rows from the live VYM reproduction, with optional fields absent."""
    data = voo_research()
    data['identity'].update(symbol='VYM', name='Vanguard High Dividend Yield ETF',
        evidence_excerpt='Ticker: VYM; Exchange: NYSE Arca; Name: Vanguard High Dividend Yield ETF; Asset type: ETF; Currency: USD.')
    rows = [
        ('2024-12-20', '2024-12-24', '0.9642'), ('2025-03-21', '2025-03-25', '0.85'),
        ('2025-06-20', '2025-06-24', '0.8617'), ('2025-09-19', '2025-09-23', '0.8417'),
        ('2025-12-19', '2025-12-23', '0.9474'), ('2026-03-20', '2026-03-24', '0.8617'),
        ('2026-06-18', '2026-06-23', '0.9795'), ('2026-09-18', '2026-09-22', '0.8869'),
    ]
    data['payments'] = [{**data['payments'][0], 'ex_dividend_date': ex_date, 'amount_per_share': amount,
        'payment_date': pay_date, 'record_date': None, 'is_regular': True,
        'evidence_excerpt': f'Ticker: VYM; Exchange: NYSE Arca; Ex-date: {ex_date}; Amount: USD {amount} per share; Payment date: {pay_date}; Status: paid/completed; Classification: regular; Share basis: not found.'}
        for ex_date, pay_date, amount in rows]
    return data


def fallback_provider(initial, supplemental, extracted, calls, *, fail_fallback=False):
    instance = provider()
    def handle(req):
        body = json.loads(req.content)
        calls.append(body)
        if 'tools' in body:
            number = sum('tools' in call for call in calls)
            assert number <= 2, 'Discovery must not retry indefinitely'
            if number == 2 and fail_fallback:
                raise httpx.ReadTimeout('private-timeout-message')
            response = grounded(initial if number == 1 else supplemental)
            response['id'] = f'research-{number}'
            return httpx.Response(200, json=response)
        return httpx.Response(200, json={'status': 'completed', 'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': json.dumps(extracted)}]}]})
    instance._client = httpx.Client(transport=httpx.MockTransport(handle))
    return instance


@pytest.mark.parametrize('data_factory', [voo_research, vym_research])
def test_empty_vanguard_profile_uses_cited_alternative_history_before_extracting(data_factory):
    data = data_factory()
    symbol = data['identity']['symbol']
    initial = deepcopy(data)
    initial['payments'] = []
    # Corporate-action evidence discovered on the first search must survive.
    split = dict(effective_date='2026-05-15', type='stock_split', old_shares=1.0, new_shares=2.0,
        source_url=SOURCE, evidence_excerpt=f'Ticker: {symbol}; Exchange: NYSE Arca; Effective date: 2026-05-15; 2-for-1 forward stock split; not reverse.')
    initial['corporate_actions'] = [split]
    extracted = deepcopy(data)
    extracted['corporate_actions'] = [split]
    calls = []
    req = DividendResearchRequest(symbol, 'NYSE ARCA', 'USD', date(2021, 10, 20), date(2026, 10, 20), schema_version=2)
    instance = fallback_provider(initial, data, extracted, calls)
    result = instance.research(req)
    assert len(calls) == 3 and 'tools' in calls[0] and 'tools' in calls[1] and 'text' in calls[2]
    prompt = json.loads(calls[0]['input'][1]['content'][0]['text'])
    assert prompt['history_pages'] == [
        f'https://www.nasdaq.com/market-activity/etf/{symbol.lower()}/dividend-history',
        f'https://stockanalysis.com/etf/{symbol.lower()}/dividend/',
    ]
    assert 'do not revisit empty issuer profiles' in calls[1]['input'][0]['content'][0]['text']
    assert len(result.payments) == 8 and len(result.corporate_actions) == 1
    evidence = result.evidence_snapshot
    assert evidence['response_ids'] == ['research-1', 'research-2']
    assert len(evidence['searches']) == 2
    assert split['evidence_excerpt'] in evidence['answer']
    for fact in evidence['facts']:
        assert instance._supported_claim(evidence, fact['excerpt'], fact['source_url'])
    for citation in evidence['citations']:
        assert evidence['answer'][citation['start_index']:citation['end_index']]


@pytest.mark.parametrize('data_factory', [voo_research, vym_research])
def test_readable_quarterly_history_needs_only_one_search(data_factory):
    data = data_factory()
    calls = []
    req = DividendResearchRequest(data['identity']['symbol'], 'NYSE ARCA', 'USD', date(2021, 10, 20), date(2026, 10, 20), schema_version=2)
    result = provider(data, calls=calls).research(req)
    events, _ = normalize_research(result, req)
    assert len(result.payments) == 8 and len(calls) == 2
    assert len(forecast_distributions(events, req)[0]) == 5


@pytest.mark.parametrize('claimed_type', ['income', 'capital_gain', 'return_of_capital'])
@pytest.mark.parametrize('data_factory', [voo_research, vym_research])
def test_unsourced_tax_classification_does_not_discard_cited_vanguard_payments(data_factory, claimed_type):
    data = data_factory()
    def classify(extracted):
        for item in extracted['payments']:
            item['distribution_type'] = claimed_type
    req = DividendResearchRequest(data['identity']['symbol'], 'NYSE ARCA', 'USD', date(2021, 10, 20), date(2026, 10, 20), schema_version=2)
    result = provider(data, change_extracted=classify).research(req)
    assert len(result.payments) == len(data['payments'])
    assert all(item.distribution_type == 'other' for item in result.payments)
    assert {item.amount_per_share for item in result.payments} == {item['amount_per_share'] for item in data['payments']}
    assert any('classification' in warning and 'Other' in warning for warning in result.warnings)
    events, _ = normalize_research(result, req)
    assert len(forecast_distributions(events, req)[0]) == 5


@pytest.mark.parametrize('effective_date', ['2013-10-24', '2028-01-01'])
def test_out_of_window_split_does_not_quarantine_current_voo_distributions(effective_date):
    data = voo_research()
    for item in data['payments']:
        item['distribution_type'] = 'income'
    data['corporate_actions'] = [dict(effective_date=effective_date, type='reverse_stock_split',
        old_shares=2.0, new_shares=1.0, source_url=SOURCE,
        evidence_excerpt=f'Ticker: VOO; Exchange: NYSE Arca; Split effective date: {effective_date}; Ratio: 1 new share for 2 old shares; Type: reverse split.')]
    req = DividendResearchRequest('VOO', 'NYSE ARCA', 'USD', date(2021, 10, 20), date(2026, 10, 20), schema_version=2)
    result = provider(data).research(req)
    assert len(result.payments) == 8 and not result.corporate_actions
    assert all(item.distribution_type == 'other' for item in result.payments)
    assert all(item.share_basis == 'current_share_basis' for item in result.payments)
    events, _ = normalize_research(result, req)
    assert all(not item.excluded_from_totals for item in events)
    assert len(forecast_distributions(events, req)[0]) == 5


def test_uncited_or_misdated_old_split_cannot_bypass_split_uncertainty():
    data = voo_research()
    data['corporate_actions'] = [dict(effective_date='2013-10-24', type='reverse_stock_split',
        old_shares=2.0, new_shares=1.0, source_url=SOURCE,
        evidence_excerpt='Ticker: VOO; Exchange: NYSE Arca; Split effective date: 2026-05-15; Ratio: 1 new share for 2 old shares; Type: reverse split.')]
    req = DividendResearchRequest('VOO', 'NYSE ARCA', 'USD', date(2021, 10, 20), date(2026, 10, 20), schema_version=2)
    result = provider(data).research(req)
    assert all(item.share_basis == 'unverified' for item in result.payments)


@pytest.mark.parametrize('line', [
    'Ticker: VYM; Exchange: NYSE Arca; Ex-date: 2026-09-18; Amount: not announced; Yield: 2.5%.',
    'Ticker: VYM; Exchange: NYSE Arca; Ex-date: 2026-09-18; Currency: USD; Payment date: 2026-09-22.',
    'Ticker: VOO; Exchange: NYSE Arca; Ex-date: 2026-09-18; Amount: USD 0.8869.',
])
def test_yield_date_calendar_and_other_ticker_do_not_count_as_history(line):
    instance = provider()
    req = DividendResearchRequest('VYM', 'NYSE ARCA', 'USD', date(2021, 10, 20), date(2026, 10, 20), schema_version=2)
    evidence = instance._parse_search(grounded(vym_research()))
    evidence['answer'] = line
    evidence['citations'] = [{'url': SOURCE, 'start_index': 0, 'end_index': len(line)}]
    assert not instance._has_distribution_rows(evidence, req)


def test_uncited_history_does_not_suppress_fallback_or_become_importable():
    data = vym_research()
    instance = provider()
    req = DividendResearchRequest('VYM', 'NYSE ARCA', 'USD', date(2021, 10, 20), date(2026, 10, 20), schema_version=2)
    evidence = instance._parse_search(grounded(data))
    evidence['citations'] = evidence['citations'][:1]
    assert not instance._has_distribution_rows(evidence, req)
    assert not instance._supported_claim(evidence, data['payments'][0]['evidence_excerpt'], SOURCE)


@pytest.mark.parametrize('fail_fallback', [False, True])
def test_empty_or_failed_fallback_remains_unavailable_without_invented_payments(fail_fallback):
    data = vym_research()
    data['payments'] = []
    calls = []
    req = DividendResearchRequest('VYM', 'NYSE ARCA', 'USD', date(2021, 10, 20), date(2026, 10, 20), schema_version=2)
    result = fallback_provider(data, data, data, calls, fail_fallback=fail_fallback).research(req)
    assert result.status == 'unavailable' and not result.payments
    assert len(calls) == 3
    assert ('Alternative distribution-history research did not complete' in ' '.join(result.warnings)) == fail_fallback
    assert 'private-timeout-message' not in json.dumps(result.evidence_snapshot)


def test_fallback_reserves_extraction_time_inside_original_deadline(monkeypatch):
    from app.infrastructure import foundry_web_research as module
    instance = provider()
    data = vym_research()
    data['payments'] = []
    evidence = instance._parse_search(grounded(data))
    deadlines = []
    clock = [100.0]
    monkeypatch.setattr(module.time, 'monotonic', lambda: clock[0])
    def search(prompt, deadline, **kwargs):
        deadlines.append(deadline)
        clock[0] += 20
        return deepcopy(evidence)
    def extract(evidence, schema, deadline):
        deadlines.append(deadline)
        return schema.model_validate(data)
    instance._search, instance._extract = search, extract
    req = DividendResearchRequest('VYM', 'NYSE ARCA', 'USD', date(2021, 10, 20), date(2026, 10, 20), schema_version=2)
    assert instance.research(req).status == 'unavailable'
    assert deadlines == [190, 145, 190]


def test_stock_discovery_hints_use_stock_history_paths():
    calls = []
    req = DividendResearchRequest('JEPQ', 'NASDAQ', 'USD', date(2021, 9, 4), date(2026, 9, 4), schema_version=2, asset_type='Stock')
    provider(calls=calls).research(req)
    prompt = json.loads(calls[0]['input'][1]['content'][0]['text'])
    assert all('/stocks/jepq/' in url for url in prompt['history_pages'])


def test_labeled_history_rows_with_unknown_tax_type_remain_other():
    data = research()
    for item in data["payments"]:
        item["evidence_excerpt"] = item["evidence_excerpt"].replace('distribution paid', 'Status: completed') + ' Type: not identified.'
    result = provider(data).research(request())
    assert len(result.payments) == 9
    assert all(item.distribution_type == 'other' for item in result.payments)


def test_cited_history_rows_accept_explicit_frequency_without_inventing_tax_type():
    data = research()
    for item in data["payments"]:
        item["evidence_excerpt"] = item["evidence_excerpt"].replace('distribution paid', 'Status: paid/completed') + ' Frequency/type: regular monthly.'
        item["is_regular"] = True
    result = provider(data).research(request())
    assert len(result.payments) == 9
    assert all(item.distribution_type == 'other' and item.regularity_basis == 'source_declared' for item in result.payments)


def test_cited_classification_regular_is_accepted_without_tax_inference():
    data = research()
    for item in data["payments"]:
        item["evidence_excerpt"] += ' Classification: regular.'
        item["is_regular"] = True
    result = provider(data).research(request())
    assert len(result.payments) == 9
    assert all(item.distribution_type == 'other' and item.is_regular for item in result.payments)
    events, _ = normalize_research(result, request())
    assert forecast_distributions(events, request())[0]


def test_markdown_field_labels_keep_exact_citations_and_validated_values():
    data = research()
    for item in [data["identity"], *data["payments"]]:
        for label in ('Ticker', 'Exchange', 'Currency', 'Asset type', 'Ex-date', 'Payment date'):
            item['evidence_excerpt'] = item['evidence_excerpt'].replace(label + ':', '**' + label + '**:')
        item['evidence_excerpt'] = item['evidence_excerpt'].replace('USD ', '`USD` ')
    result = provider(data).research(request())
    assert len(result.payments) == 9
    assert '**Ticker**:' in result.evidence_snapshot['answer']
    assert result.payments[0].amount_per_share == '0.451'


def test_complete_cited_identity_survives_extraction_copying_errors():
    def change(data):
        data['identity']['name'] = 'JPMorgan NASDAQ Equity Premium Income Fund'
        data['identity']['evidence_excerpt'] = 'JEPQ is an ETF.'
    result = provider(change_extracted=change).research(request())
    assert result.resolved_exchange == 'NASDAQ'
    assert len(result.payments) == 9


def test_known_listing_can_be_verified_from_current_cited_payment_rows():
    def change(data):
        data['output'][1]['content'][0]['annotations'].pop(0)
    result = provider(change_grounded=change).research(request())
    assert len(result.payments) == 9
    assert result.evidence_snapshot['identityVerification']['method'] == 'cited_distribution_listing'
    with pytest.raises(DividendResearchValidationError, match='ticker and exchange'):
        provider(change_grounded=change).research(request('United States'))


@pytest.mark.parametrize('identity_text', [
    'Currency: USD; Asset type: ETF; Name: JPMorgan Nasdaq Equity Premium Income ETF; Exchange: NASDAQ; Ticker: JEPQ.',
    'Ticker: JEPQ\nExchange: NASDAQ\nName: JPMorgan Nasdaq Equity Premium Income ETF\nAsset type: ETF\nCurrency: USD',
])
def test_identity_format_does_not_block_independently_cited_listing_payments(identity_text):
    data = research()
    data['identity']['evidence_excerpt'] = identity_text
    def bad_copy(data): data['identity']['evidence_excerpt'] = 'JEPQ is an ETF.'
    result = provider(data, change_extracted=bad_copy).research(request())
    assert len(result.payments) == 9
    assert result.evidence_snapshot['identityVerification']['method'] == 'cited_distribution_listing'


@pytest.mark.parametrize('change', [
    {'exchange': 'NYSE'}, {'symbol': 'OTHER'}, {'currency': 'CAD'}, {'source_url': 'https://attacker.example/claim'},
])
def test_listing_fallback_still_requires_current_matching_cited_rows(change):
    def mutate(data):
        data['identity']['evidence_excerpt'] = 'JEPQ is an ETF.'
        for item in data['payments']:
            if 'exchange' in change:
                item['evidence_excerpt'] = item['evidence_excerpt'].replace('Exchange: NASDAQ', 'Exchange: NYSE')
            if 'symbol' in change:
                item['evidence_excerpt'] = item['evidence_excerpt'].replace('Ticker: JEPQ', 'Ticker: OTHER')
            if 'currency' in change: item['currency'] = change['currency']
            if 'source_url' in change: item['source_url'] = change['source_url']
    data = research()
    data['identity']['evidence_excerpt'] = 'JEPQ is an ETF.'
    with pytest.raises(DividendResearchValidationError, match='ticker and exchange'):
        provider(data, change_extracted=mutate).research(request())


def test_listing_mic_alias_matches_without_combining_different_exchanges():
    data = research()
    for item in data['payments']:
        item['evidence_excerpt'] = item['evidence_excerpt'].replace('Exchange: NASDAQ', 'Exchange: XNAS')
    assert len(provider(data).research(request()).payments) == 9


@pytest.mark.parametrize("bad", ["no_search", "unfinished_search", "no_sources", "no_citations", "fabricated_source", "private_url"])
def test_requires_real_completed_search_and_matching_returned_citations(bad):
    def change(result):
        call, message = result["output"]
        if bad == "no_search": result["output"] = [message]
        if bad == "unfinished_search": call["status"] = "failed"
        if bad == "no_sources": call["action"]["sources"] = []
        if bad == "no_citations": message["content"][0]["annotations"] = []
        if bad == "fabricated_source": call["action"]["sources"][0]["url"] = "https://other.example/unrelated"
        if bad == "private_url":
            call["action"]["sources"][0]["url"] = "https://127.0.0.1/secret"
            for annotation in message["content"][0]["annotations"]: annotation["url"] = "https://127.0.0.1/secret"
    with pytest.raises(DividendResearchProviderError, match="no usable web search"):
        provider(change_grounded=change).research(request())


@pytest.mark.parametrize("change", [
    {"amount_per_share": "500"}, {"amount_per_share": "2026"}, {"ex_dividend_date": "2026-01-03"},
    {"source_url": "https://attacker.example/invented"}, {"evidence_excerpt": "Ticker JEPQ invented unsupported claim"},
    {"is_regular": True},
])
def test_rejects_extraction_hallucinations_without_losing_other_supported_facts(change):
    def mutate(data): data["payments"][0].update(change)
    result = provider(change_extracted=mutate).research(request())
    assert len(result.payments) == 8
    assert any("Rejected" in warning for warning in result.warnings)


def test_citation_on_different_fact_line_cannot_support_an_uncited_payment():
    def change(data): data["output"][1]["content"][0]["annotations"] = data["output"][1]["content"][0]["annotations"][:1]
    result = provider(change_grounded=change).research(request())
    assert not result.payments and result.status == "unavailable"


def test_conflicting_exchange_and_model_identity_echo_are_rejected():
    with pytest.raises(DividendResearchValidationError, match="ticker and exchange"):
        provider().research(request("NYSE"))
    def change(data): data["identity"]["symbol"] = "OTHER"
    repaired = provider(change_extracted=change).research(request())
    assert repaired.resolved_exchange == 'NASDAQ' and len(repaired.payments) == 9
    result = provider().research(request("United States"))
    assert result.resolved_exchange == "NASDAQ" and result.exchange == "United States"


def test_ambiguous_pre_split_amounts_are_retained_but_excluded_from_forecasts():
    text = "Ticker: JEPQ; Exchange: NASDAQ; 1-for-10 reverse stock split effective 2026-05-15."
    action = dict(effective_date="2026-05-15", type="reverse_stock_split", old_shares=10.0, new_shares=1.0, source_url=SOURCE, evidence_excerpt=text)
    result = provider(research(actions=[action])).research(request())
    assert len(result.corporate_actions) == 1
    assert all(item.share_basis == "unverified" for item in result.payments if item.ex_dividend_date < "2026-05-15")
    events, _ = normalize_research(result, request())
    assert all(item.excluded_from_totals for item in events if item.ex_dividend_date < "2026-05-15")


@pytest.mark.parametrize('basis_text', ['split-adjusted', 'post-split', 'not specified'])
@pytest.mark.parametrize('claimed_basis', ['current_share_basis', 'raw'])
def test_forward_split_not_reverse_and_unspecified_adjustment_date_keep_usable_history(basis_text, claimed_basis):
    text = 'Ticker: JEPQ; Exchange: NASDAQ; Effective date: 2026-05-15; 3-for-1 forward split; not reverse.'
    action = dict(effective_date='2026-05-15', type='stock_split', old_shares=1.0, new_shares=3.0, source_url=SOURCE, evidence_excerpt=text)
    data = research(actions=[action])
    for item in data['payments']:
        item['share_basis'] = claimed_basis
        item['evidence_excerpt'] += f' Share basis: {basis_text}.'
    result = provider(data).research(request())
    assert len(result.payments) == 9 and len(result.corporate_actions) == 1
    assert all(item.share_basis == 'unverified' for item in result.payments if item.ex_dividend_date < '2026-05-15')
    assert all(item.share_basis == 'current_share_basis' for item in result.payments if item.ex_dividend_date > '2026-05-15')


def test_reported_payments_and_url_aliases_use_the_actual_same_line_citation():
    data = research()
    for item in data['payments']:
        item['evidence_excerpt'] = item['evidence_excerpt'].replace('distribution paid', 'Status: declared and payment reported')
    def rewrite(extracted):
        for item in [extracted['identity'], *extracted['payments']]:
            item['source_url'] = SOURCE.replace('https://', 'https://www.') + '/'
    result = provider(data, change_extracted=rewrite).research(request())
    assert len(result.payments) == 9
    assert result.provenance.source_url == SOURCE
    assert all(item.source_url == SOURCE for item in result.payments)


@pytest.mark.parametrize('text', ['no payment reported', 'payment not reported'])
def test_negative_payment_report_cannot_become_completed(text):
    data = research()
    data['payments'][0]['evidence_excerpt'] = data['payments'][0]['evidence_excerpt'].replace('distribution paid', text)
    assert len(provider(data).research(request()).payments) == 8


def test_malformed_extracted_url_rejects_only_that_fact():
    result = provider(change_extracted=lambda data: data['payments'][0].update(source_url='https://[invalid')).research(request())
    assert len(result.payments) == 8


@pytest.mark.parametrize("code", [400, 401, 403, 404, 429, 500])
def test_service_errors_are_safe_and_do_not_return_provider_bodies(code):
    instance = provider()
    instance._client = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(code, text=TOKEN)))
    with pytest.raises(DividendResearchProviderError) as error: instance.research(request())
    assert TOKEN not in str(error.value)


def test_invalid_json_incomplete_responses_and_timeouts_preserve_data():
    instance = provider()
    for result in [{"status": "incomplete"}, {"status": "completed", "output": []}]:
        instance._client = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(200, json=result)))
        with pytest.raises(DividendResearchProviderError): instance.research(request())
    def timeout(req): raise httpx.ReadTimeout(TOKEN)
    instance._client = httpx.Client(transport=httpx.MockTransport(timeout))
    with pytest.raises(DividendResearchProviderError, match="timed out"): instance.research(request())


@pytest.mark.parametrize("output", [[None], [{"type": "web_search_call", "status": "completed", "action": None}], [{"type": "message", "content": [None]}]])
def test_malformed_tool_output_has_safe_retry_error(output):
    def change(data): data["output"] = output
    with pytest.raises(DividendResearchProviderError): provider(change_grounded=change).research(request())


def test_wire_schema_uses_azure_subset_while_local_validation_keeps_bounds():
    from app.infrastructure.foundry_web_research import _strict_schema
    from app.infrastructure.foundry_web_research import WebResearch
    from pydantic import ValidationError
    schema = json.dumps(_strict_schema(WebResearch))
    assert all(keyword not in schema for keyword in ('minLength', 'maxLength', 'maxItems', 'minItems'))
    invalid = research()
    invalid["identity"]["name"] = "x" * 251
    with pytest.raises(ValidationError): WebResearch.model_validate(invalid)


def test_reasoning_configuration_is_optional_and_separates_cached_results():
    base = dict(_env_file=None, dividend_research_provider="azure_foundry", azure_foundry_endpoint=PROJECT, azure_foundry_deployment="gpt-6-luna")
    assert Settings(**base, azure_foundry_reasoning_effort="").azure_foundry_reasoning_effort is None
    assert Settings(**base, azure_foundry_reasoning_effort="low").azure_foundry_reasoning_effort == "low"
    instance = provider()
    plain_key = instance.cache_key
    configured = FoundryWebDividendResearchProvider(endpoint=PROJECT, deployment="web-model", token_provider=lambda: TOKEN, reasoning_effort="low")
    assert configured.cache_key != plain_key
    seen = []
    data = research()
    def respond(req):
        body = json.loads(req.content)
        seen.append(body["reasoning"])
        return httpx.Response(200, json=grounded(data) if "tools" in body else {"status": "completed", "output": [{"type": "message", "content": [{"type": "output_text", "text": json.dumps(data)}]}]})
    configured._client = httpx.Client(transport=httpx.MockTransport(respond))
    assert configured.research(request()).payments
    assert seen == [{"effort": "low"}, {"effort": "low"}]


@pytest.mark.parametrize("environment", ["development", "production"])
@pytest.mark.parametrize("endpoint", [PROJECT, "https://demo.openai.azure.com"])
def test_entra_uses_cli_locally_and_selected_managed_identity_in_production(monkeypatch, environment, endpoint):
    import azure.identity
    calls = []
    def local(**options): calls.append(("local", options)); return object()
    def managed(**options): calls.append(("managed", options)); return object()
    def bearer(credential, scope): calls.append(("scope", scope)); return lambda: TOKEN
    monkeypatch.setattr(azure.identity, "DefaultAzureCredential", local)
    monkeypatch.setattr(azure.identity, "ManagedIdentityCredential", managed)
    monkeypatch.setattr(azure.identity, "get_bearer_token_provider", bearer)
    FoundryWebDividendResearchProvider(endpoint=endpoint, deployment="web-model", environment=environment, managed_identity_client_id="selected-client-id")
    assert calls[0][0] == ("local" if environment == "development" else "managed")
    if environment == "development":
        assert calls[0][1]["exclude_environment_credential"] and calls[0][1]["exclude_managed_identity_credential"]
    else:
        assert calls[0][1]["client_id"] == "selected-client-id"
    assert calls[1] == ("scope", "https://ai.azure.com/.default")


def test_security_search_resolves_real_identity_and_never_creates_demo_payouts():
    matches = provider().search_securities("JEPQ")
    assert len(matches) == 1 and matches[0].exchange == "NASDAQ"
    assert matches[0].price is None and matches[0].payout_details == []


def test_foundry_default_configuration_has_no_vendor_key_requirement():
    settings = Settings(_env_file=None, dividend_research_provider="azure_foundry", azure_foundry_endpoint=PROJECT, azure_foundry_deployment="web-model", alpha_vantage_api_key=None)
    settings.validate_security()
    assert settings.dividend_research_provider == "azure_foundry"


@pytest.mark.parametrize("endpoint", ["https://127.0.0.1/private", "http://demo.openai.azure.com", "https://demo.openai.azure.com/unexpected", "https://demo.openai.azure.com?key=unsafe"])
def test_foundry_configuration_rejects_unsafe_or_unsupported_endpoints(endpoint):
    settings = Settings(_env_file=None, dividend_research_provider="azure_foundry", azure_foundry_endpoint=endpoint, azure_foundry_deployment="web-model")
    with pytest.raises(ValueError, match="Azure resource HTTPS endpoint"): settings.validate_security()


def test_resource_key_auth_and_project_entra_requirement():
    calls = []
    data = research()
    def respond(req):
        assert req.headers["api-key"] == "private-resource-key"
        assert "Authorization" not in req.headers
        body = json.loads(req.content)
        calls.append(body)
        return httpx.Response(200, json=grounded(data) if "tools" in body else {"status": "completed", "output": [{"type": "message", "content": [{"type": "output_text", "text": json.dumps(data)}]}]})
    instance = FoundryWebDividendResearchProvider(endpoint="https://demo.openai.azure.com", deployment="web-model", auth_mode="key", api_key="private-resource-key", client=httpx.Client(transport=httpx.MockTransport(respond)))
    assert instance.research(request()).payments
    assert len(calls) == 2
    options = dict(_env_file=None, dividend_research_provider="azure_foundry", azure_foundry_endpoint=PROJECT, azure_foundry_deployment="web-model", azure_foundry_auth_mode="key", azure_foundry_api_key="private-resource-key")
    with pytest.raises(ValueError, match="Entra"): Settings(**options).validate_security()


def test_demo_to_foundry_refresh_clears_fixture_actions_and_updates_only_matching_listings():
    from dataclasses import replace
    from app.application.use_cases.dividend_refresh import RefreshHoldingDividends
    from app.domain.models import CorporateAction, Holding, SecurityMetadata, SecurityPayoutDetails
    from app.infrastructure.in_memory_repositories import InMemoryDataStore, InMemoryHoldingRepository
    store = InMemoryDataStore()
    manual = SecurityPayoutDetails("2026-05-10", 0.9, mode="manual", source="user")
    demo = SecurityPayoutDetails("2026-01-02", 9.0, source="stub")
    security = SecurityMetadata("JEPQ", "Saved name", "United States", "ETF", "USD", price=50,
        dividend_research_provider="stub", source_payout_details=[demo], manual_payout_details=[manual],
        corporate_actions=[CorporateAction("demo-split", "2026-04-01", "stock_split", 1, 4)])
    first = Holding("first", security, [], "", "")
    sibling = replace(first, id="sibling", security=replace(security, exchange="NASDAQ", manual_payout_details=[replace(manual, amount=0.7)]))
    other_listing = replace(first, id="other-listing", security=replace(security, exchange="NYSE"))
    store.holdings["owner"] = [first, sibling, other_listing]
    repository = InMemoryHoldingRepository(store)
    refreshed = RefreshHoldingDividends(repository, provider(), today=lambda: date(2026, 9, 4)).execute("owner", "first")
    saved = {item.id: item for item in repository.list_for_user("owner")}
    assert refreshed.security.exchange == saved["sibling"].security.exchange == "NASDAQ"
    assert refreshed.security.corporate_actions == saved["sibling"].security.corporate_actions == []
    assert refreshed.security.manual_payout_details[0].amount == 0.9
    assert saved["sibling"].security.manual_payout_details[0].amount == 0.7
    assert saved["other-listing"] == other_listing
    assert refreshed.security.price == 50
    assert all(item.source != "stub" for item in refreshed.security.source_payout_details)
    assert any(item.source == "stub" and item.status == "superseded" for item in refreshed.security.payout_audit_details)


def test_web_discovery_import_persistence_reconciliation_restart_and_failure(monkeypatch, tmp_path):
    from app.infrastructure import foundry_web_research as module
    import requests
    def unexpected(*args, **kwargs): raise AssertionError("No market-data service should be called")
    monkeypatch.setattr(requests, "get", unexpected)
    data = research([payment(month, year=year) for year in (2024, 2025, 2026) for month in range(1, 13) if (year, month) <= (2026, 9)])
    calls = []
    instance = provider(data, calls=calls)
    monkeypatch.setattr(module, "FoundryWebDividendResearchProvider", lambda **options: instance)
    path = tmp_path / "finance.json"
    settings = Settings(_env_file=None, data_backend="json", local_json_path=str(path), disable_auth_for_local_development=True,
        dividend_research_provider="azure_foundry", azure_foundry_endpoint=PROJECT, azure_foundry_deployment="web-model", alpha_vantage_api_key=None)
    app = create_app(settings)
    refresh = app.state.container.refresh_holding_dividends
    refresh._today = lambda: date(2026, 9, 4)
    refresh._freshness_seconds = 0
    store = app.state.container.data_store
    for user_id, holdings in store.holdings.items():
        store.holdings[user_id] = [holding for holding in holdings if holding.security.symbol != "JEPQ"]
    store.save()
    with TestClient(app) as client:
        matches = client.get("/api/v1/securities/search?q=JEPQ")
        assert matches.status_code == 200
        security = matches.json()[0]
        assert security["payoutDetails"] == []
        accounts = client.get("/api/v1/accounts").json()
        account = next(account for account in accounts if account.get("manageHoldings"))
        added = client.post("/api/v1/holdings", json={"security": security, "accountPositions": [{"accountId": account["id"], "quantity": 10}]})
        assert added.status_code == 201, added.text
        holding_id = added.json()["id"]
        url = f"/api/v1/holdings/{holding_id}/dividends/refresh"
        manual = client.put(f"/api/v1/holdings/{holding_id}/manual-payouts", json={"manualPayoutDetails": [{"exDividendDate": "2026-05-10", "amount": 0.9}]})
        assert manual.status_code == 200, manual.text
        first = client.post(url)
        assert first.status_code == 200, first.text
        first = first.json()["security"]
        assert first["dividendResearchSnapshot"]["evidence"]["searches"]
        assert first["dividendResearchSnapshot"]["evidence"]["citations"]
        assert len([item for item in first["payoutDetails"] if item["status"] == "projected" and item["exDividendDate"].startswith("2027")]) == 12
        october = next(item for item in first["sourcePayoutDetails"] if item["status"] == "projected" and item["exDividendDate"].startswith("2026-10"))
        announcement = payment(10, "0.49")
        announcement.update(status="announced", evidence_excerpt=announcement["evidence_excerpt"].replace("paid", "announced"))
        data["payments"].append(announcement)
        second = client.post(url)
        assert second.status_code == 200, second.text
        second = second.json()["security"]
        october_now = [item for item in second["sourcePayoutDetails"] if item["exDividendDate"].startswith("2026-10")]
        assert len(october_now) == 1 and october_now[0]["status"] == "announced"
        assert october_now[0]["supersedesEventId"] == october["eventId"]
        assert second["manualPayoutDetails"] == first["manualPayoutDetails"]
        repeated = client.post(url).json()["security"]
        assert repeated["sourcePayoutDetails"] == second["sourcePayoutDetails"]
        assert repeated["payoutAuditDetails"] == second["payoutAuditDetails"]
        before = deepcopy(repeated)
        data['identity']['symbol'] = 'OTHER'
        data['identity']['evidence_excerpt'] = data['identity']['evidence_excerpt'].replace('Ticker: JEPQ', 'Ticker: OTHER')
        invalid = client.post(url)
        assert invalid.status_code == 502
        assert 'ticker and exchange' in invalid.json()['detail']
        assert TOKEN not in invalid.text
        assert next(item['security'] for item in client.get('/api/v1/holdings').json() if item['id'] == holding_id) == before
        data['identity']['symbol'] = 'JEPQ'
        data['identity']['evidence_excerpt'] = data['identity']['evidence_excerpt'].replace('Ticker: OTHER', 'Ticker: JEPQ')
        instance._client = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(403, text=TOKEN)))
        assert client.post(url).status_code == 503
        preserved = next(item["security"] for item in client.get("/api/v1/holdings").json() if item["id"] == holding_id)
        assert preserved == before
    with TestClient(create_app(settings)) as client:
        restored = next(item["security"] for item in client.get("/api/v1/holdings").json() if item["id"] == holding_id)
        for field in ("payoutDetails", "sourcePayoutDetails", "manualPayoutDetails", "payoutAuditDetails", "dividendResearchSnapshot", "dividendResearchSnapshotId"):
            assert restored[field] == before[field], field
    assert any("tools" in call for call in calls)
    assert TOKEN not in path.read_text()


def test_exchange_source_authority_and_unrounded_jepq_december_distributions():
    from app.domain.distribution_forecasting import select_source_events
    nasdaq_url = "https://www.nasdaq.com/market-activity/etf/jepq/dividend-history"
    dec1_excerpt = "Ticker: JEPQ; Exchange: NASDAQ; distribution paid; Ex-date: 2025-12-01; Record date: 2025-12-01; Payment date: 2025-12-03; Amount: USD 0.55323."
    dec31_excerpt = "Ticker: JEPQ; Exchange: NASDAQ; distribution paid; Ex-date: 2025-12-31; Record date: 2025-12-31; Payment date: 2026-01-05; Amount: USD 0.5761."
    payments = [
        payment(month, year=2025) for month in range(2, 12)
    ] + [
        dict(ex_dividend_date="2025-12-01", amount_per_share="0.55323", currency="USD", status="completed",
             distribution_type="other", is_regular=None, share_basis="unverified", payment_date="2025-12-03",
             declaration_date=None, record_date="2025-12-01", source_url=nasdaq_url, evidence_excerpt=dec1_excerpt),
        dict(ex_dividend_date="2025-12-31", amount_per_share="0.5761", currency="USD", status="completed",
             distribution_type="other", is_regular=None, share_basis="unverified", payment_date="2026-01-05",
             declaration_date=None, record_date="2025-12-31", source_url=nasdaq_url, evidence_excerpt=dec31_excerpt),
    ]
    data = research(payments=payments)
    def add_nasdaq_citations(grounded_response):
        call, message = grounded_response["output"]
        call["action"]["sources"].append({"type": "url", "url": nasdaq_url})
        for ann in message["content"][0]["annotations"][-2:]:
            ann["url"] = nasdaq_url
    calls = []
    result = provider(data, change_grounded=add_nasdaq_citations, calls=calls).research(request())
    assert calls[0]["max_tool_calls"] == 10
    assert "nasdaq.com/market-activity" in calls[0]["input"][0]["content"][0]["text"]
    dec_payments = {item.ex_dividend_date: item for item in result.payments if item.ex_dividend_date.startswith("2025-12")}
    assert dec_payments["2025-12-01"].amount_per_share == "0.55323"
    assert dec_payments["2025-12-01"].source_authority == "exchange"
    assert dec_payments["2025-12-01"].is_regular is True
    assert dec_payments["2025-12-31"].amount_per_share == "0.5761"
    assert dec_payments["2025-12-31"].source_authority == "exchange"
    assert dec_payments["2025-12-31"].is_regular is True

    # Exchange authority outranks conflicting rounded secondary scraper reports.
    events, _ = normalize_research(result, request())
    dec1_exchange = next(item for item in events if item.ex_dividend_date == "2025-12-01")
    from dataclasses import replace
    dec1_rounded_secondary = replace(
        dec1_exchange, event_id="event-rounded-secondary", amount=0.5532, amount_per_share="0.5532",
        raw_amount="0.5532", source_authority="secondary", source_url="https://divvydiary.example/jepq",
    )
    selected, warnings = select_source_events([dec1_rounded_secondary, dec1_exchange])
    assert len(selected) == 1
    assert selected[0].amount_per_share == "0.55323"
    assert selected[0].source_authority == "exchange"
    assert any("Preferred final/official source" in w for w in warnings)
