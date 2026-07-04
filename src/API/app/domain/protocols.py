from __future__ import annotations

from typing import Protocol

from app.domain.models import (
    Account,
    BudgetCategory,
    BudgetSubCategory,
    IncomeSource,
    SessionUser,
    User,
    VerifiedIdentity,
)


class UserRepository(Protocol):
    def get_by_email(self, email: str) -> User | None: ...

    def get_by_id(self, user_id: str) -> User | None: ...

    def update_identity_profile(
        self,
        user_id: str,
        *,
        subject: str,
        object_id: str,
        tenant_id: str,
        picture_url: str | None,
    ) -> User: ...


class IncomeSourceRepository(Protocol):
    def list_for_user(self, user_id: str) -> list[IncomeSource]: ...

    def create_for_user(self, user_id: str, source: IncomeSource) -> IncomeSource: ...

    def update_for_user(self, user_id: str, source_id: str, source: IncomeSource) -> IncomeSource: ...

    def set_status_for_user(self, user_id: str, source_id: str, status: str) -> IncomeSource: ...


class BudgetRepository(Protocol):
    def list_categories_for_user(self, user_id: str) -> list[BudgetCategory]: ...

    def create_category_for_user(self, user_id: str, category: BudgetCategory) -> BudgetCategory: ...

    def update_category_for_user(self, user_id: str, category_id: str, name: str, color_hex: str) -> BudgetCategory: ...

    def delete_category_for_user(self, user_id: str, category_id: str) -> None: ...

    def create_sub_category_for_user(self, user_id: str, sub_category: BudgetSubCategory) -> BudgetSubCategory: ...

    def update_sub_category_for_user(self, user_id: str, sub_category_id: str, name: str, monthly_amount_usd: int) -> BudgetSubCategory: ...

    def delete_sub_category_for_user(self, user_id: str, sub_category_id: str) -> None: ...


class AccountRepository(Protocol):
    def list_for_user(self, user_id: str) -> list[Account]: ...

    def create_for_user(self, user_id: str, account: Account) -> Account: ...

    def update_for_user(self, user_id: str, account_id: str, account: Account) -> Account: ...

    def delete_for_user(self, user_id: str, account_id: str) -> None: ...


class IdentityTokenVerifier(Protocol):
    def verify(self, token: str, client_id: str | None, tenant_id: str | None) -> VerifiedIdentity: ...


class SessionTokenService(Protocol):
    def issue(self, user: User) -> str: ...

    def parse(self, token: str) -> SessionUser: ...
