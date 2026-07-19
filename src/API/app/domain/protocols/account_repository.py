from __future__ import annotations

from typing import Protocol

from app.domain.models import Account


class AccountRepository(Protocol):
    def list_for_user(self, user_id: str) -> list[Account]: ...

    def create_for_user(self, user_id: str, account: Account) -> Account: ...

    def update_for_user(self, user_id: str, account_id: str, account: Account) -> Account: ...

    def update_batch_for_user(self, user_id: str, accounts: list[Account]) -> list[Account]: ...

    def delete_for_user(self, user_id: str, account_id: str) -> None: ...

