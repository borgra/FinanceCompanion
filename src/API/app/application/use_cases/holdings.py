from dataclasses import replace

from app.application.dividend_payouts import merge_dividend_payouts
from app.domain.exceptions import NotFoundError, ValidationError
from app.domain.models import Holding, HoldingAccountPosition, SecurityMetadata, SecurityPayoutDetails
from app.domain.models.security_metadata import is_cash_security, normalize_security_metadata
from app.domain.protocols import HoldingRepository
from app.infrastructure.in_memory_repositories import now_iso


def _security_from_client(incoming: SecurityMetadata, current: SecurityMetadata | None = None) -> SecurityMetadata:
    """Only the research refresh path may assert a quote's origin and freshness."""
    incoming = normalize_security_metadata(incoming)
    same_quote = current is not None and incoming.price == current.price and all(
        getattr(incoming, field).strip().casefold() == getattr(current, field).strip().casefold()
        for field in ("symbol", "exchange", "asset_type", "currency")
    )
    return replace(
        incoming,
        price_as_of=current.price_as_of if same_quote else None,
        price_source_url=current.price_source_url if same_quote else None,
        price_basis=current.price_basis if same_quote else None,
        details_updated_at=current.details_updated_at if same_quote else None,
        details_status=current.details_status if same_quote else ("manual" if incoming.price is not None else None),
    )


class ListHoldings:
    def __init__(self, repository: HoldingRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str) -> list[Holding]:
        return self._repository.list_for_user(user_id)


class CreateHolding:
    def __init__(self, repository: HoldingRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, holding: Holding) -> Holding:
        holding = replace(holding, security=_security_from_client(holding.security))
        existing = next(
            (
                item
                for item in self._repository.list_for_user(user_id)
                if item.security.symbol.casefold() == holding.security.symbol.casefold()
            ),
            None,
        )
        if existing is not None:
            positions_by_account = {
                position.account_id: position
                for position in existing.account_positions
            }
            merged_positions = list(existing.account_positions)
            for position in holding.account_positions:
                if position.account_id not in positions_by_account:
                    merged_positions.append(position)

            updated = replace(
                existing,
                account_positions=merged_positions,
                updated_at=now_iso(),
            )
            return self._repository.update_for_user(user_id, existing.id, updated)

        return self._repository.create_for_user(user_id, holding)


class UpdateHolding:
    def __init__(self, repository: HoldingRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, holding_id: str, holding: Holding) -> Holding:
        existing = next((item for item in self._repository.list_for_user(user_id) if item.id == holding_id), None)
        if existing is None:
            raise NotFoundError("Holding not found.")
        holding = replace(holding, security=_security_from_client(holding.security, existing.security))
        return self._repository.update_for_user(user_id, holding_id, holding)


class UpdateHoldingsBatch:
    def __init__(self, repository: HoldingRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, holdings: list[Holding]) -> list[Holding]:
        if len(holdings) > 100:
            raise ValueError("A maximum of 100 holdings can be saved at once.")
        existing = {item.id: item for item in self._repository.list_for_user(user_id)}
        requested_ids = [item.id for item in holdings]
        if len(requested_ids) != len(set(requested_ids)):
            raise ValueError("Each holding may appear only once.")
        if any(item_id not in existing for item_id in requested_ids):
            raise NotFoundError("Holding not found.")
        holdings = [
            replace(holding, security=_security_from_client(holding.security, existing[holding.id].security))
            for holding in holdings
        ]
        return self._repository.update_batch_for_user(user_id, holdings)

class ImportHoldingDetails:
    def __init__(self, repository: HoldingRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, rows: list[tuple[str, str, float, list[HoldingAccountPosition], bool, float | None]]) -> tuple[list[Holding], list[str]]:
        holdings_by_symbol = {holding.security.symbol.casefold(): holding for holding in self._repository.list_for_user(user_id)}
        updated: list[Holding] = []
        unmatched: list[str] = []
        timestamp = now_iso()
        for symbol, name, price, account_positions, has_dividend_growth_rate, dividend_growth_rate in rows:
            holding = holdings_by_symbol.get(symbol.casefold())
            if holding is None:
                unmatched.append(symbol)
                continue
            updates_by_account_id = {
                position.account_id: position for position in account_positions
            }
            existing_account_ids = {
                position.account_id for position in holding.account_positions
            }
            merged_positions = [
                HoldingAccountPosition(
                    account_id=existing.account_id,
                    quantity=updates_by_account_id[existing.account_id].quantity,
                    cost_basis=(
                        existing.cost_basis
                        if updates_by_account_id[existing.account_id].cost_basis is None
                        else updates_by_account_id[existing.account_id].cost_basis
                    ),
                )
                if existing.account_id in updates_by_account_id
                else existing
                for existing in holding.account_positions
            ]
            merged_positions.extend(
                position
                for position in account_positions
                if position.account_id not in existing_account_ids
            )
            if is_cash_security(holding.security):
                if holding.account_positions == merged_positions:
                    updated.append(holding)
                    continue
                updated.append(self._repository.update_for_user(
                    user_id,
                    holding.id,
                    replace(holding, account_positions=merged_positions),
                ))
                continue
            if (
                holding.security.name == name
                and holding.security.price == price
                and holding.account_positions == merged_positions
                and (not has_dividend_growth_rate or holding.security.dividend_growth_rate == dividend_growth_rate)
            ):
                updated.append(holding)
                continue
            refreshed = replace(
                holding,
                security=replace(holding.security, name=name, price=price, dividend_growth_rate=dividend_growth_rate if has_dividend_growth_rate else holding.security.dividend_growth_rate, details_updated_at=timestamp, details_status="manual", price_as_of=None, price_source_url=None, price_basis=None),
                account_positions=merged_positions,
                updated_at=timestamp,
            )
            updated.append(self._repository.update_for_user(user_id, holding.id, refreshed))
        return updated, unmatched

