from dataclasses import asdict, replace
from datetime import date
from decimal import Decimal

import pytest

from app.domain.dividend_research import DividendResearchAction, DividendResearchPayment, DividendResearchProvenance, DividendResearchRequest, DividendResearchResult, DividendResearchValidationError, subtract_months, validate_dividend_research_result
from app.domain.distribution_forecasting import forecast_distributions, normalize_research, reconcile_events, select_source_events
from app.domain.distribution_events import consolidate_source_events
from app.application.dividend_payouts import normalize_distribution_metadata
from app.domain.models import CorporateAction, Holding, SecurityMetadata, SecurityPayoutDetails
from app.infrastructure import cosmos_repositories as cosmos
from app.infrastructure import in_memory_repositories as memory
from app.presentation.http.mappers import to_security_metadata, to_security_metadata_payload


def request(as_of=date(2026, 9, 4)):
    return DividendResearchRequest("TEST", "NYSE", "USD", subtract_months(as_of, 60), as_of, schema_version=2)


def research(payments, actions=None, basis="raw"):
    return DividendResearchResult(2, "TEST", "2026-09-04T12:00:00Z", basis, payments, actions or [], [], DividendResearchProvenance("test", "https://issuer.example/dividends", True), exchange="NYSE")


def payment(day, amount, **kwargs):
    return DividendResearchPayment(day, str(amount), "completed", currency="USD", evidence_ref="sha256:evidence", source_authority="issuer", **kwargs)


def normalized_history():
    payments = [payment(f"{year}-{month:02d}-15", amount) for year, amount in [(2023, "1.01"), (2024, "1.25"), (2025, "1.50"), (2026, "1.75")] for month in [2, 5, 8, 11] if date(year, month, 15) <= request().retrieval_end]
    return normalize_research(research(payments), request())[0]


def test_calendar_month_clamping_and_forecast_boundaries():
    assert subtract_months(date(2024, 2, 29), 24) == date(2022, 2, 28)
    assert request(date(2026, 1, 1)).history_start == date(2024, 1, 1)
    events = normalized_history()
    forecasts, _ = forecast_distributions(events, request())
    assert len(forecasts) == 5
    assert all("2026-09-04" < item.ex_dividend_date <= "2027-12-31" for item in forecasts)
    november = forecasts[0]
    assert november.ex_dividend_date == "2026-11-16"  # observed Sunday rolls to estimated Monday
    assert november.amount_per_share == "1.25"
    assert november.forecast_range == {"min": "1.01", "max": "1.50"}
    assert november.payment_date is None
    assert november.status == "projected"
    replay = [SecurityPayoutDetails(**item) for item in [asdict(event) for event in events]]
    assert forecast_distributions(replay, request()) == forecast_distributions(events, request())


@pytest.mark.parametrize("old,new,amount,expected,kind", [(1, 4, "4.00", "1.00", "stock_split"), (10, 1, "0.12", "1.20", "reverse_stock_split")])
def test_splits_normalize_once_and_keep_raw_exact_amount(old, new, amount, expected, kind):
    action = DividendResearchAction("2026-08-01", kind, old, new, "https://issuer.example/split", "hash")
    result = research([payment("2026-05-15", amount)], [action])
    validate_dividend_research_result(result, request())
    events, _ = normalize_research(result, request())
    assert Decimal(events[0].amount_per_share) == Decimal(expected)
    assert events[0].raw_amount == amount
    assert len(events[0].applied_action_ids) == 1
    adjusted = replace(result, adjustment_basis="current_share_basis")
    assert normalize_research(adjusted, request())[0][0].amount_per_share == amount
    per_event_adjusted = replace(result, payments=[replace(result.payments[0], share_basis="current_share_basis")])
    assert normalize_research(per_event_adjusted, request())[0][0].amount_per_share == amount


def test_future_split_keeps_native_amount_and_current_basis_equivalent():
    action = DividendResearchAction("2026-10-01", "stock_split", 1, 4, "https://issuer.example/split", "hash")
    future = replace(payment("2026-11-15", "0.25"), status="announced")
    event = normalize_research(research([future], [action]), request())[0][0]
    assert event.raw_amount == "0.25"
    assert Decimal(event.amount_per_share) == Decimal("1.00")


