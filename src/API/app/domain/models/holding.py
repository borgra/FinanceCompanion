from __future__ import annotations

from dataclasses import dataclass

from .security_metadata import SecurityMetadata


@dataclass(slots=True)
class HoldingAccountPosition:
    account_id: str
    quantity: float
    cost_basis: float | None = None


@dataclass(slots=True)
class Holding:
    id: str
    security: SecurityMetadata
    account_positions: list[HoldingAccountPosition]
    created_at: str
    updated_at: str