class DeleteHolding:
    def __init__(self, repository: HoldingRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, holding_id: str) -> None:
        self._repository.delete_for_user(user_id, holding_id)


class UpdateManualPayoutDetails:
    def __init__(self, repository: HoldingRepository) -> None:
        self._repository = repository

    def execute(
        self,
        user_id: str,
        holding_id: str,
        manual_payout_details: list[SecurityPayoutDetails],
    ) -> Holding:
        holding = next(
            (item for item in self._repository.list_for_user(user_id) if item.id == holding_id),
            None,
        )
        if holding is None:
            raise NotFoundError("Holding not found.")
        if is_cash_security(holding.security):
            raise ValidationError("Cash holdings do not support payment data.")

        manual_payouts = [
            replace(payout, mode="manual")
            for payout in manual_payout_details
        ]
        timestamp = now_iso()
        updated = replace(
            holding,
            security=replace(
                holding.security,
                payout_details=merge_dividend_payouts(
                    holding.security.source_payout_details,
                    manual_payouts,
                ),
                manual_payout_details=manual_payouts,
            ),
            updated_at=timestamp,
        )
        return self._repository.update_for_user(user_id, holding_id, updated)

class ImportManualPayoutDetails:
    def __init__(self, repository: HoldingRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, payouts_by_symbol: dict[str, list[SecurityPayoutDetails]]) -> tuple[list[Holding], list[str]]:
        holdings_by_symbol = {holding.security.symbol.casefold(): holding for holding in self._repository.list_for_user(user_id)}
        for symbol in payouts_by_symbol:
            holding = holdings_by_symbol.get(symbol.casefold())
            if holding is not None and is_cash_security(holding.security):
                raise ValidationError("Cash holdings do not support payment data.")
        timestamp = now_iso()
        updated: list[Holding] = []
        unmatched: list[str] = []
        for symbol, payouts in payouts_by_symbol.items():
            holding = holdings_by_symbol.get(symbol.casefold())
            if holding is None:
                unmatched.append(symbol.upper())
                continue
            manual_payouts = [replace(payout, mode="manual") for payout in payouts]
            refreshed = replace(
                holding,
                security=replace(
                    holding.security,
                    payout_details=merge_dividend_payouts(
                        holding.security.source_payout_details,
                        manual_payouts,
                    ),
                    manual_payout_details=manual_payouts,
                ),
                updated_at=timestamp,
            )
            updated.append(self._repository.update_for_user(user_id, holding.id, refreshed))
        return updated, unmatched

def _clear_holding_payment_data(holding: Holding, timestamp: str, *, preserve_growth_rate: bool) -> Holding:
    return replace(
        holding,
        security=replace(
            holding.security,
            payout_details=[],
            source_payout_details=[],
            manual_payout_details=[],
            payout_audit_details=[],
            dividend_research_snapshot={},
            dividend_research_retrieved_at=None,
            dividend_research_provider=None,
            dividend_research_source_url=None,
            dividend_research_authoritative=None,
            dividend_research_schema_version=None,
            dividend_research_adjustment_basis=None,
            dividend_research_warnings=[],
            dividend_research_as_of=None,
            dividend_research_status=None,
            dividend_research_history_start=None,
            dividend_research_forecast_end=None,
            dividend_research_snapshot_id=None,
            dividend_research_cache_key=None,
            dividend_previous_year=None,
            dividend_current_year=None,
            dividend_growth_rate=holding.security.dividend_growth_rate if preserve_growth_rate else None,
            estimated_future_payout=None,
            dividend_status=None,
        ),
        updated_at=timestamp,
    )


class RemoveHoldingPaymentData:
    def __init__(self, repository: HoldingRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, holding_id: str) -> Holding:
        holding = next((item for item in self._repository.list_for_user(user_id) if item.id == holding_id), None)
        if holding is None:
            raise NotFoundError("Holding not found.")
        if is_cash_security(holding.security):
            return holding
        cleared = _clear_holding_payment_data(holding, now_iso(), preserve_growth_rate=True)
        return self._repository.update_for_user(user_id, holding_id, cleared)


class PurgeHoldingPaymentData:
    def __init__(self, repository: HoldingRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str) -> list[Holding]:
        timestamp = now_iso()
        updated: list[Holding] = []
        for holding in self._repository.list_for_user(user_id):
            if is_cash_security(holding.security):
                updated.append(holding)
                continue
            refreshed = _clear_holding_payment_data(holding, timestamp, preserve_growth_rate=False)
            updated.append(self._repository.update_for_user(user_id, holding.id, refreshed))
        return updated