def test_specials_remain_separate_and_do_not_suppress_regular_estimates():
    history = normalized_history()
    special = replace(history[-1], ex_dividend_date="2026-11-15", amount=100, amount_per_share="100", is_regular=False, status="announced", event_id="special")
    forecasts, _ = forecast_distributions(history + [special], request())
    assert forecasts[0].ex_dividend_date == "2026-11-16"
    regular = replace(special, is_regular=True, amount=1, amount_per_share="1", event_id="regular")
    active, warnings = select_source_events([regular, special])
    assert len(active) == 2 and not warnings
    assert not any(item.excluded_from_totals for item in active)
    result = research([payment("2026-05-15", 1), replace(payment("2026-05-15", 2), is_regular=False)])
    validate_dividend_research_result(result, request())
    active, warnings = select_source_events(normalize_research(result, request())[0])
    assert len(active) == 2 and not warnings


def test_insufficient_irregular_and_stale_history_produces_no_fabricated_amount():
    history = normalized_history()
    assert not forecast_distributions(history[:1], request())[0]
    assert not forecast_distributions(history[:4], request())[0]  # stale 2023 data
    irregular = [replace(history[index], ex_dividend_date=day) for index, day in enumerate(["2026-01-01", "2026-01-04", "2026-08-01"])]
    assert not forecast_distributions(irregular, request())[0]


def test_source_precedence_conflicts_and_declared_replacement_are_idempotent():
    history = normalized_history()
    forecasts, _ = forecast_distributions(history, request())
    projected = forecasts[0]
    official = replace(projected, event_id="announced", status="announced", source="issuer", source_authority="issuer", ex_dividend_date="2026-11-20", amount=2, amount_per_share="2")
    secondary = replace(official, event_id="secondary", status="completed", source_authority="secondary", amount=3, amount_per_share="3")
    selected, warnings = select_source_events([secondary, official])
    assert selected == [official] and warnings
    active, audit, _ = reconcile_events([projected], [official], [], request())
    assert len(active) == 1 and active[0].supersedes_event_id == projected.event_id
    assert audit[0].status == "superseded"
    assert reconcile_events(active, [replace(official)], audit, request())[:2] == (active, audit)
    conflict = replace(official, event_id="contradiction", amount=9, amount_per_share="9")
    selected, warnings = select_source_events([official, conflict])
    assert len(selected) == 2 and all(item.excluded_from_totals for item in selected) and warnings


def test_legacy_events_survive_partial_refresh_and_unverified_basis_is_quarantined():
    old = SecurityPayoutDetails("2026-05-01", 2, source="legacy")
    active, audit, warnings = reconcile_events([old], [], [], request())
    assert len(active) == 1 and active[0].event_id.startswith("legacy-")
    assert active[0].amount == 2 and active[0].excluded_from_totals
    assert warnings and not audit


@pytest.mark.parametrize('old_kind,new_kind', [('other', 'income'), ('income', 'other')])
def test_classification_change_of_same_cash_flow_replaces_instead_of_doubling(old_kind, new_kind):
    base = replace(normalized_history()[-1], payment_date='2026-08-20', distribution_type=old_kind, amount_per_share='0.264500000', event_id='old')
    current = replace(base, distribution_type=new_kind, amount_per_share='0.2645', event_id='new')
    active, audit, warnings = reconcile_events([base], [current], [], request())
    assert len(active) == 1 and active[0].event_id == 'new'
    assert active[0].supersedes_event_id == 'old'
    assert len(audit) == 1 and audit[0].status == 'superseded'
    assert not warnings
    assert reconcile_events([base, current], [replace(current)], audit, request())[:2] == (active, audit)


def test_different_classified_components_and_different_amounts_remain_separate():
    base = replace(normalized_history()[-1], payment_date='2026-08-20', event_id='old')
    capital_gain = replace(base, distribution_type='capital_gain', event_id='capital')
    assert len(reconcile_events([base], [capital_gain], [], request())[0]) == 2
    unknown_different_amount = replace(base, distribution_type='other', amount_per_share='9', event_id='unknown')
    assert len(reconcile_events([base], [unknown_different_amount], [], request())[0]) == 2


def duplicate_msft_security():
    base = replace(normalized_history()[-1], security_id='NASDAQ:MSFT', ex_dividend_date='2026-02-19',
                   payment_date='2026-03-12', amount=0.91, amount_per_share='0.910000', source='azure_foundry',
                   distribution_type='other', event_id='unclassified', regularity_basis='source_declared')
    classified = replace(base, distribution_type='income', amount_per_share='0.91', event_id='classified', regularity_basis='inferred_cadence_v1')
    return SecurityMetadata('MSFT', 'Microsoft Corporation', 'NASDAQ', 'Stock', 'USD',
                            payout_details=[base, classified], source_payout_details=[base, classified],
                            dividend_research_snapshot_id='original-snapshot', dividend_research_snapshot={'evidence': {'answer': 'Original research'}})


