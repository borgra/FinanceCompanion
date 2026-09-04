from __future__ import annotations

from typing import Protocol

from app.domain.dividend_research import DividendResearchRequest, DividendResearchResult


class DividendResearchProvider(Protocol):
    def research(self, request: DividendResearchRequest) -> DividendResearchResult: ...
