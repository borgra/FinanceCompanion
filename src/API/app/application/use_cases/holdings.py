from dataclasses import replace

from app.domain.exceptions import NotFoundError
from app.domain.models import Holding, HoldingAccountPosition, SecurityPayoutDetails
from app.domain.protocols import HoldingRepository
from app.infrastructure.in_memory_repositories import now_iso


class ListHoldings:
    def __init__(self, repository: HoldingRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str) -> list[Holding]:
        return self._repository.list_for_user(user_id)


class CreateHolding:
    def __init__(self, repository: HoldingRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, holding: Holding) -> Holding:
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
        return self._repository.update_for_user(user_id, holding_id, holding)


class ImportHoldingDetails:
    def __init__(self, repository: HoldingRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, rows: list[tuple[str, str, float, list[HoldingAccountPosition]]]) -> tuple[list[Holding], list[str]]:
        holdings_by_symbol = {holding.security.symbol.casefold(): holding for holding in self._repository.list_for_user(user_id)}
        updated: list[Holding] = []
        unmatched: list[str] = []
        timestamp = now_iso()
        for symbol, name, price, account_positions in rows:
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
            if (
                holding.security.name == name
                and holding.security.price == price
                and holding.account_positions == merged_positions
            ):
                updated.append(holding)
                continue
            refreshed = replace(
                holding,
                security=replace(holding.security, name=name, price=price, details_updated_at=timestamp, details_status="manual"),
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

        manual_payouts = [
            replace(payout, mode="manual")
            for payout in manual_payout_details
        ]
        timestamp = now_iso()
        updated = replace(
            holding,
            security=replace(
                holding.security,
                payout_details=manual_payouts or holding.security.source_payout_details,
                manual_payout_details=manual_payouts,
            ),
            updated_at=timestamp,
        )
        return self._repository.update_for_user(user_id, holding_id, updated)
