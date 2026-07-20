from __future__ import annotations

import uuid
from dataclasses import replace

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.domain.exceptions import AuthenticationError, DomainError, NotFoundError
from app.infrastructure.alpha_vantage_security_details import SecurityDetailsUnavailableError
from app.infrastructure.alpha_vantage_security_search import SecuritySearchUnavailableError
from app.domain.models import Account, BudgetCategory, BudgetSubCategory, NetWorth
from app.infrastructure.in_memory_repositories import now_iso
from app.presentation.http.dependencies import get_container, require_session_user
from app.presentation.http.mappers import (
    to_account,
    to_account_payload,
    to_budget_category_payload,
    to_budget_sub_category_payload,
    to_holding,
    to_holding_account_position,
    to_holding_payload,
    to_income_source,
    to_income_source_payload,
    to_security_details_refresh_result_payload,
    to_security_metadata_payload,
    to_security_payout_details,
    to_user_response,
)
from app.presentation.http.schemas import (
    AccountPayload,
    CorporateActionImportRequest,
    AccountBatchRequest,
    AccountUpsertRequest,
    AuthSessionResponse,
    AuthVerifyRequest,
    BudgetCategoryCreateRequest,
    BudgetCategoryPayload,
    BudgetCategoryUpdateRequest,
    BudgetCategoryDraftRequest,
    BudgetSubCategoryCreateRequest,
    BudgetSubCategoryPayload,
    BudgetSubCategoryUpdateRequest,
    HoldingCreateRequest,
    HoldingBatchRequest,
    HoldingImportRequest,
    HoldingImportResponse,
    HoldingManualPayoutsRequest,
    ManualPayoutImportRequest,
    InvestmentSnapshotPutRequest,
    InvestmentSnapshotsPutRequest,
    NetWorthPayload,
    NetWorthConfigurationPutRequest,
    MortgageSchedulePutRequest,
    NetWorthPutRequest,
    
    HoldingPayload,
    IncomeSourcePayload,
    IncomeSourceStatusRequest,
    IncomeSourceUpsertRequest,
    SecurityDetailsRefreshResultPayload,
    SecurityDetailsRefreshRequest,
    SecurityMetadataPayload,
    UserResponse,
)

router = APIRouter()


def _domain_error_to_http(exc: DomainError) -> HTTPException:
    if isinstance(exc, AuthenticationError):
        return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))
    if isinstance(exc, NotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


def _ensure_income_sources_are_unassigned(
    account: Account,
    existing_accounts: list[Account],
    *,
    current_account_id: str | None = None,
) -> None:
    assigned_source_ids = set(account.assigned_income_source_ids)
    if not assigned_source_ids:
        return

    for existing in existing_accounts:
        if existing.id == current_account_id:
            continue
        duplicated_source_ids = assigned_source_ids.intersection(existing.assigned_income_source_ids)
        if duplicated_source_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Income source is already assigned to another account.",
            )


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/auth/entra/verify", response_model=AuthSessionResponse)
def verify_entra_login(request: AuthVerifyRequest, response: Response, container=Depends(get_container)) -> AuthSessionResponse:
    try:
        access_token, user = container.authenticate_identity_user.execute(
            request.id_token,
            container.settings.entra_client_id,
            container.settings.entra_tenant_id,
        )
    except DomainError as exc:
        raise _domain_error_to_http(exc) from exc

    response.set_cookie(
        key=container.settings.session_cookie_name,
        value=access_token,
        httponly=True,
        secure=container.settings.session_cookie_secure,
        samesite=container.settings.session_cookie_samesite,
        max_age=container.settings.session_expiration_seconds,
        path="/",
    )
    return AuthSessionResponse(user=to_user_response(user))


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response, container=Depends(get_container)) -> Response:
    response.delete_cookie(
        key=container.settings.session_cookie_name,
        httponly=True,
        secure=container.settings.session_cookie_secure,
        samesite=container.settings.session_cookie_samesite,
        path="/",
    )
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/auth/session", response_model=UserResponse)
def get_session(user=Depends(require_session_user), container=Depends(get_container)) -> UserResponse:
    try:
        current_user = container.get_current_user.execute(user.user_id)
    except DomainError as exc:
        raise _domain_error_to_http(exc) from exc
    return to_user_response(current_user)