def test_screenshot_duplicate_is_one_cash_flow_with_an_audit_trail():
    security = duplicate_msft_security()
    fixed = normalize_distribution_metadata(security)
    assert len(fixed.source_payout_details) == len(fixed.payout_details) == 1
    assert fixed.source_payout_details[0].distribution_type == 'income'
    assert exact_total(fixed.payout_details) * 12 == Decimal('10.92')
    assert fixed.payout_audit_details[0].event_id == 'unclassified'
    assert fixed.payout_audit_details[0].status == 'superseded'
    assert fixed.dividend_research_snapshot == security.dividend_research_snapshot
    assert fixed.dividend_research_snapshot_id == 'original-snapshot'
    assert normalize_distribution_metadata(fixed) == fixed


def exact_total(events):
    return sum((Decimal(item.amount_per_share or str(item.amount)) for item in events), Decimal('0'))


def test_fresh_reports_are_consolidated_before_forecasting_and_precision_is_not_a_conflict():
    history = [replace(item, payment_date=item.ex_dividend_date, amount_per_share='1.0000') for item in normalized_history()[-5:]]
    unclassified = [replace(item, event_id='other-' + item.event_id, amount_per_share='1', distribution_type='other') for item in history]
    selected, warnings = select_source_events(history + unclassified)
    assert len(selected) == len(history) and not warnings
    assert len(forecast_distributions(selected, request())[0]) == 5
    same_type = replace(history[0], event_id='another-report', amount_per_share='1.0')
    assert not select_source_events([history[0], same_type])[1]


def test_dedup_preserves_components_specials_unknown_dates_and_share_bases():
    security = duplicate_msft_security()
    income = security.source_payout_details[1]
    capital = replace(income, distribution_type='capital_gain', event_id='capital')
    special = replace(income, is_regular=False, regularity_basis='source_special', event_id='special')
    missing_date = replace(income, payment_date=None, event_id='unknown-date')
    different_basis = replace(income, share_basis='unverified', excluded_from_totals=True, event_id='unverified')
    active, audit, _ = consolidate_source_events([income, capital, special, missing_date, different_basis])
    assert len(active) == 5 and not audit
    unknown = security.source_payout_details[0]
    active, _, warnings = consolidate_source_events([income, capital, unknown])
    assert len(active) == 3 and warnings
    assert next(item for item in active if item.distribution_type == 'other').excluded_from_totals


def test_both_storage_readers_and_http_input_repair_duplicates_preserving_manual():
    security = duplicate_msft_security()
    manual = SecurityPayoutDetails('2026-02-19', 2, mode='manual', source='user', distribution_type='income', payment_date='2026-03-12')
    security = replace(security, manual_payout_details=[manual])
    payload = to_security_metadata_payload(security)
    copies = [to_security_metadata(payload), memory._security_metadata_from_dict(payload.model_dump(by_alias=True)),
              cosmos._security_metadata_from_dict(cosmos._security_metadata_to_dict(security))]
    for restored in copies:
        assert len(restored.source_payout_details) == 1
        assert restored.manual_payout_details == [manual]
        assert restored.payout_details == [manual]
        assert len(restored.payout_audit_details) == 1


def test_local_startup_repairs_persisted_duplicates_once_without_research(tmp_path):
    import json
    from app.infrastructure.local_json_store import LocalJsonDataStore
    path = tmp_path / 'finance.json'
    store = LocalJsonDataStore('local@example.test', path)
    store.holdings['owner'] = [Holding('msft', duplicate_msft_security(), [], '', '')]
    store.save()
    before = json.loads(path.read_text())
    repaired = LocalJsonDataStore('local@example.test', path)
    after = json.loads(path.read_text())
    for key in before:
        if key != 'holdings': assert before[key] == after[key]
    security = repaired.holdings['owner'][0].security
    assert len(security.source_payout_details) == 1 and len(security.payout_audit_details) == 1
    assert len(after['holdings']['owner'][0]['security']['sourcePayoutDetails']) == 1
    saved = path.read_bytes()
    assert LocalJsonDataStore('local@example.test', path).holdings['owner'][0].security == security
    assert path.read_bytes() == saved


def test_invalid_identity_currency_dates_amounts_and_split_evidence_are_rejected():
    base = research([payment("2026-05-15", "1.0000000000001")])
    for bad in [replace(base, exchange="NASDAQ"), replace(base, payments=[replace(base.payments[0], currency="EUR")]), replace(base, payments=[replace(base.payments[0], amount_per_share="NaN")]), replace(base, payments=[replace(base.payments[0], payment_date="2026-05-01")]), replace(base, corporate_actions=[DividendResearchAction("2026-01-01", "stock_split", 1, 4)])]:
        with pytest.raises(DividendResearchValidationError):
            validate_dividend_research_result(bad, request())


