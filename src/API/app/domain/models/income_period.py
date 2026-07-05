from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class IncomePeriod:
    id: str
    start_date: str
    yearly_gross_amount: int
    net_percentage: int
    end_date: str | None = None
