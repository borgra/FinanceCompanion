from __future__ import annotations

from app.domain.models import (
    Account,
    AccountColumn,
    BudgetCategory,
    BudgetSubCategory,
    IncomePeriod,
    IncomeSource,
    MonthlyRecord,
    User,
)
from app.presentation.http.schemas import (
    AccountColumnPayload,
    AccountPayload,
    AccountUpsertRequest,
    BudgetCategoryPayload,
    BudgetSubCategoryPayload,
    IncomePeriodPayload,
    IncomeSourcePayload,
    IncomeSourceUpsertRequest,
    MonthlyRecordPayload,
    UserResponse,
)


def to_user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        picture_url=user.picture_url,
    )


def to_income_period(payload: IncomePeriodPayload) -> IncomePeriod:
    return IncomePeriod(
        id=payload.id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        yearly_gross_amount=payload.yearly_gross_amount,
        net_percentage=payload.net_percentage,
    )


def to_income_source(source_id: str, payload: IncomeSourceUpsertRequest, created_at: str, updated_at: str) -> IncomeSource:
    return IncomeSource(
        id=source_id,
        name=payload.name,
        type="Salary",
        cadence="Bi-weekly",
        periods=[to_income_period(period) for period in payload.periods],
        status=payload.status,
        created_at=created_at,
        updated_at=updated_at,
    )


def to_income_source_payload(source: IncomeSource) -> IncomeSourcePayload:
    return IncomeSourcePayload(
        id=source.id,
        name=source.name,
        type=source.type,
        cadence=source.cadence,
        periods=[
            IncomePeriodPayload(
                id=period.id,
                start_date=period.start_date,
                end_date=period.end_date,
                yearly_gross_amount=period.yearly_gross_amount,
                net_percentage=period.net_percentage,
            )
            for period in source.periods
        ],
        status=source.status,
        created_at=source.created_at,
        updated_at=source.updated_at,
    )


def to_budget_sub_category_payload(item: BudgetSubCategory) -> BudgetSubCategoryPayload:
    return BudgetSubCategoryPayload(
        id=item.id,
        category_id=item.category_id,
        name=item.name,
        monthly_amount_usd=item.monthly_amount_usd,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def to_budget_category_payload(item: BudgetCategory) -> BudgetCategoryPayload:
    return BudgetCategoryPayload(
        id=item.id,
        name=item.name,
        color_hex=item.color_hex,
        created_at=item.created_at,
        updated_at=item.updated_at,
        sub_categories=[to_budget_sub_category_payload(sub) for sub in item.sub_categories],
    )


def to_account_column(item: AccountColumnPayload) -> AccountColumn:
    return AccountColumn(
        id=item.id,
        name=item.name,
        icon=item.icon,
        is_deleted=item.is_deleted,
    )


def to_monthly_record(item: MonthlyRecordPayload) -> MonthlyRecord:
    return MonthlyRecord(
        month=item.month,
        credit=item.credit,
        outflows=item.outflows,
        invest=item.invest,
        savings=item.savings,
    )


def to_account(account_id: str, payload: AccountUpsertRequest, created_at: str, updated_at: str) -> Account:
    return Account(
        id=account_id,
        name=payload.name,
        type=payload.type,
        starting_balance=payload.starting_balance,
        start_date=payload.start_date,
        yield_rate=payload.yield_rate,
        assigned_income_source_ids=payload.assigned_income_source_ids,
        columns=[to_account_column(item) for item in payload.columns],
        monthly_records=[to_monthly_record(item) for item in payload.monthly_records],
        created_at=created_at,
        updated_at=updated_at,
    )


def to_account_payload(item: Account) -> AccountPayload:
    return AccountPayload(
        id=item.id,
        name=item.name,
        type=item.type,
        starting_balance=item.starting_balance,
        start_date=item.start_date,
        yield_rate=item.yield_rate,
        assigned_income_source_ids=item.assigned_income_source_ids,
        columns=[
            AccountColumnPayload(
                id=column.id,
                name=column.name,
                icon=column.icon,
                is_deleted=column.is_deleted,
            )
            for column in item.columns
        ],
        monthly_records=[
            MonthlyRecordPayload(
                month=record.month,
                credit=record.credit,
                outflows=record.outflows,
                invest=record.invest,
                savings=record.savings,
            )
            for record in item.monthly_records
        ],
        created_at=item.created_at,
        updated_at=item.updated_at,
    )
