from __future__ import annotations

from dataclasses import replace
from datetime import date

from app.application.dividend_payouts import merge_dividend_payouts
from app.domain.dividend_research import DividendResearchRequest, validate_dividend_research_result
from app.domain.exceptions import NotFoundError
from app.domain.models import CorporateAction, Holding, SecurityPayoutDetails
from app.domain.models.security_metadata import is_cash_security
from app.domain.protocols import DividendResearchProvider, HoldingRepository
from app.infrastructure.in_memory_repositories import now_iso


class RefreshHoldingDividends:
    def __init__(self, repository: HoldingRepository, provider: DividendResearchProvider) -> None:
        self._repository = repository
        self._provider = provider

    def execute(self, user_id: str, holding_id: str) -> Holding:
        holdings = self._repository.list_for_user(user_id)
        holding = next((item for item in holdings if item.id == holding_id), None)
        if holding is None:
            raise NotFoundError("Holding not found.")
        if is_cash_security(holding.security):
            return holding
        today = date.today()
        request = DividendResearchRequest(
            symbol=holding.security.symbol, exchange=holding.security.exchange,
            currency=holding.security.currency,
            retrieval_start=date(today.year - 2, 1, 1), retrieval_end=today,
        )
        result = validate_dividend_research_result(self._provider.research(request), request)
        actions = [
            CorporateAction(
                id=f"research-action-{index + 1}-{action.effective_date}",
                effective_date=action.effective_date,
                type=action.type,
                old_shares=action.old_shares,
                new_shares=action.new_shares,
            )
            for index, action in enumerate(result.corporate_actions)
        ]
        source_payouts: list[SecurityPayoutDetails] = []
        for payment in result.payments:
            amount = payment.amount_per_share
            if result.adjustment_basis == "raw":
                for action in sorted(actions, key=lambda item: item.effective_date):
                    if action.effective_date > payment.ex_dividend_date:
                        amount *= action.old_shares / action.new_shares
            source_payouts.append(SecurityPayoutDetails(
                ex_dividend_date=payment.ex_dividend_date, amount=amount,
                declaration_date=payment.declaration_date, record_date=payment.record_date,
                payment_date=payment.payment_date, source=result.provenance.provider,
                source_url=payment.source_url or result.provenance.source_url,
                status=payment.status, mode="source",
            ))
        timestamp = now_iso()
        changed: list[Holding] = []
        for item in holdings:
            if item.security.symbol.casefold() != holding.security.symbol.casefold():
                continue
            manual = [
                replace(payout, mode="manual", status="completed")
                for payout in item.security.manual_payout_details
            ]
            security = replace(
                item.security,
                payout_details=merge_dividend_payouts(source_payouts, manual),
                source_payout_details=source_payouts,
                manual_payout_details=manual,
                corporate_actions=actions,
                dividend_research_retrieved_at=result.retrieved_at,
                dividend_research_provider=result.provenance.provider,
                dividend_research_source_url=result.provenance.source_url,
                dividend_research_authoritative=result.provenance.authoritative,
                dividend_research_schema_version=result.schema_version,
                dividend_research_adjustment_basis="current_share_basis",
                dividend_research_warnings=list(result.warnings),
                dividend_status="stub" if result.provenance.provider == "stub" else "researched",
            )
            changed.append(replace(item, security=security, updated_at=timestamp))

        persisted = self._repository.update_batch_for_user(user_id, changed)
        return next(item for item in persisted if item.id == holding_id)
