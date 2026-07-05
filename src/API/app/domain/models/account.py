from __future__ import annotations

from dataclasses import dataclass

from .account_column import AccountColumn
from .monthly_record import MonthlyRecord


@dataclass(slots=True)
class Account:
    id: str
    name: str
    type: str
    starting_balance: float
    start_date: str
    yield_rate: float
    assigned_income_source_ids: list[str]
    columns: list[AccountColumn]
    monthly_records: list[MonthlyRecord]
    created_at: str
    updated_at: str
    savings_account_id: str | None = None
