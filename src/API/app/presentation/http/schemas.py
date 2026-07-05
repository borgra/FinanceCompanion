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
    credit: int
    outflows: dict[str, int]
    invest: int
    savings: int


class AccountPayload(CamelModel):
    id: str
    name: str
    type: str
    starting_balance: int = Field(serialization_alias="startingBalance")
    start_date: str = Field(serialization_alias="startDate")
    yield_rate: float = Field(serialization_alias="yieldRate")
    assigned_income_source_ids: list[str] = Field(default_factory=list, serialization_alias="assignedIncomeSourceIds")
    columns: list[AccountColumnPayload]
    monthly_records: list[MonthlyRecordPayload] = Field(serialization_alias="monthlyRecords")
    created_at: str = Field(serialization_alias="createdAt")
    updated_at: str = Field(serialization_alias="updatedAt")


class AccountUpsertRequest(CamelModel):
    name: str
    type: str
    starting_balance: int = Field(serialization_alias="startingBalance")
    start_date: str = Field(serialization_alias="startDate")
    yield_rate: float = Field(serialization_alias="yieldRate")
    assigned_income_source_ids: list[str] = Field(default_factory=list, serialization_alias="assignedIncomeSourceIds")
    columns: list[AccountColumnPayload] = Field(default_factory=list)
    monthly_records: list[MonthlyRecordPayload] = Field(default_factory=list, serialization_alias="monthlyRecords")
