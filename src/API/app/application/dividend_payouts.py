from dataclasses import replace
from datetime import date

from app.domain.dividend_research import DividendResearchRequest, subtract_months
from app.domain.distribution_events import consolidate_source_events
from app.domain.distribution_forecasting import forecast_distributions, reconcile_events
from app.domain.models import SecurityMetadata, SecurityPayoutDetails


def normalize_distribution_metadata(security: SecurityMetadata) -> SecurityMetadata:
    source, duplicates, warnings = consolidate_source_events(security.source_payout_details)
    has_quarantined_forecasts = bool(
        security.dividend_research_as_of
        and any(item.status == "projected" and item.excluded_from_totals for item in source)
    )
    if not duplicates and not warnings and source == security.source_payout_details and not has_quarantined_forecasts:
        return security
    audit = list(security.payout_audit_details)
    known = {item.event_id for item in audit if item.event_id}
    for event in duplicates:
        if event.event_id not in known:
            audit.append(event)
            known.add(event.event_id)
    cleaned_warnings = list(security.dividend_research_warnings)
    if has_quarantined_forecasts and security.dividend_research_as_of:
        try:
            as_of = date.fromisoformat(security.dividend_research_as_of[:10])
            req = DividendResearchRequest(
                security.symbol, security.exchange, security.currency,
                subtract_months(as_of, 60), as_of, schema_version=2,
            )
            actuals = [item for item in source if item.status != "projected"]
            old_projected = [item for item in source if item.status == "projected"]
            forecasts, _ = forecast_distributions(actuals, req)
            source, audit, reconcile_warnings = reconcile_events(old_projected, actuals + forecasts, audit, req)
            warnings.extend(reconcile_warnings)
            cleaned_warnings = [
                w for w in cleaned_warnings
                if not w.startswith("Ambiguous reconciliation for ")
            ]
        except ValueError:
            pass
    return replace(security, source_payout_details=source,
                   payout_details=merge_dividend_payouts(source, security.manual_payout_details),
                   payout_audit_details=audit,
                   dividend_research_warnings=list(dict.fromkeys(cleaned_warnings + warnings)))


def merge_dividend_payouts(
    source_payouts: list[SecurityPayoutDetails],
    manual_payouts: list[SecurityPayoutDetails],
) -> list[SecurityPayoutDetails]:
    """Merge without collapsing legitimate same-ex-date source payments.

    A manual payment replaces one exact source identity when possible, then one
    same-ex-date source payment as a fallback. Unmatched manual payments are kept.
    """
    merged = list(source_payouts)
    for manual in manual_payouts:
        exact_index = next((
            index for index, source in enumerate(merged)
            if source.mode != "manual"
            and source.ex_dividend_date == manual.ex_dividend_date
            and source.distribution_type == manual.distribution_type
            and source.is_regular == manual.is_regular
            and source.payment_date == manual.payment_date
        ), None)
        same_date_index = next((
            index for index, source in enumerate(merged)
            if source.mode != "manual"
            and source.ex_dividend_date == manual.ex_dividend_date
            and source.distribution_type == manual.distribution_type
            and source.is_regular == manual.is_regular
        ), None)
        match_index = exact_index if exact_index is not None else same_date_index
        if match_index is None:
            merged.append(manual)
        else:
            merged[match_index] = manual
    return sorted(
        merged,
        key=lambda payout: (payout.ex_dividend_date, payout.distribution_type),
    )
