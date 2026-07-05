from __future__ import annotations

from typing import Protocol

from app.domain.models import VerifiedIdentity


class IdentityTokenVerifier(Protocol):
    def verify(self, token: str, client_id: str | None, tenant_id: str | None) -> VerifiedIdentity: ...
