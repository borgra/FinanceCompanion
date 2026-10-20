"""Versioned arithmetic over validated evidence. No AI arithmetic or growth assumptions."""
from __future__ import annotations

import calendar
import hashlib
import json
from dataclasses import asdict, replace
from datetime import date, timedelta
from decimal import Decimal
from statistics import median

from app.domain.dividend_research import DividendResearchPayment, DividendResearchRequest, DividendResearchResult, exact_amount
from app.domain.distribution_events import AUTHORITY, consolidate_source_events
from app.domain.models.security_metadata import CorporateAction, SecurityPayoutDetails

MODEL = "seasonal-median-v1"


def infer_recurrence(payments: list[DividendResearchPayment], request: DividendResearchRequest) -> list[DividendResearchPayment]:
    """Infer eligibility from observed cadence separately from source classification."""
    candidates = sorted([item for item in payments if item.regularity_basis != "source_special" and item.distribution_type in {"other", "income", "return_of_capital"} and item.share_basis != "unverified"], key=lambda item: item.ex_dividend_date)
    history = [item for item in candidates if item.ex_dividend_date <= request.retrieval_end.isoformat()]
    if len(history) < 4:
        return payments
    gaps = [(date.fromisoformat(later.ex_dividend_date) - date.fromisoformat(earlier.ex_dividend_date)).days for earlier, later in zip(history, history[1:]) if later.ex_dividend_date != earlier.ex_dividend_date]
    if not gaps:
        return payments
    typical = median(gaps[-12:])
    cadence = next(((low, high) for low, high in ((20, 45), (65, 115), (145, 220), (300, 400)) if low <= typical <= high), None)
    if cadence is None or sum(cadence[0] <= value <= cadence[1] for value in gaps[-12:]) < len(gaps[-12:]) * .7:
        return payments
    base = median([exact_amount(item.amount_per_share) for item in history[-12:]])
    counts = {day: sum(item.ex_dividend_date == day for item in candidates) for day in {item.ex_dividend_date for item in candidates}}
    inferred = set()
    for index, item in enumerate(candidates):
        if item.regularity_basis is not None:
            continue
        previous = candidates[index - 1] if index else None
        later = candidates[index + 1] if index + 1 < len(candidates) else None
        adjacent = [(date.fromisoformat(item.ex_dividend_date) - date.fromisoformat(previous.ex_dividend_date)).days] if previous else []
        if later:
            adjacent.append((date.fromisoformat(later.ex_dividend_date) - date.fromisoformat(item.ex_dividend_date)).days)
        if counts[item.ex_dividend_date] == 1 and any(cadence[0] <= days <= cadence[1] for days in adjacent) and exact_amount(item.amount_per_share) <= base * Decimal("2.5"):
            inferred.add(item.evidence_ref)
    return [replace(item, is_regular=True, regularity_basis="inferred_cadence_v1") if item.evidence_ref in inferred else item for item in payments]


def stable_id(prefix: str, value: object) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()
    return f"{prefix}-{hashlib.sha256(encoded).hexdigest()[:24]}"


def normalize_research(result: DividendResearchResult, request: DividendResearchRequest):
    as_of = request.retrieval_end.isoformat()
    actions = [CorporateAction(
        id=stable_id("action", asdict(action)), effective_date=action.effective_date,
        type=action.type, old_shares=action.old_shares, new_shares=action.new_shares,
    ) for action in result.corporate_actions]
    normalized = []
    for payment in result.payments:
        raw = exact_amount(payment.amount_per_share)
        amount = raw
        applied = []
        basis = payment.share_basis or result.adjustment_basis
        if basis == "raw":
            for action in sorted(actions, key=lambda item: (item.effective_date, item.id)):
                ratio = Decimal(str(action.new_shares)) / Decimal(str(action.old_shares))
                if payment.ex_dividend_date < action.effective_date <= as_of:
                    amount /= ratio
                    applied.append(action.id)
                elif as_of < action.effective_date <= payment.ex_dividend_date:
                    amount *= ratio
                    applied.append(action.id)
        fields = dict(
            ex_dividend_date=payment.ex_dividend_date, amount=float(amount), amount_per_share=str(amount),
            raw_amount=str(raw), share_basis="unverified" if basis == "unverified" else f"as_of:{as_of}", applied_action_ids=applied,
            declaration_date=payment.declaration_date, record_date=payment.record_date,
            payment_date=payment.payment_date, source=result.provenance.provider,
            source_url=payment.source_url or result.provenance.source_url, status=payment.status,
            currency=payment.currency or request.currency, security_id=request.security_id,
            distribution_type=payment.distribution_type, is_regular=payment.is_regular,
            regularity_basis=payment.regularity_basis, excluded_from_totals=basis == "unverified",
            evidence_ref=payment.evidence_ref, source_authority=payment.source_authority,
        )
        normalized.append(SecurityPayoutDetails(**fields, event_id=stable_id("event", fields)))
    return normalized, actions


