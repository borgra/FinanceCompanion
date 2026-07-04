from app.domain.models import Account
from app.domain.protocols import AccountRepository


class ListAccounts:
    def __init__(self, repository: AccountRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str) -> list[Account]:
        return self._repository.list_for_user(user_id)


class CreateAccount:
    def __init__(self, repository: AccountRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, account: Account) -> Account:
        return self._repository.create_for_user(user_id, account)


class UpdateAccount:
    def __init__(self, repository: AccountRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, account_id: str, account: Account) -> Account:
        return self._repository.update_for_user(user_id, account_id, account)


class DeleteAccount:
    def __init__(self, repository: AccountRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, account_id: str) -> None:
        self._repository.delete_for_user(user_id, account_id)
