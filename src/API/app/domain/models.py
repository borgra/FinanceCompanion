from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class User:
    id: str
    email: str
    display_name: str
    identity_subject: str | None = None
    identity_object_id: str | None = None
    identity_tenant_id: str | None = None
    picture_url: str | None = None


@dataclass(slots=True)
class IncomePeriod:
    id: str
    start_date: str
    yearly_gross_amount: int
    net_percentage: int
    end_date: str | None = None


@dataclass(slots=True)
class IncomeSource:
    id: str
    name: str
    type: str
    cadence: str
    periods: list[IncomePeriod]
    status: str
    created_at: str
    updated_at: str


@dataclass(slots=True)
class BudgetSubCategory:
    id: str
    category_id: str
    name: str
    monthly_amount_usd: int
    created_at: str
    updated_at: str


@dataclass(slots=True)
class BudgetCategory:
    id: str
    name: str
    color_hex: str
    created_at: str
    updated_at: str
    sub_categories: list[BudgetSubCategory] = field(default_factory=list)


@dataclass(slots=True)
class AccountColumn:
    id: str
    name: str
    icon: str | None = None
    is_deleted: bool | None = None


@dataclass(slots=True)
class MonthlyRecord:
    month: str
    credit: int
    outflows: dict[str, int]
    invest: int
    savings: int


@dataclass(slots=True)
class Account:
    id: str
    name: str
    type: str
    starting_balance: int
    start_date: str
    yield_rate: float
    columns: list[AccountColumn]
    monthly_records: list[MonthlyRecord]
    created_at: str
    updated_at: str


@dataclass(slots=True)
class VerifiedIdentity:
    subject: str
    object_id: str
    tenant_id: str
    email: str
    display_name: str | None = None
    picture_url: str | None = None


@dataclass(slots=True)
class SessionUser:
    user_id: str
    email: str
