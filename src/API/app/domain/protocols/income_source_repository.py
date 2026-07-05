from __future__ import annotations

from typing import Protocol

from app.domain.models import IncomeSource


class IncomeSourceRepository(Protocol):
    def list_for_user(self, user_id: str) -> list[IncomeSource]: ...

    def create_for_user(self, user_id: str, source: IncomeSource) -> IncomeSource: ...

    def update_for_user(self, user_id: str, source_id: str, source: IncomeSource) -> IncomeSource: ...

    def set_status_for_user(self, user_id: str, source_id: str, status: str) -> IncomeSource: ...
