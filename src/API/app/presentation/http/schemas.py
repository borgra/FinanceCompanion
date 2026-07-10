from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


class UserResponse(CamelModel):
    id: str
    email: str
    display_name: str = Field(serialization_alias="displayName")
    picture_url: str | None = Field(default=None, serialization_alias="pictureUrl")


class AuthVerifyRequest(CamelModel):
    id_token: str = Field(alias="idToken", serialization_alias="idToken")


class AuthSessionResponse(CamelModel):
    user: UserResponse


class IncomePeriodPayload(CamelModel):
    id: str
    start_date: str = Field(serialization_alias="startDate")
    yearly_gross_amount: int = Field(serialization_alias="yearlyGrossAmount")
    net_percentage: int = Field(serialization_alias="netPercentage")
    end_date: str | None = Field(default=None, serialization_alias="endDate")


class IncomeSourcePayload(CamelModel):
    id: str
    name: str
    type: str
    cadence: str
    periods: list[IncomePeriodPayload]
    status: str
    created_at: str = Field(serialization_alias="createdAt")
    updated_at: str = Field(serialization_alias="updatedAt")


class IncomeSourceUpsertRequest(CamelModel):
    name: str
    periods: list[IncomePeriodPayload]
    status: str


class IncomeSourceStatusRequest(CamelModel):
    status: str


class BudgetSubCategoryPayload(CamelModel):
    id: str
    category_id: str = Field(serialization_alias="categoryId")
    name: str
    monthly_amount_usd: int = Field(serialization_alias="monthlyAmountUsd")
    created_at: str = Field(serialization_alias="createdAt")
    updated_at: str = Field(serialization_alias="updatedAt")


class BudgetCategoryPayload(CamelModel):
    id: str
    name: str
    color_hex: str = Field(serialization_alias="colorHex")
    created_at: str = Field(serialization_alias="createdAt")
    updated_at: str = Field(serialization_alias="updatedAt")
    sub_categories: list[BudgetSubCategoryPayload] = Field(serialization_alias="subCategories")


class BudgetCategoryCreateRequest(CamelModel):
    name: str
    color_hex: str = Field(serialization_alias="colorHex")


class BudgetCategoryUpdateRequest(CamelModel):
    name: str
    color_hex: str = Field(serialization_alias="colorHex")


class BudgetSubCategoryCreateRequest(CamelModel):
    category_id: str = Field(serialization_alias="categoryId")
    name: str
    monthly_amount_usd: int = Field(serialization_alias="monthlyAmountUsd")


class BudgetSubCategoryUpdateRequest(CamelModel):
    name: str
    monthly_amount_usd: int = Field(serialization_alias="monthlyAmountUsd")


class AccountColumnPayload(CamelModel):
    id: str
    name: str
    icon: str | None = None
    is_deleted: bool | None = Field(default=None, serialization_alias="isDeleted")


class MonthlyRecordPayload(CamelModel):
    month: str
    credit: float
    outflows: dict[str, float]
    invest: float
    savings: float


class AccountPayload(CamelModel):
    id: str
    name: str
    type: str
    starting_balance: float = Field(serialization_alias="startingBalance")
    start_date: str = Field(serialization_alias="startDate")
    yield_rate: float = Field(serialization_alias="yieldRate")
    assigned_income_source_ids: list[str] = Field(default_factory=list, serialization_alias="assignedIncomeSourceIds")
    savings_account_id: str | None = Field(default=None, serialization_alias="savingsAccountId")
    investment_account_type: str | None = Field(default=None, serialization_alias="investmentAccountType")
    investment_brokerage: str | None = Field(default=None, serialization_alias="investmentBrokerage")
    manage_holdings: bool = Field(default=False, serialization_alias="manageHoldings")
    yearly_contribution: float | None = Field(default=None, serialization_alias="yearlyContribution")
    employer_income_source_id: str | None = Field(default=None, serialization_alias="employerIncomeSourceId")
    employer_match_rate_percent: float | None = Field(default=None, serialization_alias="employerMatchRatePercent")
    employer_match_cap_percent: float | None = Field(default=None, serialization_alias="employerMatchCapPercent")
    employer_match_start_date: str | None = Field(default=None, serialization_alias="employerMatchStartDate")
    employer_match_amount: float | None = Field(default=None, serialization_alias="employerMatchAmount")
    employer_match_percent: float | None = Field(default=None, serialization_alias="employerMatchPercent")
    columns: list[AccountColumnPayload]
    monthly_records: list[MonthlyRecordPayload] = Field(serialization_alias="monthlyRecords")
    created_at: str = Field(serialization_alias="createdAt")
    updated_at: str = Field(serialization_alias="updatedAt")


