from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime


@dataclass(frozen=True, slots=True)
class DividendResearchRequest:
    symbol: str
    exchange: str
    currency: str
    retrieval_start: date
    retrieval_end: date
    schema_version: int = 1


@dataclass(frozen=True, slots=True)
class DividendResearchPayment:
    ex_dividend_date: str
    amount_per_share: float
    status: str
    payment_date: str | None = None
    declaration_date: str | None = None
    record_date: str | None = None
    source_url: str | None = None


@dataclass(frozen=True, slots=True)
class DividendResearchAction:
    effective_date: str
    type: str
    old_shares: float
    new_shares: float


@dataclass(frozen=True, slots=True)
class DividendResearchProvenance:
    provider: str
    source_url: str | None
    authoritative: bool


@dataclass(frozen=True, slots=True)
class DividendResearchResult:
    schema_version: int
    symbol: str
    retrieved_at: str
    adjustment_basis: str
    payments: list[DividendResearchPayment]
    corporate_actions: list[DividendResearchAction]
    warnings: list[str]
    provenance: DividendResearchProvenance


class DividendResearchValidationError(ValueError):
    pass


def validate_dividend_research_result(result: DividendResearchResult, request: DividendResearchRequest) -> DividendResearchResult:
    if result.schema_version != 1 or result.schema_version != request.schema_version:
        raise DividendResearchValidationError("Unsupported dividend research schema version.")
    if result.symbol.strip().upper() != request.symbol.strip().upper():
        raise DividendResearchValidationError("Dividend research symbol does not match the holding.")
    try:
        retrieved_at = datetime.fromisoformat(result.retrieved_at.replace("Z", "+00:00"))
        if retrieved_at.tzinfo is None:
            raise ValueError
    except ValueError as exc:
        raise DividendResearchValidationError("Dividend research retrievedAt must be an ISO timestamp.") from exc
    if result.adjustment_basis not in {"raw", "current_share_basis"}:
        raise DividendResearchValidationError("Dividend research adjustmentBasis is invalid.")
    if not result.provenance.provider.strip() or not result.provenance.source_url:
        raise DividendResearchValidationError("Dividend research provenance is incomplete.")
    payment_ids: set[tuple[str, str | None]] = set()
    for payment in result.payments:
        try:
            ex_date = date.fromisoformat(payment.ex_dividend_date)
            if not request.retrieval_start <= ex_date <= request.retrieval_end and not (
                payment.status == "announced" and ex_date.year == request.retrieval_end.year
            ):
                raise ValueError
            for value in (payment.payment_date, payment.declaration_date, payment.record_date):
                if value is not None:
                    date.fromisoformat(value)
        except ValueError as exc:
            raise DividendResearchValidationError("Dividend research contains an invalid payment date.") from exc
        if payment.status not in {"completed", "announced"}:
            raise DividendResearchValidationError("Dividend payment status is invalid.")
        if not math.isfinite(payment.amount_per_share) or payment.amount_per_share < 0:
            raise DividendResearchValidationError("Dividend amounts must be finite and non-negative.")
        if not (payment.source_url or result.provenance.source_url):
            raise DividendResearchValidationError("Dividend payment provenance is incomplete.")
        identity = (payment.ex_dividend_date, payment.payment_date)
        if identity in payment_ids:
            raise DividendResearchValidationError("Dividend payments must be unique.")
        payment_ids.add(identity)
    action_ids: set[tuple[str, str, float, float]] = set()
    for action in result.corporate_actions:
        try:
            action_date = date.fromisoformat(action.effective_date)
            if action_date > request.retrieval_end:
                raise ValueError
        except ValueError as exc:
            raise DividendResearchValidationError("Corporate action effective date is invalid.") from exc
        if action.type not in {"stock_split", "reverse_stock_split"}:
            raise DividendResearchValidationError("Corporate action type is invalid.")
        if not all(math.isfinite(value) and value > 0 for value in (action.old_shares, action.new_shares)):
            raise DividendResearchValidationError("Corporate action ratios must be finite and positive.")
        if action.old_shares == action.new_shares:
            raise DividendResearchValidationError("Corporate action ratio cannot be 1:1.")
        if action.type == "stock_split" and action.new_shares <= action.old_shares:
            raise DividendResearchValidationError("Stock splits must increase shares.")
        if action.type == "reverse_stock_split" and action.new_shares >= action.old_shares:
            raise DividendResearchValidationError("Reverse splits must decrease shares.")
        identity = (action.effective_date, action.type, action.old_shares, action.new_shares)
        if identity in action_ids:
            raise DividendResearchValidationError("Corporate actions must be unique.")
        action_ids.add(identity)
    return result



