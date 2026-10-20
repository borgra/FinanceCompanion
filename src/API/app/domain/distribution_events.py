"""Identify repeated reports of one cash flow without merging tax components."""
from dataclasses import replace

from app.domain.dividend_research import DividendResearchValidationError, exact_amount
from app.domain.models import SecurityPayoutDetails


AUTHORITY = {"issuer": 4, "regulatory": 4, "exchange": 3, "secondary": 2, "stub": 1, None: 0}


def consolidate_source_events(events: list[SecurityPayoutDetails]):
    groups = {}
    untouched = []
    for event in events:
        # Unknown payment dates/bases and manual entries are not safe to merge.
        if (event.mode == 'manual' or event.status not in {'completed', 'announced'}
                or not event.event_id or not event.security_id or not event.currency
                or not event.payment_date or not event.share_basis or event.share_basis == 'unverified'):
            untouched.append(event)
            continue
        try:
            amount = exact_amount(event.amount_per_share or event.amount)
        except DividendResearchValidationError:
            untouched.append(event)
            continue
        key = (event.security_id.upper(), event.currency, event.ex_dividend_date,
               event.payment_date, amount, event.share_basis, event.status,
               event.is_regular, event.excluded_from_totals)
        groups.setdefault(key, []).append(event)

    active, superseded, warnings = list(untouched), [], []
    for candidates in groups.values():
        kinds = {event.distribution_type for event in candidates} - {'other'}
        buckets = {}
        for event in candidates:
            # Other means unclassified, so it is redundant with one identified
            # component of exactly the same cash flow, not an extra payment.
            bucket = 'cash_flow' if len(kinds) <= 1 else event.distribution_type
            buckets.setdefault(bucket, []).append(event)
        for kind, reports in buckets.items():
            winner = max(reports, key=lambda item: (
                AUTHORITY.get(item.source_authority, 0),
                item.distribution_type != 'other', item.event_id,
            ))
            removed = [item for item in reports if item is not winner]
            if kind == 'other' and len(kinds) > 1:
                winner = replace(winner, excluded_from_totals=True)
                warnings.append(f"Unclassified distribution on {winner.ex_dividend_date} matches multiple components; excluded from totals.")
            if removed and not winner.supersedes_event_id:
                winner = replace(winner, supersedes_event_id=next((item.event_id for item in removed if item.event_id != winner.event_id), None))
            active.append(winner)
            superseded.extend(replace(item, status='superseded') for item in removed if item.event_id != winner.event_id)
    if not superseded and not warnings and len(active) == len(events):
        return list(events), [], []
    return sorted(active, key=lambda item: (item.ex_dividend_date, item.event_id or '')), superseded, warnings
