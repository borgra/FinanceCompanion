from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class AccountColumn:
    id: str
    name: str
    icon: str | None = None
    is_deleted: bool | None = None
