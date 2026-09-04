from __future__ import annotations

from datetime import date
from app.domain.dividend_research import (
    DividendResearchAction, DividendResearchPayment, DividendResearchProvenance,
    DividendResearchRequest, DividendResearchResult,
)

class StubDividendResearchProvider:
    """Deterministic contract fixture. It intentionally has no HTTP/Azure dependencies."""
    def research(self, request: DividendResearchRequest) -> DividendResearchResult:
        symbol = request.symbol.strip().upper()
        year = request.retrieval_end.year
        source = "https://example.test/finance-companion/stub-dividends"
        payments: list[DividendResearchPayment] = []
        for offset, amount in ((2, 0.70), (1, 0.76)):
            target = year - offset
            for month, day, value in ((2, 15, amount), (5, 15, amount), (8, 15, amount), (11, 15, amount)):
                payments.append(DividendResearchPayment(
                    ex_dividend_date=f"{target:04d}-{month:02d}-{day:02d}",
                    payment_date=f"{target:04d}-{month:02d}-{day + 7:02d}",
                    amount_per_share=value,
                    status="completed", source_url=source,
                ))
        current = year
        today = request.retrieval_end
        for month, day, value, status in ((2, 15, 0.83, "completed"), (5, 15, 0.83, "completed"), (8, 15, 0.83, "completed"), (11, 15, 0.83, "announced")):
            ex_date = date(current, month, day)
            if ex_date > today:
                status = "announced"
            payments.append(DividendResearchPayment(
                ex_dividend_date=ex_date.isoformat(),
                payment_date=date(current, month, min(day + 7, 28)).isoformat(),
                amount_per_share=value,
                status=status, source_url=source,
            ))
        return DividendResearchResult(
            schema_version=1, symbol=symbol,
            retrieved_at=f"{today.isoformat()}T00:00:00Z",
            adjustment_basis="raw", payments=payments,
            corporate_actions=[DividendResearchAction(
                effective_date=f"{year - 2:04d}-06-01", type="stock_split", old_shares=1, new_shares=2,
            )],
            warnings=["Stub data is deterministic and non-authoritative; replace with researched provider before production use."],
            provenance=DividendResearchProvenance(provider="stub", source_url=source, authoritative=False),
        )
