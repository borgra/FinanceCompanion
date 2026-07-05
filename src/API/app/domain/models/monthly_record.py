from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class MonthlyRecord:
    month: str
    credit: float
    outflows: dict[str, float]
    invest: float
    savings: float
