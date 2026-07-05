from __future__ import annotations

from typing import Protocol

from app.domain.models import SessionUser, User


class SessionTokenService(Protocol):
    def issue(self, user: User) -> str: ...

    def parse(self, token: str) -> SessionUser: ...
