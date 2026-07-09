from app.domain.models import Holding
from app.domain.protocols import HoldingRepository


class ListHoldings:
    def __init__(self, repository: HoldingRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str) -> list[Holding]:
        return self._repository.list_for_user(user_id)


class CreateHolding:
    def __init__(self, repository: HoldingRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, holding: Holding) -> Holding:
        return self._repository.create_for_user(user_id, holding)


class UpdateHolding:
    def __init__(self, repository: HoldingRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, holding_id: str, holding: Holding) -> Holding:
        return self._repository.update_for_user(user_id, holding_id, holding)