def test_api_and_both_store_schemas_round_trip_new_fields_and_merge_manual():
    event = replace(normalized_history()[-1], is_regular=False, excluded_from_totals=True, forecast_range={"min": "1", "max": "2"})
    manual = SecurityPayoutDetails("2026-03-01", 8, source="user", mode="manual")
    security = SecurityMetadata("TEST", "Test", "NYSE", "ETF", "USD", payout_details=[event, manual], source_payout_details=[event], manual_payout_details=[manual], payout_audit_details=[replace(event, event_id="old", status="superseded")], dividend_status="researched", dividend_research_as_of="2026-09-04", dividend_research_status="partial", dividend_research_snapshot={"algorithm": "seasonal-median-v1"})
    payload = to_security_metadata_payload(security)
    assert to_security_metadata(payload) == security
    restored = memory._security_metadata_from_dict(payload.model_dump(by_alias=True))
    assert restored.payout_audit_details == security.payout_audit_details
    assert len(restored.payout_details) == 2
    restored = cosmos._security_metadata_from_dict(cosmos._security_metadata_to_dict(security))
    assert restored.source_payout_details == [event]
    assert restored.payout_audit_details == security.payout_audit_details
    assert restored.dividend_research_snapshot == security.dividend_research_snapshot
    assert restored.dividend_research_status == "partial" and restored.dividend_status == "researched"
    assert len(restored.payout_details) == 2


def test_monthly_five_year_snapshot_and_extended_audit_fit_cosmos_properties():
    # Extended records plus snapshot already exceed a single Azure Table string column.
    event = normalized_history()[-1]
    inputs = [replace(event, event_id=f"month-{index}", amount_per_share=f"1.{index:08d}") for index in range(60)]
    active = [replace(event, event_id=f"active-{index}") for index in range(42)]
    audit = [replace(event, event_id=f"audit-{index}", status="superseded") for index in range(100)]
    security = SecurityMetadata("TEST", "Test", "NYSE", "ETF", "USD", source_payout_details=active, payout_audit_details=audit, dividend_research_snapshot={"inputEvents": [asdict(item) for item in inputs]})
    holding = Holding("test", security, [], "now", "now")
    entity = cosmos._holding_to_entity("user", holding)
    assert entity["dividendsJsonEncoding"] == "gzip-base64-v1"
    assert all(len(value.encode("utf-16-le")) <= 64 * 1024 for value in entity.values() if isinstance(value, str))
    restored = cosmos._holding_from_entity(entity)
    assert restored.security.source_payout_details == active
    assert restored.security.payout_audit_details == audit
    assert restored.security.dividend_research_snapshot == security.dividend_research_snapshot
    legacy = cosmos._security_metadata_from_dict({"symbol": "TEST", "name": "Test", "exchange": "NYSE", "assetType": "ETF", "currency": "USD", "dividends": {"status": "stub"}})
    assert legacy.dividend_status == "stub" and legacy.dividend_research_status is None
    from app.domain.exceptions import ValidationError
    with pytest.raises(ValidationError, match="read/write limit"):
        cosmos._write_dividends_properties({"snapshot": "x" * 8_000_001})


def test_future_researched_split_serializes_and_round_trips_in_generic_holding_edits():
    from app.presentation.http.schemas import CorporateActionPayload, HoldingPayload
    from app.presentation.http.mappers import to_holding_payload
    from app.domain.models import Holding
    future = date.today().replace(year=date.today().year + 1).isoformat()
    action = CorporateAction("future-action", future, "stock_split", 1, 4)
    security = SecurityMetadata("TEST", "Test", "NYSE", "ETF", "USD", corporate_actions=[action])
    holding = Holding("test", security, [], "now", "now")
    payload = to_holding_payload(holding)
    assert HoldingPayload.model_validate(payload).security.corporate_actions[0].effective_date.isoformat() == future
    assert payload.model_dump(by_alias=True, mode="json")["security"]["corporateActions"][0]["effectiveDate"] == future
    reparsed = HoldingPayload.model_validate(payload.model_dump(by_alias=True, mode="json"))
    assert reparsed.security.corporate_actions[0].effective_date.isoformat() == future
    assert CorporateActionPayload(id="announced", effectiveDate=future, type="stock_split", oldShares=1, newShares=4)


