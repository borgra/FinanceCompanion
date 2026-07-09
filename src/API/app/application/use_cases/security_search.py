from __future__ import annotations

from typing import Protocol

from app.domain.models import SecurityMetadata


class SecuritySearchProvider(Protocol):
    def search(self, query: str) -> list[SecurityMetadata]: ...


class SearchSecurities:
    def __init__(self, provider: SecuritySearchProvider) -> None:
        self._provider = provider

    def execute(self, query: str) -> list[SecurityMetadata]:
        if not query.strip():
            return []

        return self._provider.search(query)
