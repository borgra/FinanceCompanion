from __future__ import annotations

from dataclasses import dataclass

from .income_period import IncomePeriod


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