def test_jepq_double_december_schedule_forecasts_both_december_slots_without_january_collision():
    req = DividendResearchRequest("JEPQ", "NASDAQ", "USD", date(2021, 10, 20), date(2026, 10, 20), schema_version=2)
    rows = [
        ("2024-10-01", "0.5499", "2024-10-03"),
        ("2024-11-01", "0.4936", "2024-11-05"),
        ("2024-12-02", "0.5083", "2024-12-04"),
        ("2024-12-31", "0.4558", "2025-01-03"),
        ("2025-02-03", "0.4502", "2025-02-05"),
        ("2025-03-03", "0.48238", "2025-03-05"),
        ("2025-04-01", "0.54069", "2025-04-03"),
        ("2025-05-01", "0.59786", "2025-05-05"),
        ("2025-06-02", "0.62074", "2025-06-04"),
        ("2025-07-01", "0.49416", "2025-07-03"),
        ("2025-08-01", "0.44377", "2025-08-05"),
        ("2025-09-02", "0.44195", "2025-09-04"),
        ("2025-10-01", "0.44612", "2025-10-03"),
        ("2025-11-03", "0.47553", "2025-11-05"),
        ("2025-12-01", "0.55323", "2025-12-03"),
        ("2025-12-31", "0.5761", "2026-01-05"),
        ("2026-02-02", "0.46572", "2026-02-04"),
        ("2026-03-02", "0.509", "2026-03-04"),
        ("2026-04-01", "0.5586", "2026-04-06"),
        ("2026-05-01", "0.59095", "2026-05-05"),
        ("2026-06-01", "0.56444", "2026-06-03"),
        ("2026-07-01", "0.63658", "2026-07-06"),
        ("2026-08-03", "0.70497", "2026-08-05"),
        ("2026-09-01", "0.68255", "2026-09-03"),
        ("2026-10-01", "0.56687", "2026-10-05"),
    ]
    payments = [
        payment(ex_day, amt, payment_date=pay_day, record_date=ex_day, distribution_type="other")
        for ex_day, amt, pay_day in rows
    ]
    result = DividendResearchResult(
        2, "JEPQ", "2026-10-20T12:00:00Z", "current_share_basis", payments, [], [],
        DividendResearchProvenance("azure_foundry", "https://www.nasdaq.com/market-activity/etf/jepq/dividend-history", False),
        exchange="NASDAQ",
    )
    actuals, _ = normalize_research(result, req)
    forecasts, warnings = forecast_distributions(actuals, req)
    forecast_dates = [item.ex_dividend_date for item in forecasts]
    assert "2026-12-01" in forecast_dates
    assert "2026-12-31" in forecast_dates
    assert "2027-01-01" not in forecast_dates
    assert "2027-12-01" in forecast_dates
    assert "2027-12-31" in forecast_dates
    assert len([d for d in forecast_dates if d.startswith("2027-")]) == 12

    # Repeated reconciliation is idempotent and never quarantines Dec 31 / Jan 1.
    combined = actuals + forecasts
    active, audit, rec_warnings = reconcile_events(combined, combined, [], req)
    assert not rec_warnings
    assert not any(item.excluded_from_totals for item in active)

    # Startup normalization repairs previously quarantined projected events from the old bug.
    corrupted_dec = replace(
        next(item for item in forecasts if item.ex_dividend_date == "2026-12-31"),
        event_id="forecast-old-dec31", excluded_from_totals=True,
    )
    corrupted_jan = replace(
        corrupted_dec, event_id="forecast-old-jan01", ex_dividend_date="2027-01-01", excluded_from_totals=True,
    )
    corrupted_security = SecurityMetadata(
        "JEPQ", "JPMorgan Nasdaq Equity Premium Income ETF", "NASDAQ", "ETF", "USD",
        source_payout_details=actuals + [corrupted_dec, corrupted_jan],
        payout_details=actuals + [corrupted_dec, corrupted_jan],
        dividend_research_as_of="2026-10-20",
        dividend_research_warnings=["Ambiguous reconciliation for 2026-12-31; affected events excluded from totals."],
    )
    repaired = normalize_distribution_metadata(corrupted_security)
    repaired_projected = [item for item in repaired.source_payout_details if item.status == "projected"]
    assert not any(item.excluded_from_totals for item in repaired.source_payout_details)
    assert "2026-12-01" in [item.ex_dividend_date for item in repaired_projected]
    assert "2026-12-31" in [item.ex_dividend_date for item in repaired_projected]
    assert "2027-01-01" not in [item.ex_dividend_date for item in repaired_projected]
    assert not any("Ambiguous reconciliation" in w for w in repaired.dividend_research_warnings)
    assert normalize_distribution_metadata(repaired) == repaired