@router.get("/net-worth", response_model=NetWorthPayload)
def get_net_worth(user=Depends(require_session_user), container=Depends(get_container)) -> NetWorthPayload:
    value = container.get_net_worth.execute(user.user_id)
    if value is None: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Net worth has not been configured.")
    return _to_net_worth_payload(value)


def _to_net_worth_payload(value: NetWorth) -> NetWorthPayload:
    return NetWorthPayload(beginningNetWorth=value.beginning_net_worth, investmentSnapshots=value.investment_snapshots, trackMortgageInNetWorth=value.track_mortgage_in_net_worth, mortgageSchedule=value.mortgage_schedule, updatedAt=value.updated_at)


@router.put("/net-worth", response_model=NetWorthPayload)
def put_net_worth(request: NetWorthPutRequest, user=Depends(require_session_user), container=Depends(get_container)) -> NetWorthPayload:
    current = container.get_net_worth.execute(user.user_id)
    value = container.put_net_worth.execute(user.user_id, NetWorth(beginning_net_worth=request.beginning_net_worth, investment_snapshots=current.investment_snapshots if current else {}, updated_at=now_iso(), track_mortgage_in_net_worth=current.track_mortgage_in_net_worth if current else False, mortgage_schedule=current.mortgage_schedule if current else None))
    return _to_net_worth_payload(value)


@router.put("/net-worth/investment-snapshots", response_model=NetWorthPayload)
def put_investment_snapshots(request: InvestmentSnapshotsPutRequest, user=Depends(require_session_user), container=Depends(get_container)) -> NetWorthPayload:
    current = container.get_net_worth.execute(user.user_id) or NetWorth(beginning_net_worth=None, investment_snapshots={}, updated_at=now_iso())
    value = container.put_net_worth.execute(user.user_id, NetWorth(beginning_net_worth=current.beginning_net_worth, investment_snapshots=request.investment_snapshots, updated_at=now_iso(), track_mortgage_in_net_worth=current.track_mortgage_in_net_worth, mortgage_schedule=current.mortgage_schedule))
    return _to_net_worth_payload(value)


@router.put("/net-worth/investment-snapshots/{account_id}/{month}", response_model=NetWorthPayload)
def put_investment_snapshot(account_id: str, month: str, request: InvestmentSnapshotPutRequest, user=Depends(require_session_user), container=Depends(get_container)) -> NetWorthPayload:
    current = container.get_net_worth.execute(user.user_id) or NetWorth(beginning_net_worth=None, investment_snapshots={}, updated_at=now_iso())
    snapshots = {key: dict(values) for key, values in current.investment_snapshots.items()}; snapshots.setdefault(account_id, {})[month] = request.value
    value = container.put_net_worth.execute(user.user_id, NetWorth(beginning_net_worth=current.beginning_net_worth, investment_snapshots=snapshots, updated_at=now_iso(), track_mortgage_in_net_worth=current.track_mortgage_in_net_worth, mortgage_schedule=current.mortgage_schedule))
    return _to_net_worth_payload(value)


@router.put("/net-worth/configuration", response_model=NetWorthPayload)
def put_net_worth_configuration(request: NetWorthConfigurationPutRequest, user=Depends(require_session_user), container=Depends(get_container)) -> NetWorthPayload:
    current = container.get_net_worth.execute(user.user_id) or NetWorth(beginning_net_worth=None, investment_snapshots={}, updated_at=now_iso())
    value = container.put_net_worth.execute(user.user_id, NetWorth(beginning_net_worth=current.beginning_net_worth, investment_snapshots=current.investment_snapshots, updated_at=now_iso(), track_mortgage_in_net_worth=request.track_mortgage_in_net_worth, mortgage_schedule=current.mortgage_schedule))
    return _to_net_worth_payload(value)


