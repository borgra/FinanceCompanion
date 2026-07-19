from app.domain.models import NetWorth
from app.domain.protocols import NetWorthRepository


class GetNetWorth:
    def __init__(self, repository: NetWorthRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str) -> NetWorth | None:
        return self._repository.get_for_user(user_id)


class PutNetWorth:
    def __init__(self, repository: NetWorthRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, net_worth: NetWorth) -> NetWorth:
        return self._repository.put_for_user(user_id, net_worth)
