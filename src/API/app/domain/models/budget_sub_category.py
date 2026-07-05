from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class BudgetSubCategory:
    id: str
    category_id: str
    name: str
    monthly_amount_usd: int
    created_at: str
    updated_at: str
