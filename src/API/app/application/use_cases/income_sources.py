from app.domain.models import IncomeSource
from app.domain.protocols import IncomeSourceRepository


class ListIncomeSources:
    def __init__(self, repository: IncomeSourceRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str) -> list[IncomeSource]:
        return self._repository.list_for_user(user_id)


class CreateIncomeSource:
    def __init__(self, repository: IncomeSourceRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, source: IncomeSource) -> IncomeSource:
        return self._repository.create_for_user(user_id, source)


class UpdateIncomeSource:
    def __init__(self, repository: IncomeSourceRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, source_id: str, source: IncomeSource) -> IncomeSource:
        return self._repository.update_for_user(user_id, source_id, source)


class SetIncomeSourceStatus:
    def __init__(self, repository: IncomeSourceRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, source_id: str, status: str) -> IncomeSource:
        return self._repository.set_status_for_user(user_id, source_id, status)
