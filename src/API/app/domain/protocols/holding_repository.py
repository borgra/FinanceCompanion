from __future__ import annotations

from typing import Protocol

from app.domain.models import Holding


class HoldingRepository(Protocol):
    def list_for_user(self, user_id: str) -> list[Holding]: ...

    def create_for_user(self, user_id: str, holding: Holding) -> Holding: ...

    def update_for_user(self, user_id: str, holding_id: str, holding: Holding) -> Holding: ...