@router.put("/net-worth/mortgage-schedule", response_model=NetWorthPayload)
def put_mortgage_schedule(request: MortgageSchedulePutRequest, user=Depends(require_session_user), container=Depends(get_container)) -> NetWorthPayload:
    has_principal_payment = (
        request.monthly_principal_payment + request.monthly_additional_principal_payment > 0
        or any(value > 0 for value in request.principal_overrides.values())
        or any(value > 0 for value in request.extra_principal_overrides.values())
    )
    if request.starting_outstanding_mortgage > 0 and not has_principal_payment:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='A principal payment is required while a balance remains.')
    current = container.get_net_worth.execute(user.user_id) or NetWorth(beginning_net_worth=None, investment_snapshots={}, updated_at=now_iso())
    value = container.put_net_worth.execute(user.user_id, NetWorth(beginning_net_worth=current.beginning_net_worth, investment_snapshots=current.investment_snapshots, updated_at=now_iso(), track_mortgage_in_net_worth=current.track_mortgage_in_net_worth, mortgage_schedule=request.model_dump(by_alias=True)))
    return _to_net_worth_payload(value)

@router.delete("/net-worth/mortgage-schedule", response_model=NetWorthPayload)
def delete_mortgage_schedule(user=Depends(require_session_user), container=Depends(get_container)) -> NetWorthPayload:
    current = container.get_net_worth.execute(user.user_id) or NetWorth(beginning_net_worth=None, investment_snapshots={}, updated_at=now_iso())
    value = container.put_net_worth.execute(user.user_id, NetWorth(beginning_net_worth=current.beginning_net_worth, investment_snapshots=current.investment_snapshots, updated_at=now_iso(), track_mortgage_in_net_worth=current.track_mortgage_in_net_worth, mortgage_schedule=None))
    return _to_net_worth_payload(value)
@router.get("/income-sources", response_model=list[IncomeSourcePayload])
def list_income_sources(user=Depends(require_session_user), container=Depends(get_container)) -> list[IncomeSourcePayload]:
    return [to_income_source_payload(item) for item in container.list_income_sources.execute(user.user_id)]


@router.post("/income-sources", response_model=IncomeSourcePayload, status_code=status.HTTP_201_CREATED)
def create_income_source(request: IncomeSourceUpsertRequest, user=Depends(require_session_user), container=Depends(get_container)) -> IncomeSourcePayload:
    timestamp = now_iso()
    source = to_income_source(
        source_id=f"income-source-{uuid.uuid4().hex[:8]}",
        payload=request,
        created_at=timestamp,
        updated_at=timestamp,
    )
    return to_income_source_payload(container.create_income_source.execute(user.user_id, source))


@router.put("/income-sources/{source_id}", response_model=IncomeSourcePayload)
def update_income_source(source_id: str, request: IncomeSourceUpsertRequest, user=Depends(require_session_user), container=Depends(get_container)) -> IncomeSourcePayload:
    existing = next((item for item in container.list_income_sources.execute(user.user_id) if item.id == source_id), None)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Income source not found.")
    source = to_income_source(
        source_id=source_id,
        payload=request,
        created_at=existing.created_at,
        updated_at=now_iso(),
    )
    return to_income_source_payload(container.update_income_source.execute(user.user_id, source_id, source))


@router.post("/income-sources/{source_id}/status", response_model=IncomeSourcePayload)
def set_income_source_status(source_id: str, request: IncomeSourceStatusRequest, user=Depends(require_session_user), container=Depends(get_container)) -> IncomeSourcePayload:
    return to_income_source_payload(
        container.set_income_source_status.execute(user.user_id, source_id, request.status)
    )


@router.get("/budget/categories", response_model=list[BudgetCategoryPayload])
def list_budget_categories(user=Depends(require_session_user), container=Depends(get_container)) -> list[BudgetCategoryPayload]:
    return [to_budget_category_payload(item) for item in container.list_budget_categories.execute(user.user_id)]


@router.post("/budget/categories", response_model=BudgetCategoryPayload, status_code=status.HTTP_201_CREATED)
def create_budget_category(request: BudgetCategoryCreateRequest, user=Depends(require_session_user), container=Depends(get_container)) -> BudgetCategoryPayload:
    timestamp = now_iso()
    category = BudgetCategory(
        id=f"cat-{uuid.uuid4().hex[:8]}",
        name=request.name,
        color_hex=request.color_hex,
        created_at=timestamp,
        updated_at=timestamp,
        icon=request.icon,
        is_essential=request.is_essential,
    )
    return to_budget_category_payload(container.create_budget_category.execute(user.user_id, category))