def select_source_events(events: list[SecurityPayoutDetails]):
    """Prefer final/official facts; quarantine equal-authority contradictions."""
    grouped: dict[tuple, list[SecurityPayoutDetails]] = {}
    for item in events:
        grouped.setdefault((item.security_id, item.ex_dividend_date, item.distribution_type, item.is_regular), []).append(item)
    active, warnings = [], []
    for candidates in grouped.values():
        candidates.sort(key=lambda item: (
            AUTHORITY[item.source_authority], item.status == "completed", item.event_id or "",
        ), reverse=True)
        best = candidates[0]
        peers = [item for item in candidates if item.status == best.status and AUTHORITY[item.source_authority] == AUTHORITY[best.source_authority]]
        if len({(exact_amount(item.amount_per_share or item.amount), item.payment_date) for item in peers}) > 1:
            warnings.append(f"Conflicting sources for {best.ex_dividend_date}; excluded from totals pending review.")
            active.extend(replace(item, excluded_from_totals=True) for item in peers)
        else:
            active.append(best)
            if any(exact_amount(item.amount_per_share or item.amount) != exact_amount(best.amount_per_share or best.amount) for item in candidates[1:]):
                warnings.append(f"Preferred final/official source for {best.ex_dividend_date} over conflicting evidence.")
    active, _, duplicate_warnings = consolidate_source_events(active)
    return sorted(active, key=lambda item: (item.ex_dividend_date, item.event_id or '')), warnings + duplicate_warnings


def cadence_months(events: list[SecurityPayoutDetails]) -> int | None:
    dates = sorted({date.fromisoformat(item.ex_dividend_date) for item in events})
    if len(dates) < 2:
        return None
    intervals = [(later - earlier).days for earlier, later in zip(dates, dates[1:])][-8:]
    middle = median(intervals)
    for low, high, months in ((20, 45, 1), (65, 115, 3), (145, 220, 6), (300, 400, 12)):
        if low <= middle <= high and sum(low <= value <= high for value in intervals) >= len(intervals) * 0.75:
            return months
    return None


def _shift_months(value: date, months: int, day: int | None = None) -> date:
    index = value.year * 12 + value.month - 1 + months
    year, month = divmod(index, 12)
    return date(year, month + 1, min(day or value.day, calendar.monthrange(year, month + 1)[1]))


def _is_year_end_shift_item(day: date, year_end_shift: bool) -> bool:
    return year_end_shift and day.month == 12 and day.day >= 24


def _slot_month(day: date, year_end_shift: bool) -> int:
    return 1 if _is_year_end_shift_item(day, year_end_shift) else day.month


def forecast_distributions(events: list[SecurityPayoutDetails], request: DividendResearchRequest):
    forecasts, warnings = [], []
    for kind in ("income", "return_of_capital", "other"):
        history = sorted([
            item for item in events if item.is_regular and item.distribution_type == kind
            and item.status == "completed" and not item.excluded_from_totals
            and item.ex_dividend_date <= request.retrieval_end.isoformat()
        ], key=lambda item: item.ex_dividend_date)
        if not history:
            continue
        months = cadence_months(history)
        if months is None:
            warnings.append(f"{kind}: forecast unavailable because regular cadence is not established.")
            continue
        hist_dates = [date.fromisoformat(item.ex_dividend_date) for item in history]
        anchor = hist_dates[-1]
        if (request.retrieval_end - anchor).days > months * 31 * 2:
            warnings.append(f"{kind}: forecast unavailable because regular distribution history is stale.")
            continue
        year_end_shift = (
            months == 1
            and any(d.month == 12 and d.day <= 10 for d in hist_dates)
            and any(d.month == 12 and d.day >= 24 for d in hist_dates)
            and not any(d.month == 1 for d in hist_dates)
        )
        regular_days = [d.day for d in hist_dates if not _is_year_end_shift_item(d, year_end_shift)]
        anchor_day = int(median(regular_days)) if year_end_shift and regular_days else anchor.day
        anchor_slot = date(anchor.year + 1, 1, anchor_day) if _is_year_end_shift_item(anchor, year_end_shift) else _shift_months(anchor, 0, anchor_day)
        candidate = _shift_months(anchor_slot, months, anchor_day)
        while candidate <= request.forecast_end or (year_end_shift and candidate.month == 1 and date(candidate.year - 1, 12, 24) <= request.forecast_end):
            same_slot = [item for item in history if _slot_month(date.fromisoformat(item.ex_dividend_date), year_end_shift) == candidate.month][-3:]
            chosen = same_slot if len(same_slot) >= 2 else history[-4:]
            if len(chosen) < 2:
                break
            estimated_day = int(median([date.fromisoformat(item.ex_dividend_date).day for item in (same_slot or chosen)]))
            if year_end_shift and candidate.month == 1:
                estimated = _shift_months(date(candidate.year - 1, 12, 1), 0, estimated_day)
                if estimated.weekday() >= 5:
                    estimated -= timedelta(days=estimated.weekday() - 4)
            else:
                estimated = _shift_months(candidate, 0, estimated_day)
                # No licensed exchange holiday calendar yet: weekend roll only, always labeled estimated.
                if estimated.weekday() >= 5:
                    estimated += timedelta(days=7 - estimated.weekday())
            if request.retrieval_end < estimated <= request.forecast_end:
                declared = [item for item in events if item.distribution_type == kind and item.is_regular and item.status != "projected" and abs((date.fromisoformat(item.ex_dividend_date) - estimated).days) <= 14]
                if not declared:
                    amounts = [exact_amount(item.amount_per_share or item.amount) for item in chosen]
                    base = median(amounts)
                    fields = dict(
                        security_id=request.security_id, ex_dividend_date=estimated.isoformat(),
                        amount=float(base), amount_per_share=str(base), currency=request.currency,
                        distribution_type=kind, status="projected", source="forecast", is_regular=True,
                        regularity_basis=chosen[-1].regularity_basis,
                        share_basis=f"as_of:{request.retrieval_end.isoformat()}", forecast_method=MODEL,
                        forecast_range={"min": str(min(amounts)), "max": str(max(amounts))} if len(same_slot) >= 3 else None,
                        forecast_input_event_ids=[item.event_id for item in chosen if item.event_id],
                        forecast_as_of=request.retrieval_end.isoformat(),
                    )
                    forecasts.append(SecurityPayoutDetails(**fields, event_id=stable_id("forecast", fields)))
            candidate = _shift_months(candidate, months, anchor_day)
    if forecasts:
        warnings.append("Projected dates use observed seasonality and weekend adjustment; exchange holidays are not modeled. Historical ranges are scenarios, not confidence intervals.")
    return forecasts, warnings


