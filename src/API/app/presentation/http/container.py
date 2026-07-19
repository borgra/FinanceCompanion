from dataclasses import dataclass

from app.application.use_cases.accounts import CreateAccount, DeleteAccount, ListAccounts, UpdateAccount, UpdateAccountsBatch
from app.application.use_cases.auth import AuthenticateIdentityUser, GetCurrentUser
from app.application.use_cases.budgets import (
    CreateBudgetCategory,
    CreateBudgetSubCategory,
    DeleteBudgetCategory,
    DeleteBudgetSubCategory,
    ListBudgetCategories,
    UpdateBudgetCategory,
    SaveBudgetCategoryDraft,
    UpdateBudgetSubCategory,
)
from app.application.use_cases.net_worth import GetNetWorth, PutNetWorth
from app.application.use_cases.income_sources import (
    CreateIncomeSource,
    ListIncomeSources,
    SetIncomeSourceStatus,
    UpdateIncomeSource,
)
from app.application.use_cases.holdings import (
    CreateHolding,
    DeleteHolding,
    ImportHoldingDetails,
    ImportManualPayoutDetails,
    PurgeHoldingPaymentData,
    ListHoldings,
    UpdateHolding,
    UpdateHoldingsBatch,
    UpdateManualPayoutDetails,
)
from app.application.use_cases.security_details import (
    RefreshHeldSecurityDetails,
    RefreshHoldingSecurityDetails,
)
from app.application.use_cases.security_search import SearchSecurities
from app.domain.protocols import IdentityTokenVerifier
from app.infrastructure.entra_identity import EntraIdentityTokenVerifier
from app.infrastructure.in_memory_repositories import (
    InMemoryAccountRepository,
    InMemoryBudgetRepository,
    InMemoryDataStore,
    InMemoryHoldingRepository,
    InMemoryIncomeSourceRepository,
    InMemoryNetWorthRepository,
    InMemoryUserRepository,
)
from app.infrastructure.alpha_vantage_security_details import AlphaVantageSecurityDetailsProvider
from app.infrastructure.alpha_vantage_security_search import AlphaVantageSecuritySearchProvider
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
    save_budget_category_draft: SaveBudgetCategoryDraft
    delete_budget_category: DeleteBudgetCategory
    create_budget_sub_category: CreateBudgetSubCategory
    update_budget_sub_category: UpdateBudgetSubCategory
    delete_budget_sub_category: DeleteBudgetSubCategory
    list_accounts: ListAccounts
    create_account: CreateAccount
    update_account: UpdateAccount
    update_accounts_batch: UpdateAccountsBatch
    delete_account: DeleteAccount
    get_net_worth: GetNetWorth
    put_net_worth: PutNetWorth
    list_holdings: ListHoldings
    create_holding: CreateHolding
    update_holding: UpdateHolding
    update_holdings_batch: UpdateHoldingsBatch
    import_holding_details: ImportHoldingDetails
    import_manual_payout_details: ImportManualPayoutDetails
    purge_holding_payment_data: PurgeHoldingPaymentData
    delete_holding: DeleteHolding
    update_manual_payout_details: UpdateManualPayoutDetails
    search_securities: SearchSecurities
    refresh_holding_security_details: RefreshHoldingSecurityDetails
    refresh_held_security_details: RefreshHeldSecurityDetails
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
            CosmosHoldingRepository,
            CosmosIncomeSourceRepository,
            CosmosNetWorthRepository,
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
        holdings = CosmosHoldingRepository(client)
        net_worth = CosmosNetWorthRepository(client)
    else:
        store = InMemoryDataStore(allowed_email=settings.allowed_email)
        users = InMemoryUserRepository(store)
        income_sources = InMemoryIncomeSourceRepository(store)
        budgets = InMemoryBudgetRepository(store)
        accounts = InMemoryAccountRepository(store)
        holdings = InMemoryHoldingRepository(store)
        net_worth = InMemoryNetWorthRepository(store)

    verifier = verifier or EntraIdentityTokenVerifier()
    session_tokens = JwtSessionTokenService(
        secret=settings.session_secret,
        expiration_seconds=settings.session_expiration_seconds,
        issuer=settings.session_issuer,
        audience=settings.session_audience,
    )
    security_details = AlphaVantageSecurityDetailsProvider(settings.alpha_vantage_api_key)

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
        save_budget_category_draft=SaveBudgetCategoryDraft(budgets),
        delete_budget_category=DeleteBudgetCategory(budgets),
        create_budget_sub_category=CreateBudgetSubCategory(budgets),
        update_budget_sub_category=UpdateBudgetSubCategory(budgets),
        delete_budget_sub_category=DeleteBudgetSubCategory(budgets),
        list_accounts=ListAccounts(accounts),
        create_account=CreateAccount(accounts),
        update_account=UpdateAccount(accounts),
        update_accounts_batch=UpdateAccountsBatch(accounts),
        delete_account=DeleteAccount(accounts),
        get_net_worth=GetNetWorth(net_worth),
        put_net_worth=PutNetWorth(net_worth),
        list_holdings=ListHoldings(holdings),
        create_holding=CreateHolding(holdings),
        update_holding=UpdateHolding(holdings),
        update_holdings_batch=UpdateHoldingsBatch(holdings),
        import_holding_details=ImportHoldingDetails(holdings),
        import_manual_payout_details=ImportManualPayoutDetails(holdings),
        purge_holding_payment_data=PurgeHoldingPaymentData(holdings),
        delete_holding=DeleteHolding(holdings),
        update_manual_payout_details=UpdateManualPayoutDetails(holdings),
        search_securities=SearchSecurities(
            AlphaVantageSecuritySearchProvider(settings.alpha_vantage_api_key)
        ),
        refresh_holding_security_details=RefreshHoldingSecurityDetails(
            holdings,
            security_details,
        ),
        refresh_held_security_details=RefreshHeldSecurityDetails(
            holdings,
            security_details,
        ),
        session_tokens=session_tokens,
    )



