from app.domain.models import SecurityPayoutDetails


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
            and source.payment_date == manual.payment_date
        ), None)
        same_date_index = next((
            index for index, source in enumerate(merged)
            if source.mode != "manual"
            and source.ex_dividend_date == manual.ex_dividend_date
        ), None)
        match_index = exact_index if exact_index is not None else same_date_index
        if match_index is None:
            merged.append(manual)
        else:
            merged[match_index] = manual
    return sorted(
        merged,
        key=lambda payout: (payout.payment_date or payout.ex_dividend_date, payout.ex_dividend_date),
    )