def _safe_date(value: str) -> date | None:
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _safe_amount(value: float | str) -> Decimal | None:
    try:
        return exact_amount(value)
    except Exception:
        return None


def reconcile_events(previous: list[SecurityPayoutDetails], current: list[SecurityPayoutDetails], audit: list[SecurityPayoutDetails], request: DividendResearchRequest):
    active = [replace(item) for item in current]
    revisions = {item.event_id: item for item in audit if item.event_id}
    warnings = []
    for old in previous:
        if not old.event_id:
            old = replace(old, security_id=old.security_id or request.security_id,
                          event_id=stable_id("legacy", asdict(old)))
        exact = next((item for item in active if item.event_id == old.event_id), None)
        if exact:
            if old.supersedes_event_id:
                exact.supersedes_event_id = old.supersedes_event_id
            continue
        old_ex_date = _safe_date(old.ex_dividend_date)
        old_amount = _safe_amount(old.amount_per_share or old.amount)
        if old_ex_date is None or old_amount is None:
            revisions[old.event_id] = replace(old, status="superseded")
            continue
        same_date_matches = [
            item for item in active
            if item.security_id == old.security_id
            and item.distribution_type == old.distribution_type
            and item.is_regular == old.is_regular
            and item.ex_dividend_date == old.ex_dividend_date
        ]
        matches = same_date_matches or [
            item for item in active
            if item.security_id == old.security_id
            and item.distribution_type == old.distribution_type
            and item.is_regular == old.is_regular
            and old.status in {"projected", "announced"}
            and item.is_regular and old.is_regular
            and abs((date.fromisoformat(item.ex_dividend_date) - old_ex_date).days) <= 14
        ]
        if not matches:
            # Other is an unclassified payment, not an additional tax component.
            # A later classification of the same dated cash flow replaces it.
            matches = [item for item in active if item.security_id == old.security_id
                       and item.distribution_type != old.distribution_type
                       and 'other' in {item.distribution_type, old.distribution_type}
                       and item.ex_dividend_date == old.ex_dividend_date
                       and item.payment_date and item.payment_date == old.payment_date
                       and item.currency and item.currency == old.currency
                       and item.is_regular == old.is_regular
                       and abs(exact_amount(item.amount_per_share or item.amount) - old_amount) <= Decimal("0.0005")]
        if len(matches) == 1:
            replacement = matches[0]
            if old.status == "completed" and replacement.status != "completed":
                active.remove(replacement)
                active.append(old)
                continue
            if not replacement.supersedes_event_id:
                replacement.supersedes_event_id = old.event_id
            revisions[old.event_id] = replace(old, status="superseded")
        elif len(matches) > 1 and old.status != "projected":
            warnings.append(f"Ambiguous reconciliation for {old.ex_dividend_date}; affected events excluded from totals.")
            for item in matches:
                item.excluded_from_totals = True
            active.append(replace(old, excluded_from_totals=True))
        elif old.status in {"completed", "announced"} and request.history_start.isoformat() <= old.ex_dividend_date <= request.forecast_end.isoformat():
            if old.share_basis != f"as_of:{request.retrieval_end.isoformat()}":
                # Missing source evidence cannot justify guessing whether another split occurred.
                old = replace(old, excluded_from_totals=True)
                warnings.append(f"Retained prior event {old.ex_dividend_date}; share basis requires verification before inclusion in totals.")
            active.append(old)
        else:
            revisions[old.event_id] = replace(old, status="superseded")
    active, duplicates, duplicate_warnings = consolidate_source_events(active)
    revisions.update({item.event_id: item for item in duplicates})
    return sorted(active, key=lambda item: (item.ex_dividend_date, item.event_id or '')), list(revisions.values()), warnings + duplicate_warnings