class AccountUpsertRequest(CamelModel):
    name: str
    type: str
    starting_balance: float = Field(serialization_alias="startingBalance")
    start_date: str = Field(serialization_alias="startDate")
    yield_rate: float = Field(serialization_alias="yieldRate")
    assigned_income_source_ids: list[str] = Field(default_factory=list, serialization_alias="assignedIncomeSourceIds")
    savings_account_id: str | None = Field(default=None, serialization_alias="savingsAccountId")
    investment_account_type: str | None = Field(default=None, serialization_alias="investmentAccountType")
    investment_brokerage: str | None = Field(default=None, serialization_alias="investmentBrokerage")
    manage_holdings: bool = Field(default=False, serialization_alias="manageHoldings")
    yearly_contribution: float | None = Field(default=None, serialization_alias="yearlyContribution")
    employer_income_source_id: str | None = Field(default=None, serialization_alias="employerIncomeSourceId")
    employer_match_rate_percent: float | None = Field(default=None, serialization_alias="employerMatchRatePercent")
    employer_match_cap_percent: float | None = Field(default=None, serialization_alias="employerMatchCapPercent")
    employer_match_start_date: str | None = Field(default=None, serialization_alias="employerMatchStartDate")
    employer_match_amount: float | None = Field(default=None, serialization_alias="employerMatchAmount")
    employer_match_percent: float | None = Field(default=None, serialization_alias="employerMatchPercent")
    columns: list[AccountColumnPayload] = Field(default_factory=list)
    monthly_records: list[MonthlyRecordPayload] = Field(default_factory=list, serialization_alias="monthlyRecords")


class SecurityPayoutDetailsPayload(CamelModel):
    ex_dividend_date: str = Field(serialization_alias="exDividendDate")
    amount: float
    declaration_date: str | None = Field(default=None, serialization_alias="declarationDate")
    record_date: str | None = Field(default=None, serialization_alias="recordDate")
    payment_date: str | None = Field(default=None, serialization_alias="paymentDate")
    source: str | None = None


class SecurityMetadataPayload(CamelModel):
    symbol: str
    name: str
    exchange: str
    asset_type: str = Field(serialization_alias="assetType")
    currency: str
    price: float | None = None
    sector: str | None = None
    industry: str | None = None
    pe_ratio: float | None = Field(default=None, serialization_alias="peRatio")
    thirty_day_yield: float | None = Field(default=None, serialization_alias="thirtyDayYield")
    fifty_two_week_low: float | None = Field(default=None, serialization_alias="fiftyTwoWeekLow")
    fifty_two_week_high: float | None = Field(default=None, serialization_alias="fiftyTwoWeekHigh")
    dividend_previous_year: float | None = Field(default=None, serialization_alias="dividendPreviousYear")
    dividend_current_year: float | None = Field(default=None, serialization_alias="dividendCurrentYear")
    dividend_growth_rate: float | None = Field(default=None, serialization_alias="dividendGrowthRate")
    estimated_future_payout: float | None = Field(default=None, serialization_alias="estimatedFuturePayout")
    sma20: float | None = None
    sma50: float | None = None
    sma200: float | None = None
    details_updated_at: str | None = Field(default=None, serialization_alias="detailsUpdatedAt")
    details_status: str | None = Field(default=None, serialization_alias="detailsStatus")
    payout_details: list[SecurityPayoutDetailsPayload] = Field(
        default_factory=list,
        serialization_alias="payoutDetails",
    )


class HoldingAccountPositionPayload(CamelModel):
    account_id: str = Field(serialization_alias="accountId")
    quantity: float
    cost_basis: float | None = Field(default=None, serialization_alias="costBasis")


class HoldingPayload(CamelModel):
    id: str
    security: SecurityMetadataPayload
    account_positions: list[HoldingAccountPositionPayload] = Field(serialization_alias="accountPositions")
    created_at: str = Field(serialization_alias="createdAt")
    updated_at: str = Field(serialization_alias="updatedAt")


class HoldingCreateRequest(CamelModel):
    security: SecurityMetadataPayload
    account_positions: list[HoldingAccountPositionPayload] = Field(serialization_alias="accountPositions")


class SecurityDetailsRefreshResultPayload(CamelModel):
    holdings: list[HoldingPayload]
    failed_symbols: list[str] = Field(default_factory=list, serialization_alias="failedSymbols")
