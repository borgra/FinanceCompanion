from typing import Literal

from pydantic import Field, FiniteFloat, model_validator

from app.presentation.http.schemas import CamelModel


class ContributionPlanPayload(CamelModel):
    monthly_amount: FiniteFloat = Field(ge=0, le=100_000_000)
    annual_increase_percent: FiniteFloat = Field(ge=0, le=100)
    end_age: int = Field(ge=18, le=120)


class ExpenseChangePayload(CamelModel):
    age: int = Field(ge=18, le=120)
    percent_change: FiniteFloat = Field(ge=-100, le=100)
    label: str | None = Field(default=None, max_length=120)


class SocialSecurityPlanPayload(CamelModel):
    enabled: bool
    claim_age: int = Field(ge=62, le=120)
    monthly_benefit: FiniteFloat = Field(ge=0, le=100_000_000)
    annual_cola_percent: FiniteFloat = Field(ge=0, le=100)


class RetirementPlanPutRequest(CamelModel):
    id: str = Field(default="base-plan", pattern=r"^[A-Za-z0-9._:-]+$", max_length=100)
    name: str = Field(default="Base Plan", min_length=1, max_length=100)
    current_age: int = Field(ge=18, le=100)
    retirement_age: int = Field(ge=18, le=120)
    longevity_age: int = Field(ge=19, le=120)
    annual_roi_percent: FiniteFloat = Field(ge=-100, le=100)
    withdrawal_rate_percent: FiniteFloat = Field(ge=0, le=100)
    annual_retirement_expense: FiniteFloat = Field(ge=0, le=1_000_000_000)
    withdrawal_mode: Literal["meet_expense", "cap_at_target_rate"]
    taxable_contribution: ContributionPlanPayload
    retirement_contribution: ContributionPlanPayload
    expense_changes: list[ExpenseChangePayload] = Field(default_factory=list, max_length=100)
    social_security: SocialSecurityPlanPayload
    include_hsa_in_retirement: bool = False

    @model_validator(mode="after")
    def validate_horizon(self) -> "RetirementPlanPutRequest":
        if self.retirement_age < self.current_age:
            raise ValueError("Retirement age must be at least current age.")
        if self.longevity_age <= self.retirement_age:
            raise ValueError("Planning age must be greater than retirement age.")
        for contribution in (self.taxable_contribution, self.retirement_contribution):
            if contribution.end_age < self.current_age:
                raise ValueError("Contribution end age must be at least current age.")
            if contribution.end_age > self.longevity_age:
                raise ValueError("Contribution end age must be within the planning horizon.")
        if any(change.age < self.retirement_age or change.age > self.longevity_age for change in self.expense_changes):
            raise ValueError("Expense change ages must be from retirement through the planning age.")
        if len({change.age for change in self.expense_changes}) != len(self.expense_changes):
            raise ValueError("Use only one expense change per age.")
        if self.social_security.claim_age > self.longevity_age:
            raise ValueError("Social Security claim age must be within the planning horizon.")
        return self


class RetirementPlanPayload(RetirementPlanPutRequest):
    updated_at: str