@router.put("/budget/categories/{category_id}/draft", response_model=BudgetCategoryPayload)
def save_budget_category_draft(category_id: str, request: BudgetCategoryDraftRequest, user=Depends(require_session_user), container=Depends(get_container)) -> BudgetCategoryPayload:
    existing = next((item for item in container.list_budget_categories.execute(user.user_id) if item.id == category_id), None)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget category not found.")
    existing_subs = {item.id: item for item in existing.sub_categories}
    requested_existing_ids = [item.id for item in request.sub_categories if item.id is not None]
    if len(requested_existing_ids) != len(set(requested_existing_ids)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Each budget sub-category may appear only once.")
    if any(item_id not in existing_subs for item_id in requested_existing_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget sub-category not found.")
    timestamp = now_iso()
    sub_categories = []
    for item in request.sub_categories:
        prior = existing_subs.get(item.id) if item.id else None
        sub_categories.append(BudgetSubCategory(
            id=item.id or f"sub-{uuid.uuid4().hex[:8]}",
            category_id=category_id,
            name=item.name,
            monthly_amount_usd=item.monthly_amount_usd,
            created_at=prior.created_at if prior else timestamp,
            updated_at=timestamp,
        ))
    category = BudgetCategory(
        id=category_id,
        name=request.name,
        color_hex=request.color_hex,
        icon=request.icon,
        is_essential=request.is_essential,
        created_at=existing.created_at,
        updated_at=timestamp,
        sub_categories=sub_categories,
    )
    return to_budget_category_payload(container.save_budget_category_draft.execute(user.user_id, category))

@router.put("/budget/categories/{category_id}", response_model=BudgetCategoryPayload)
def update_budget_category(category_id: str, request: BudgetCategoryUpdateRequest, user=Depends(require_session_user), container=Depends(get_container)) -> BudgetCategoryPayload:
    return to_budget_category_payload(
        container.update_budget_category.execute(user.user_id, category_id, request.name, request.color_hex, request.icon, request.is_essential)
    )


@router.delete("/budget/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget_category(category_id: str, user=Depends(require_session_user), container=Depends(get_container)) -> Response:
    container.delete_budget_category.execute(user.user_id, category_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/budget/sub-categories", response_model=BudgetSubCategoryPayload, status_code=status.HTTP_201_CREATED)
def create_budget_sub_category(request: BudgetSubCategoryCreateRequest, user=Depends(require_session_user), container=Depends(get_container)) -> BudgetSubCategoryPayload:
    timestamp = now_iso()
    sub_category = BudgetSubCategory(
        id=f"sub-{uuid.uuid4().hex[:8]}",
        category_id=request.category_id,
        name=request.name,
        monthly_amount_usd=request.monthly_amount_usd,
        created_at=timestamp,
        updated_at=timestamp,
    )
    return to_budget_sub_category_payload(
        container.create_budget_sub_category.execute(user.user_id, sub_category)
    )


@router.put("/budget/sub-categories/{sub_category_id}", response_model=BudgetSubCategoryPayload)
def update_budget_sub_category(sub_category_id: str, request: BudgetSubCategoryUpdateRequest, user=Depends(require_session_user), container=Depends(get_container)) -> BudgetSubCategoryPayload:
    return to_budget_sub_category_payload(
        container.update_budget_sub_category.execute(
            user.user_id, sub_category_id, request.name, request.monthly_amount_usd
        )
    )


@router.delete("/budget/sub-categories/{sub_category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget_sub_category(sub_category_id: str, user=Depends(require_session_user), container=Depends(get_container)) -> Response:
    container.delete_budget_sub_category.execute(user.user_id, sub_category_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/accounts", response_model=list[AccountPayload])
def list_accounts(user=Depends(require_session_user), container=Depends(get_container)) -> list[AccountPayload]:
    return [to_account_payload(item) for item in container.list_accounts.execute(user.user_id)]


@router.post("/accounts", response_model=AccountPayload, status_code=status.HTTP_201_CREATED)
def create_account(request: AccountUpsertRequest, user=Depends(require_session_user), container=Depends(get_container)) -> AccountPayload:
    timestamp = now_iso()
    account = to_account(
        account_id=f"acc-{uuid.uuid4().hex[:8]}",
        payload=request,
        created_at=timestamp,
        updated_at=timestamp,
    )
    _ensure_income_sources_are_unassigned(account, container.list_accounts.execute(user.user_id))
    return to_account_payload(container.create_account.execute(user.user_id, account))


@router.put("/accounts/batch", response_model=list[AccountPayload])
def update_accounts_batch(request: AccountBatchRequest, user=Depends(require_session_user), container=Depends(get_container)) -> list[AccountPayload]:
    existing_accounts = container.list_accounts.execute(user.user_id)
    existing_by_id = {item.id: item for item in existing_accounts}
    requested_ids = [item.id for item in request.accounts]
    if len(requested_ids) != len(set(requested_ids)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Each account may appear only once.")
    if any(account_id not in existing_by_id for account_id in requested_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")
    timestamp = now_iso()
    changed = [to_account(item.id, item, existing_by_id[item.id].created_at, timestamp) for item in request.accounts]
    changed_by_id = {item.id: item for item in changed}
    proposed = [changed_by_id.get(item.id, item) for item in existing_accounts]
    owner_by_source_id: dict[str, str] = {}
    for account in proposed:
        for source_id in set(account.assigned_income_source_ids):
            owner = owner_by_source_id.get(source_id)
            if owner is not None and owner != account.id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Income source is already assigned to another account.")
            owner_by_source_id[source_id] = account.id
    return [to_account_payload(item) for item in container.update_accounts_batch.execute(user.user_id, changed)]

@router.put("/accounts/{account_id}", response_model=AccountPayload)
def update_account(account_id: str, request: AccountUpsertRequest, user=Depends(require_session_user), container=Depends(get_container)) -> AccountPayload:
    existing = next((item for item in container.list_accounts.execute(user.user_id) if item.id == account_id), None)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")
    account = to_account(
        account_id=account_id,
        payload=request,
        created_at=existing.created_at,
        updated_at=now_iso(),
    )
    _ensure_income_sources_are_unassigned(account, container.list_accounts.execute(user.user_id), current_account_id=account_id)
    return to_account_payload(container.update_account.execute(user.user_id, account_id, account))


@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(account_id: str, user=Depends(require_session_user), container=Depends(get_container)) -> Response:
    container.delete_account.execute(user.user_id, account_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/securities/search", response_model=list[SecurityMetadataPayload])
def search_securities(q: str, user=Depends(require_session_user), container=Depends(get_container)) -> list[SecurityMetadataPayload]:
    try:
        return [to_security_metadata_payload(item) for item in container.search_securities.execute(q)]
    except SecuritySearchUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


@router.get("/holdings", response_model=list[HoldingPayload])
def list_holdings(user=Depends(require_session_user), container=Depends(get_container)) -> list[HoldingPayload]:
    return [to_holding_payload(item) for item in container.list_holdings.execute(user.user_id)]


@router.post("/holdings", response_model=HoldingPayload, status_code=status.HTTP_201_CREATED)
def create_holding(request: HoldingCreateRequest, user=Depends(require_session_user), container=Depends(get_container)) -> HoldingPayload:
    if not request.account_positions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select at least one account.")

    account_ids = {account.id for account in container.list_accounts.execute(user.user_id)}
    unknown_account_ids = [
        position.account_id
        for position in request.account_positions
        if position.account_id not in account_ids
    ]
    if unknown_account_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected account was not found.")

    if any(position.quantity < 0 for position in request.account_positions):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quantity must be zero or greater.")

    timestamp = now_iso()
    holding = to_holding(
        holding_id=f"holding-{uuid.uuid4().hex[:8]}",
        payload=request,
        created_at=timestamp,
        updated_at=timestamp,
    )
    return to_holding_payload(container.create_holding.execute(user.user_id, holding))


@router.put("/holdings/import", response_model=HoldingImportResponse)
def import_holding_details(request: HoldingImportRequest, user=Depends(require_session_user), container=Depends(get_container)) -> HoldingImportResponse:
    symbols = [row.symbol.casefold() for row in request.rows]
    if len(symbols) != len(set(symbols)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Each ticker may appear only once.")
    account_ids = {account.id for account in container.list_accounts.execute(user.user_id)}
    for row in request.rows:
        imported_account_ids = [position.account_id for position in row.account_positions]
        if len(imported_account_ids) != len(set(imported_account_ids)):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Each account may appear only once per ticker.")
        if any(position.account_id not in account_ids for position in row.account_positions):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Imported account was not found.")
    updated, unmatched = container.import_holding_details.execute(
        user.user_id,
        [
            (
                row.symbol.strip().upper(),
                row.name.strip(),
                row.price,
                [to_holding_account_position(position) for position in row.account_positions],
            )
            for row in request.rows
        ],
    )
    return HoldingImportResponse(holdings=[to_holding_payload(item) for item in updated], unmatched_symbols=unmatched)

@router.post("/holdings/security-details/refresh", response_model=SecurityDetailsRefreshResultPayload)
def refresh_held_security_details(
    request: SecurityDetailsRefreshRequest | None = None,
    user=Depends(require_session_user),
    container=Depends(get_container),
) -> SecurityDetailsRefreshResultPayload:
    result = container.refresh_held_security_details.execute(
        user.user_id,
        replace_manual_payouts=request.replace_manual_payouts if request else False,
    )
    return to_security_details_refresh_result_payload(
        result.holdings,
        result.failed_symbols,
    )


@router.post("/holdings/{holding_id}/security-details/refresh", response_model=HoldingPayload)
def refresh_holding_security_details(
    holding_id: str,
    request: SecurityDetailsRefreshRequest | None = None,
    user=Depends(require_session_user),
    container=Depends(get_container),
) -> HoldingPayload:
    try:
        return to_holding_payload(
            container.refresh_holding_security_details.execute(
                user.user_id,
                holding_id,
                replace_manual_payouts=request.replace_manual_payouts if request else False,
            )
        )
    except SecurityDetailsUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except DomainError as exc:
        raise _domain_error_to_http(exc) from exc


@router.delete("/holdings/payouts", response_model=list[HoldingPayload])
def purge_holding_payment_data(user=Depends(require_session_user), container=Depends(get_container)) -> list[HoldingPayload]:
    return [
        to_holding_payload(item)
        for item in container.purge_holding_payment_data.execute(user.user_id)
    ]

@router.put("/holdings/corporate-actions/import", response_model=HoldingImportResponse)
def import_corporate_actions(
    request: CorporateActionImportRequest,
    user=Depends(require_session_user),
    container=Depends(get_container),
) -> HoldingImportResponse:
    from app.domain.models import CorporateAction

    actions_by_symbol: dict[str, list[CorporateAction]] = {}
    identities: set[tuple[str, str, str, float, float]] = set()
    for row in request.rows:
        symbol = row.symbol.strip().upper()

        identity = (symbol, row.effective_date, row.type, row.old_shares, row.new_shares)
        if identity in identities:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Corporate action rows must be unique.")
        identities.add(identity)
        actions_by_symbol.setdefault(symbol, []).append(CorporateAction(
            id=f"corporate-action-{uuid.uuid4().hex[:12]}",
            effective_date=row.effective_date.isoformat(),
            type=row.type,
            old_shares=row.old_shares,
            new_shares=row.new_shares,
        ))

    updates = []
    matched_symbols = set()
    for holding in container.list_holdings.execute(user.user_id):
        additions = actions_by_symbol.get(holding.security.symbol.upper())
        if not additions:
            continue
        matched_symbols.add(holding.security.symbol.upper())
        existing = holding.security.corporate_actions
        new_actions = [
            action for action in additions
            if not any((item.effective_date, item.type, item.old_shares, item.new_shares) == (action.effective_date, action.type, action.old_shares, action.new_shares) for item in existing)
        ]
        if not new_actions:
            continue
        updates.append(replace(
            holding,
            security=replace(holding.security, corporate_actions=sorted([*existing, *new_actions], key=lambda item: item.effective_date)),
            updated_at=now_iso(),
        ))
    try:
        updated = container.update_holdings_batch.execute(user.user_id, updates)
    except (DomainError, ValueError) as exc:
        raise _domain_error_to_http(exc) from exc
    return HoldingImportResponse(
        holdings=[to_holding_payload(item) for item in updated],
        unmatched_symbols=sorted(set(actions_by_symbol).difference(matched_symbols)),
    )
@router.put("/holdings/manual-payouts/import", response_model=HoldingImportResponse)
def import_manual_payouts(
    request: ManualPayoutImportRequest,
    user=Depends(require_session_user),
    container=Depends(get_container),
) -> HoldingImportResponse:
    payouts_by_symbol = {}
    for row in request.rows:
        symbol = row.symbol.strip().upper()
        payouts_by_symbol.setdefault(symbol, []).append(to_security_payout_details(row.payout))
    try:
        updated, unmatched = container.import_manual_payout_details.execute(user.user_id, payouts_by_symbol)
        return HoldingImportResponse(
            holdings=[to_holding_payload(item) for item in updated],
            unmatched_symbols=unmatched,
        )
    except DomainError as exc:
        raise _domain_error_to_http(exc) from exc

@router.put("/holdings/{holding_id}/manual-payouts", response_model=HoldingPayload)
def update_manual_payouts(
    holding_id: str,
    request: HoldingManualPayoutsRequest,
    user=Depends(require_session_user),
    container=Depends(get_container),
) -> HoldingPayload:
    try:
        return to_holding_payload(
            container.update_manual_payout_details.execute(
                user.user_id,
                holding_id,
                [to_security_payout_details(item) for item in request.manual_payout_details],
            )
        )
    except DomainError as exc:
        raise _domain_error_to_http(exc) from exc


@router.put("/holdings/batch", response_model=list[HoldingPayload])
def update_holdings_batch(request: HoldingBatchRequest, user=Depends(require_session_user), container=Depends(get_container)) -> list[HoldingPayload]:
    existing_by_id = {item.id: item for item in container.list_holdings.execute(user.user_id)}
    requested_ids = [item.id for item in request.holdings]
    if len(requested_ids) != len(set(requested_ids)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Each holding may appear only once.")
    if any(item_id not in existing_by_id for item_id in requested_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Holding not found.")
    account_ids = {account.id for account in container.list_accounts.execute(user.user_id)}
    for item in request.holdings:
        if not item.account_positions:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select at least one account.")
        position_ids = [position.account_id for position in item.account_positions]
        if len(position_ids) != len(set(position_ids)):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Each account may appear only once per holding.")
        if any(position_id not in account_ids for position_id in position_ids):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected account was not found.")
        if any(position.quantity < 0 for position in item.account_positions):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quantity must be zero or greater.")
    timestamp = now_iso()
    holdings = [to_holding(item.id, item, existing_by_id[item.id].created_at, timestamp) for item in request.holdings]
    return [to_holding_payload(item) for item in container.update_holdings_batch.execute(user.user_id, holdings)]

@router.put("/holdings/{holding_id}", response_model=HoldingPayload)
def update_holding(holding_id: str, request: HoldingCreateRequest, user=Depends(require_session_user), container=Depends(get_container)) -> HoldingPayload:
    existing = next((item for item in container.list_holdings.execute(user.user_id) if item.id == holding_id), None)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Holding not found.")

    if not request.account_positions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select at least one account.")

    account_ids = {account.id for account in container.list_accounts.execute(user.user_id)}
    unknown_account_ids = [
        position.account_id
        for position in request.account_positions
        if position.account_id not in account_ids
    ]
    if unknown_account_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected account was not found.")

    if any(position.quantity < 0 for position in request.account_positions):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quantity must be zero or greater.")

    holding = to_holding(
        holding_id=holding_id,
        payload=request,
        created_at=existing.created_at,
        updated_at=now_iso(),
    )
    return to_holding_payload(container.update_holding.execute(user.user_id, holding_id, holding))


@router.delete("/holdings/{holding_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_holding(holding_id: str, user=Depends(require_session_user), container=Depends(get_container)) -> Response:
    try:
        container.delete_holding.execute(user.user_id, holding_id)
    except DomainError as exc:
        raise _domain_error_to_http(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)








