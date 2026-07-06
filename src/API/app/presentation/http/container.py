from dataclasses import dataclass

from app.application.use_cases.accounts import CreateAccount, DeleteAccount, ListAccounts, UpdateAccount
from app.application.use_cases.auth import AuthenticateIdentityUser, GetCurrentUser
from app.application.use_cases.budgets import (
    CreateBudgetCategory,
    CreateBudgetSubCategory,
    DeleteBudgetCategory,
    DeleteBudgetSubCategory,
    ListBudgetCategories,
    UpdateBudgetCategory,
    UpdateBudgetSubCategory,
)
from app.application.use_cases.income_sources import (
    CreateIncomeSource,
    ListIncomeSources,
    SetIncomeSourceStatus,
    UpdateIncomeSource,
)
from app.domain.protocols import IdentityTokenVerifier
from app.infrastructure.entra_identity import EntraIdentityTokenVerifier
from app.infrastructure.in_memory_repositories import (
    InMemoryAccountRepository,
    InMemoryBudgetRepository,
    InMemoryDataStore,
    InMemoryIncomeSourceRepository,
    InMemoryUserRepository,
)
from app.infrastructure.security import JwtSessionTokenService
from app.infrastructure.settings import Settings


@dataclass(slots=True)
class Container:
    settings: Settings
    authenticate_identity_user: AuthenticateIdentityUser
    get_current_user: GetCurrentUser
    list_income_sources: ListIncomeSources
    create_income_source: CreateIncomeSource
    update_income_source: UpdateIncomeSource
    set_income_source_status: SetIncomeSourceStatus
    list_budget_categories: ListBudgetCategories
    create_budget_category: CreateBudgetCategory
    update_budget_category: UpdateBudgetCategory
    delete_budget_category: DeleteBudgetCategory
    create_budget_sub_category: CreateBudgetSubCategory
    update_budget_sub_category: UpdateBudgetSubCategory
    delete_budget_sub_category: DeleteBudgetSubCategory
    list_accounts: ListAccounts
    create_account: CreateAccount
    update_account: UpdateAccount
    delete_account: DeleteAccount
    session_tokens: JwtSessionTokenService


def build_container(
    settings: Settings,
    verifier: IdentityTokenVerifier | None = None,
) -> Container:
    if settings.cosmos_table_connection_string:
        from azure.core.exceptions import ResourceExistsError
        from azure.data.tables import TableClient

        from app.infrastructure.cosmos_repositories import (
            CosmosAccountRepository,
            CosmosBudgetRepository,
            CosmosIncomeSourceRepository,
            CosmosUserRepository,
        )

        client = TableClient.from_connection_string(
            settings.cosmos_table_connection_string,
            settings.cosmos_table_name,
        )
        try:
            client.create_table()
        except ResourceExistsError:
            pass

        users = CosmosUserRepository(client)
        income_sources = CosmosIncomeSourceRepository(client)
        budgets = CosmosBudgetRepository(client)
        accounts = CosmosAccountRepository(client)
    else:
        store = InMemoryDataStore(allowed_email=settings.allowed_email)
        users = InMemoryUserRepository(store)
        income_sources = InMemoryIncomeSourceRepository(store)
        budgets = InMemoryBudgetRepository(store)
        accounts = InMemoryAccountRepository(store)

    verifier = verifier or EntraIdentityTokenVerifier()
    session_tokens = JwtSessionTokenService(
        secret=settings.session_secret,
        expiration_seconds=settings.session_expiration_seconds,
        issuer=settings.session_issuer,
        audience=settings.session_audience,
    )

    return Container(
        settings=settings,
        authenticate_identity_user=AuthenticateIdentityUser(
            verifier=verifier,
            users=users,
            sessions=session_tokens,
            allowed_email=settings.allowed_email,
        ),
        get_current_user=GetCurrentUser(users),
        list_income_sources=ListIncomeSources(income_sources),
        create_income_source=CreateIncomeSource(income_sources),
        update_income_source=UpdateIncomeSource(income_sources),
        set_income_source_status=SetIncomeSourceStatus(income_sources),
        list_budget_categories=ListBudgetCategories(budgets),
        create_budget_category=CreateBudgetCategory(budgets),
        update_budget_category=UpdateBudgetCategory(budgets),
        delete_budget_category=DeleteBudgetCategory(budgets),
        create_budget_sub_category=CreateBudgetSubCategory(budgets),
        update_budget_sub_category=UpdateBudgetSubCategory(budgets),
        delete_budget_sub_category=DeleteBudgetSubCategory(budgets),
        list_accounts=ListAccounts(accounts),
        create_account=CreateAccount(accounts),
        update_account=UpdateAccount(accounts),
        delete_account=DeleteAccount(accounts),
        session_tokens=session_tokens,
    )
