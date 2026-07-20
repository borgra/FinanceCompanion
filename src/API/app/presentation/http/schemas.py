from __future__ import annotations

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, field_validator, model_validator
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
    icon: str = "category"
    is_essential: bool = Field(default=True, serialization_alias="isEssential")
    created_at: str = Field(serialization_alias="createdAt")
    updated_at: str = Field(serialization_alias="updatedAt")
    sub_categories: list[BudgetSubCategoryPayload] = Field(serialization_alias="subCategories")


class BudgetCategoryCreateRequest(CamelModel):
    name: str
    color_hex: str = Field(serialization_alias="colorHex")
    icon: str = "category"
    is_essential: bool = Field(default=True, serialization_alias="isEssential")


class BudgetCategoryUpdateRequest(CamelModel):
    name: str
    color_hex: str = Field(serialization_alias="colorHex")
    icon: str = "category"
    is_essential: bool = Field(default=True, serialization_alias="isEssential")


class BudgetSubCategoryDraftRequest(CamelModel):
    id: str | None = None
    name: str
    monthly_amount_usd: int = Field(serialization_alias="monthlyAmountUsd")


class BudgetCategoryDraftRequest(BudgetCategoryUpdateRequest):
    sub_categories: list[BudgetSubCategoryDraftRequest] = Field(serialization_alias="subCategories")

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


class AccountBatchItemRequest(AccountUpsertRequest):
    id: str


class AccountBatchRequest(CamelModel):
    accounts: list[AccountBatchItemRequest] = Field(max_length=100)
class SecurityPayoutDetailsPayload(CamelModel):
    ex_dividend_date: str = Field(serialization_alias="exDividendDate")
    amount: float
    declaration_date: str | None = Field(default=None, serialization_alias="declarationDate")
    record_date: str | None = Field(default=None, serialization_alias="recordDate")
    payment_date: str | None = Field(default=None, serialization_alias="paymentDate")
    source: str | None = None
    mode: str = "source"


class CorporateActionFields(CamelModel):
    """Validated inputs used to normalize payouts onto a current share basis."""

    effective_date: date = Field(serialization_alias="effectiveDate")
    type: Literal["stock_split", "reverse_stock_split"]
    old_shares: FiniteFloat = Field(gt=0, le=1_000_000_000, serialization_alias="oldShares")
    new_shares: FiniteFloat = Field(gt=0, le=1_000_000_000, serialization_alias="newShares")

    @model_validator(mode="after")
    def validate_action(self) -> "CorporateActionFields":
        if self.effective_date > date.today():
            raise ValueError("Corporate action effective dates cannot be in the future.")
        if self.old_shares == self.new_shares:
            raise ValueError("Corporate action share ratios cannot be 1:1.")
        if self.type == "stock_split" and self.new_shares <= self.old_shares:
            raise ValueError("A stock split must increase the share count.")
        if self.type == "reverse_stock_split" and self.new_shares >= self.old_shares:
            raise ValueError("A reverse stock split must decrease the share count.")
        return self


class CorporateActionPayload(CorporateActionFields):
    id: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9._:-]+$")

class SecurityMetadataPayload(CamelModel):
    symbol: str
    name: str
    exchange: str
    asset_type: str = Field(serialization_alias="assetType")
    currency: str
    price: float | None = Field(default=None, gt=0)
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
    dividend_status: str | None = Field(default=None, serialization_alias="dividendStatus")
    sma20: float | None = None
    sma50: float | None = None
    sma200: float | None = None
    details_updated_at: str | None = Field(default=None, serialization_alias="detailsUpdatedAt")
    details_status: str | None = Field(default=None, serialization_alias="detailsStatus")
    payout_details: list[SecurityPayoutDetailsPayload] = Field(
        default_factory=list,
        serialization_alias="payoutDetails",
    )
    manual_payout_details: list[SecurityPayoutDetailsPayload] = Field(
        default_factory=list,
        serialization_alias="manualPayoutDetails",
    )
    corporate_actions: list[CorporateActionPayload] = Field(
        default_factory=list,
        max_length=500,
        serialization_alias="corporateActions",
    )

    @field_validator("corporate_actions")
    @classmethod
    def corporate_actions_must_be_unique(
        cls,
        actions: list[CorporateActionPayload],
    ) -> list[CorporateActionPayload]:
        identities = {
            (action.effective_date, action.type, action.old_shares, action.new_shares)
            for action in actions
        }
        if len(identities) != len(actions):
            raise ValueError("Corporate actions must be unique per security.")
        return actions


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


