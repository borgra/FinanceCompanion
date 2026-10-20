from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
import re

from .account_column import AccountColumn
from .monthly_record import MonthlyRecord


def normalize_minimum_amount(value: object) -> Decimal | None:
    """Validate money without rounding invalid input or persisting float artifacts."""
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
        if re.fullmatch(r"[0-9]+(?:\.[0-9]{1,2})?", value) is None:
            raise ValueError("Account minimum must be a USD amount with at most two decimal places.")
    elif isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
        raise ValueError("Account minimum must be a USD amount.")
    amount = Decimal(str(value))
    if not amount.is_finite() or amount < 0 or amount > Decimal("999999999.99"):
        raise ValueError("Account minimum must be between 0 and 999999999.99.")
    if amount.as_tuple().exponent < -2:
        raise ValueError("Account minimum must have at most two decimal places.")
    return amount.quantize(Decimal("0.01")) if amount else None


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
    investment_account_type: str | None = None
    investment_brokerage: str | None = None
    manage_holdings: bool = False
    yearly_contribution: float | None = None
    employer_income_source_id: str | None = None
    employer_match_rate_percent: float | None = None
    employer_match_cap_percent: float | None = None
    employer_match_start_date: str | None = None
    employer_match_amount: float | None = None
    employer_match_percent: float | None = None
    employer_name: str | None = None
    minimum_amount: Decimal | None = None

    def __post_init__(self) -> None:
        self.minimum_amount = normalize_minimum_amount(self.minimum_amount)
