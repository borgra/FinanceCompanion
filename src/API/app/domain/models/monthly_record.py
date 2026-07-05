from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class MonthlyRecord:
    month: str
    credit: int
    outflows: dict[str, int]
    invest: int
    savings: int
