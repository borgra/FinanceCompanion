from __future__ import annotations

from dataclasses import dataclass, field

from .budget_sub_category import BudgetSubCategory


@dataclass(slots=True)
class BudgetCategory:
    id: str
    name: str
    color_hex: str
    created_at: str
    updated_at: str
    sub_categories: list[BudgetSubCategory] = field(default_factory=list)
