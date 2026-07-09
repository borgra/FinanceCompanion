from __future__ import annotations

from app.domain.models import (
    Account,
    AccountColumn,
    BudgetCategory,
    BudgetSubCategory,
    Holding,
    HoldingAccountPosition,
    IncomePeriod,
    IncomeSource,
    MonthlyRecord,
    SecurityMetadata,
    User,
)
from app.presentation.http.schemas import (
    AccountColumnPayload,
    AccountPayload,
    AccountUpsertRequest,
    BudgetCategoryPayload,
    BudgetSubCategoryPayload,
    HoldingAccountPositionPayload,
    HoldingCreateRequest,
    HoldingPayload,
    IncomePeriodPayload,
    IncomeSourcePayload,
    IncomeSourceUpsertRequest,
    MonthlyRecordPayload,
    SecurityMetadataPayload,
    SecurityDetailsRefreshResultPayload,
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
        savings_account_id=payload.savings_account_id,
        investment_account_type=payload.investment_account_type,
        investment_brokerage=payload.investment_brokerage,
        manage_holdings=payload.manage_holdings,
        yearly_contribution=payload.yearly_contribution,
        employer_income_source_id=payload.employer_income_source_id,
        employer_match_rate_percent=payload.employer_match_rate_percent,
        employer_match_cap_percent=payload.employer_match_cap_percent,
        employer_match_start_date=payload.employer_match_start_date,
        employer_match_amount=payload.employer_match_amount,
        employer_match_percent=payload.employer_match_percent,
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
        savings_account_id=item.savings_account_id,
        investment_account_type=item.investment_account_type,
        investment_brokerage=item.investment_brokerage,
        manage_holdings=item.manage_holdings,
        yearly_contribution=item.yearly_contribution,
        employer_income_source_id=item.employer_income_source_id,
        employer_match_rate_percent=item.employer_match_rate_percent,
        employer_match_cap_percent=item.employer_match_cap_percent,
        employer_match_start_date=item.employer_match_start_date,
        employer_match_amount=item.employer_match_amount,
        employer_match_percent=item.employer_match_percent,
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


def to_security_metadata(payload: SecurityMetadataPayload) -> SecurityMetadata:
    return SecurityMetadata(
        symbol=payload.symbol.strip().upper(),
        name=payload.name,
        exchange=payload.exchange,
        asset_type=payload.asset_type,
        currency=payload.currency,
        price=payload.price,
        sector=payload.sector,
        industry=payload.industry,
        pe_ratio=payload.pe_ratio,
        thirty_day_yield=payload.thirty_day_yield,
        fifty_two_week_low=payload.fifty_two_week_low,
        fifty_two_week_high=payload.fifty_two_week_high,
        dividend_previous_year=payload.dividend_previous_year,
        dividend_current_year=payload.dividend_current_year,
        dividend_growth_rate=payload.dividend_growth_rate,
        estimated_future_payout=payload.estimated_future_payout,
        sma20=payload.sma20,
        sma50=payload.sma50,
        sma200=payload.sma200,
        details_updated_at=payload.details_updated_at,
        details_status=payload.details_status,
    )


def to_security_metadata_payload(item: SecurityMetadata) -> SecurityMetadataPayload:
    return SecurityMetadataPayload(
        symbol=item.symbol,
        name=item.name,
        exchange=item.exchange,
        asset_type=item.asset_type,
        currency=item.currency,
        price=item.price,
        sector=item.sector,
        industry=item.industry,
        pe_ratio=item.pe_ratio,
        thirty_day_yield=item.thirty_day_yield,
        fifty_two_week_low=item.fifty_two_week_low,
        fifty_two_week_high=item.fifty_two_week_high,
        dividend_previous_year=item.dividend_previous_year,
        dividend_current_year=item.dividend_current_year,
        dividend_growth_rate=item.dividend_growth_rate,
        estimated_future_payout=item.estimated_future_payout,
        sma20=item.sma20,
        sma50=item.sma50,
        sma200=item.sma200,
        details_updated_at=item.details_updated_at,
        details_status=item.details_status,
    )


def to_holding_account_position(item: HoldingAccountPositionPayload) -> HoldingAccountPosition:
    return HoldingAccountPosition(
        account_id=item.account_id,
        quantity=item.quantity,
        cost_basis=item.cost_basis,
    )


def to_holding_account_position_payload(item: HoldingAccountPosition) -> HoldingAccountPositionPayload:
    return HoldingAccountPositionPayload(
        account_id=item.account_id,
        quantity=item.quantity,
        cost_basis=item.cost_basis,
    )


def to_holding(
    holding_id: str,
    payload: HoldingCreateRequest,
    created_at: str,
    updated_at: str,
) -> Holding:
    return Holding(
        id=holding_id,
        security=to_security_metadata(payload.security),
        account_positions=[
            to_holding_account_position(item)
            for item in payload.account_positions
        ],
        created_at=created_at,
        updated_at=updated_at,
    )


def to_holding_payload(item: Holding) -> HoldingPayload:
    return HoldingPayload(
        id=item.id,
        security=to_security_metadata_payload(item.security),
        account_positions=[
            to_holding_account_position_payload(position)
            for position in item.account_positions
        ],
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def to_security_details_refresh_result_payload(
    holdings: list[Holding],
    failed_symbols: list[str],
) -> SecurityDetailsRefreshResultPayload:
    return SecurityDetailsRefreshResultPayload(
        holdings=[to_holding_payload(item) for item in holdings],
        failed_symbols=failed_symbols,
    )
