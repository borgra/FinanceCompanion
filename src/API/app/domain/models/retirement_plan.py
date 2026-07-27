from dataclasses import dataclass


@dataclass(slots=True)
class ContributionPlan:
    monthly_amount: float
    annual_increase_percent: float
    end_age: int


@dataclass(slots=True)
class ExpenseChange:
    age: int
    percent_change: float
    label: str | None = None


@dataclass(slots=True)
class SocialSecurityPlan:
    enabled: bool
    claim_age: int
    monthly_benefit: float
    annual_cola_percent: float


@dataclass(slots=True)
class RetirementPlan:
    id: str
    name: str
    current_age: int
    retirement_age: int
    longevity_age: int
    annual_roi_percent: float
    withdrawal_rate_percent: float
    annual_retirement_expense: float
    withdrawal_mode: str
    taxable_contribution: ContributionPlan
    retirement_contribution: ContributionPlan
    expense_changes: list[ExpenseChange]
    social_security: SocialSecurityPlan
    include_hsa_in_retirement: bool
    updated_at: str
