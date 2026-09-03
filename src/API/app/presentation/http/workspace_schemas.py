from pydantic import Field

from app.presentation.http.retirement_schemas import RetirementPlanPayload
from app.presentation.http.schemas import (
    AccountPayload,
    BudgetCategoryPayload,
    CamelModel,
    HoldingPayload,
    IncomeSourcePayload,
    NetWorthPayload,
)


class WorkspacePayload(CamelModel):
    schema_version: int = Field(default=1, serialization_alias="schemaVersion")
    income_sources: list[IncomeSourcePayload] = Field(serialization_alias="incomeSources")
    budget_categories: list[BudgetCategoryPayload] = Field(serialization_alias="budgetCategories")
    accounts: list[AccountPayload]
    holdings: list[HoldingPayload]
    net_worth: NetWorthPayload | None = Field(default=None, serialization_alias="netWorth")
    retirement_plan: RetirementPlanPayload | None = Field(
        default=None,
        serialization_alias="retirementPlan",
    )
