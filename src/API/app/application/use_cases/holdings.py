from dataclasses import replace

from app.domain.models import Holding
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