class HoldingBatchItemRequest(HoldingCreateRequest):
    id: str


class HoldingBatchRequest(CamelModel):
    holdings: list[HoldingBatchItemRequest] = Field(max_length=100)

class HoldingImportRow(CamelModel):
    symbol: str = Field(min_length=1, max_length=20, pattern=r"^[A-Za-z0-9.-]+$")
    name: str = Field(min_length=1, max_length=200)
    price: float = Field(gt=0, le=1_000_000)
    account_positions: list[HoldingAccountPositionPayload] = Field(default_factory=list, serialization_alias="accountPositions")




class HoldingImportRequest(CamelModel):
    rows: list[HoldingImportRow] = Field(min_length=1, max_length=500)


class HoldingImportResponse(CamelModel):
    holdings: list[HoldingPayload]
    unmatched_symbols: list[str] = Field(default_factory=list, serialization_alias="unmatchedSymbols")

class ManualPayoutImportRow(CamelModel):
    symbol: str = Field(min_length=1, max_length=20, pattern=r"^[A-Za-z0-9.-]+$")
    payout: SecurityPayoutDetailsPayload


class ManualPayoutImportRequest(CamelModel):
    rows: list[ManualPayoutImportRow] = Field(min_length=1, max_length=500)

class CorporateActionImportRow(CorporateActionFields):
    symbol: str = Field(min_length=1, max_length=20, pattern=r"^[A-Za-z0-9.-]+$")


class CorporateActionImportRequest(CamelModel):
    rows: list[CorporateActionImportRow] = Field(min_length=1, max_length=500)

class SecurityDetailsRefreshResultPayload(CamelModel):
    holdings: list[HoldingPayload]
    failed_symbols: list[str] = Field(default_factory=list, serialization_alias="failedSymbols")


class HoldingManualPayoutsRequest(CamelModel):
    manual_payout_details: list[SecurityPayoutDetailsPayload] = Field(
        serialization_alias="manualPayoutDetails",
    )


class SecurityDetailsRefreshRequest(CamelModel):
    replace_manual_payouts: bool = Field(default=False, serialization_alias="replaceManualPayouts")



class NetWorthPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    beginning_net_worth: float | None = Field(alias="beginningNetWorth")
    investment_snapshots: dict[str, dict[str, float]] = Field(default_factory=dict, alias="investmentSnapshots")
    track_mortgage_in_net_worth: bool = Field(default=False, alias="trackMortgageInNetWorth")
    mortgage_schedule: dict[str, Any] | None = Field(default=None, alias="mortgageSchedule")
    updated_at: str = Field(alias="updatedAt")


class NetWorthConfigurationPutRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    track_mortgage_in_net_worth: bool = Field(alias="trackMortgageInNetWorth")


class MortgageSchedulePutRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    house_value: float = Field(alias="houseValue", ge=0, allow_inf_nan=False)
    starting_outstanding_mortgage: float = Field(alias="startingOutstandingMortgage", ge=0, allow_inf_nan=False)
    annual_interest_rate: float = Field(alias="annualInterestRate", ge=0, allow_inf_nan=False)
    monthly_principal_payment: float = Field(alias="monthlyPrincipalPayment", ge=0, allow_inf_nan=False)
    monthly_additional_principal_payment: float = Field(alias="monthlyAdditionalPrincipalPayment", ge=0, allow_inf_nan=False)
    schedule_start_month: str = Field(alias="scheduleStartMonth", pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    principal_overrides: dict[str, float] = Field(default_factory=dict, alias="principalOverrides")
    extra_principal_overrides: dict[str, float] = Field(default_factory=dict, alias="extraPrincipalOverrides")


class NetWorthPutRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    beginning_net_worth: float = Field(alias="beginningNetWorth", allow_inf_nan=False)


class InvestmentSnapshotPutRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    value: float = Field(allow_inf_nan=False)


class InvestmentSnapshotsPutRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    investment_snapshots: dict[str, dict[str, float]] = Field(alias="investmentSnapshots")










