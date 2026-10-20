from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from urllib.parse import urlsplit
import calendar


@dataclass(frozen=True, slots=True)
class DividendResearchRequest:
    symbol: str
    exchange: str
    currency: str
    retrieval_start: date
    retrieval_end: date
    schema_version: int = 1
    asset_type: str = "ETF"

    @property
    def security_id(self) -> str:
        return f"{self.exchange.strip().upper()}:{self.symbol.strip().upper()}"

    @property
    def history_start(self) -> date:
        return subtract_months(self.retrieval_end, 24)

    @property
    def forecast_end(self) -> date:
        return date(self.retrieval_end.year + 1, 12, 31)


def subtract_months(value: date, months: int) -> date:
    month_index = value.year * 12 + value.month - 1 - months
    year, month = divmod(month_index, 12)
    return date(year, month + 1, min(value.day, calendar.monthrange(year, month + 1)[1]))


@dataclass(frozen=True, slots=True)
class DividendResearchPayment:
    ex_dividend_date: str
    amount_per_share: float | str
    status: str
    payment_date: str | None = None
    declaration_date: str | None = None
    record_date: str | None = None
    source_url: str | None = None
    currency: str | None = None
    distribution_type: str = "income"
    is_regular: bool = True
    share_basis: str | None = None
    evidence_ref: str | None = None
    source_authority: str = "secondary"
    regularity_basis: str | None = None


@dataclass(frozen=True, slots=True)
class DividendResearchAction:
    effective_date: str
    type: str
    old_shares: float
    new_shares: float
    source_url: str | None = None
    evidence_ref: str | None = None


@dataclass(frozen=True, slots=True)
class DividendResearchProvenance:
    provider: str
    source_url: str | None
    authoritative: bool
    model: str | None = None
    prompt_version: str | None = None
    snapshot_id: str | None = None


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
    exchange: str | None = None
    status: str = "fresh"
    resolved_exchange: str | None = None
    evidence_snapshot: dict | None = None


class DividendResearchValidationError(ValueError):
    pass


class DividendResearchProviderError(RuntimeError):
    """Safe, user-displayable provider error without credentials or page contents."""


def exact_amount(value: float | str | Decimal) -> Decimal:
    try:
        amount = Decimal(str(value))
        if not amount.is_finite() or amount <= 0 or amount > Decimal("1000000000"):
            raise ValueError
        return amount
    except (InvalidOperation, ValueError) as exc:
        raise DividendResearchValidationError("Dividend amounts must be finite and positive.") from exc


def evidence_url(value: str | None) -> bool:
    if not value:
        return False
    url = urlsplit(value)
    return bool(url.scheme == "https" and url.hostname and not url.username and not url.password)


def validate_dividend_research_result(result: DividendResearchResult, request: DividendResearchRequest) -> DividendResearchResult:
    if result.schema_version not in {1, 2} or result.schema_version != request.schema_version:
        raise DividendResearchValidationError("Unsupported dividend research schema version.")
    if result.symbol.strip().upper() != request.symbol.strip().upper():
        raise DividendResearchValidationError("Dividend research symbol does not match the holding.")
    if result.schema_version == 2 and (result.exchange or "").strip().casefold() != request.exchange.strip().casefold():
        raise DividendResearchValidationError("Dividend research exchange does not match the holding.")
    if result.status not in {"fresh", "partial", "unavailable", "unsupported"}:
        raise DividendResearchValidationError("Dividend research status is invalid.")
    try:
        retrieved_at = datetime.fromisoformat(result.retrieved_at.replace("Z", "+00:00"))
        if retrieved_at.tzinfo is None:
            raise ValueError
    except ValueError as exc:
        raise DividendResearchValidationError("Dividend research retrievedAt must be an ISO timestamp.") from exc
    if result.adjustment_basis not in {"raw", "current_share_basis"}:
        raise DividendResearchValidationError("Dividend research adjustmentBasis is invalid.")
    if not result.provenance.provider.strip() or (result.status not in {"unsupported", "unavailable"} and not evidence_url(result.provenance.source_url)):
        raise DividendResearchValidationError("Dividend research provenance is incomplete.")
    payment_ids: set[tuple] = set()
    for payment in result.payments:
        try:
            ex_date = date.fromisoformat(payment.ex_dividend_date)
            if not request.retrieval_start <= ex_date <= request.retrieval_end and not (
                payment.status == "announced" and request.retrieval_end < ex_date <= request.forecast_end
            ):
                raise ValueError
            for value in (payment.payment_date, payment.declaration_date, payment.record_date):
                if value is not None:
                    date.fromisoformat(value)
            if payment.payment_date and payment.payment_date < payment.ex_dividend_date:
                raise ValueError
            if payment.record_date and payment.record_date < payment.ex_dividend_date:
                raise ValueError
            if payment.declaration_date and payment.declaration_date > payment.ex_dividend_date:
                raise ValueError
        except ValueError as exc:
            raise DividendResearchValidationError("Dividend research contains an invalid payment date.") from exc
        if payment.status not in {"completed", "announced"}:
            raise DividendResearchValidationError("Dividend payment status is invalid.")
        if payment.status == "completed" and ex_date > request.retrieval_end:
            raise DividendResearchValidationError("Future distributions cannot be completed.")
        if payment.status == "completed" and payment.payment_date and payment.payment_date > request.retrieval_end.isoformat():
            raise DividendResearchValidationError("Unpaid future payments cannot be completed.")
        exact_amount(payment.amount_per_share)
        if not evidence_url(payment.source_url or result.provenance.source_url):
            raise DividendResearchValidationError("Dividend payment provenance is incomplete.")
        if payment.currency is not None and payment.currency != request.currency:
            raise DividendResearchValidationError("Distribution currency does not match the security.")
        if payment.distribution_type not in {"income", "capital_gain", "return_of_capital", "other"}:
            raise DividendResearchValidationError("Distribution type is invalid.")
        if payment.share_basis not in {None, "raw", "current_share_basis", "unverified", f"as_of:{request.retrieval_end.isoformat()}"}:
            raise DividendResearchValidationError("Unsupported source share basis.")
        if result.schema_version == 2 and not payment.evidence_ref:
            raise DividendResearchValidationError("Distribution evidence is required.")
        if payment.source_authority not in {"issuer", "regulatory", "exchange", "secondary", "stub"}:
            raise DividendResearchValidationError("Source authority is invalid.")
        identity = (payment.ex_dividend_date, payment.payment_date, payment.distribution_type, payment.is_regular, payment.source_url)
        if identity in payment_ids:
            raise DividendResearchValidationError("Dividend payments must be unique.")
        payment_ids.add(identity)
    action_ids: set[tuple[str, str, float, float]] = set()
    for action in result.corporate_actions:
        if result.schema_version == 2 and (not action.evidence_ref or not evidence_url(action.source_url)):
            raise DividendResearchValidationError("Corporate action evidence is required.")
        try:
            action_date = date.fromisoformat(action.effective_date)
            if action_date > request.forecast_end or action_date < request.retrieval_start:
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



