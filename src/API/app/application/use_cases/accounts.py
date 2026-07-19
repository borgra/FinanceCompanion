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


class UpdateAccountsBatch:
    def __init__(self, repository: AccountRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, accounts: list[Account]) -> list[Account]:
        if len(accounts) > 100:
            raise ValueError("A maximum of 100 accounts can be saved at once.")
        requested_ids = [account.id for account in accounts]
        if len(requested_ids) != len(set(requested_ids)):
            raise ValueError("Each account may appear only once.")
        existing_ids = {account.id for account in self._repository.list_for_user(user_id)}
        if any(account_id not in existing_ids for account_id in requested_ids):
            from app.domain.exceptions import NotFoundError
            raise NotFoundError("Account not found.")
        return self._repository.update_batch_for_user(user_id, accounts)

class DeleteAccount:
    def __init__(self, repository: AccountRepository) -> None:
        self._repository = repository

    def execute(self, user_id: str, account_id: str) -> None:
        self._repository.delete_for_user(user_id, account_id)

