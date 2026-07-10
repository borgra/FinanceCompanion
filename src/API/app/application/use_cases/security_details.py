from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import UTC, datetime
from typing import Protocol

from app.domain.exceptions import NotFoundError
from app.domain.models import Holding, SecurityMetadata
from app.domain.protocols import HoldingRepository
from app.infrastructure.in_memory_repositories import now_iso


class SecurityDetailsProvider(Protocol):
    def get_details(self, security: SecurityMetadata) -> SecurityMetadata: ...


@dataclass(slots=True)
class SecurityDetailsRefreshResult:
    holdings: list[Holding]
    failed_symbols: list[str]


def _coalesce[T](next_value: T | None, current_value: T | None) -> T | None:
    return next_value if next_value is not None else current_value


def _updated_date(value: str | None):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def should_refresh_security_details(security: SecurityMetadata) -> bool:
    updated_date = _updated_date(security.details_updated_at)
    if updated_date is None:
        return True
    return updated_date < datetime.now(tz=UTC).date()


def merge_security_details(
    current: SecurityMetadata,
    details: SecurityMetadata,
    *,
    status: str,
    updated_at: str,
) -> SecurityMetadata:
    return SecurityMetadata(
        symbol=current.symbol,
        name=details.name or current.name,
        exchange=details.exchange or current.exchange,
        asset_type=details.asset_type or current.asset_type,
        currency=details.currency or current.currency,
        price=_coalesce(details.price, current.price),
        sector=_coalesce(details.sector, current.sector),
        industry=_coalesce(details.industry, current.industry),
        pe_ratio=_coalesce(details.pe_ratio, current.pe_ratio),
        thirty_day_yield=_coalesce(details.thirty_day_yield, current.thirty_day_yield),
        fifty_two_week_low=_coalesce(details.fifty_two_week_low, current.fifty_two_week_low),
        fifty_two_week_high=_coalesce(details.fifty_two_week_high, current.fifty_two_week_high),
        dividend_previous_year=_coalesce(details.dividend_previous_year, current.dividend_previous_year),
        dividend_current_year=_coalesce(details.dividend_current_year, current.dividend_current_year),
        dividend_growth_rate=_coalesce(details.dividend_growth_rate, current.dividend_growth_rate),
        estimated_future_payout=_coalesce(details.estimated_future_payout, current.estimated_future_payout),
        sma20=_coalesce(details.sma20, current.sma20),
        sma50=_coalesce(details.sma50, current.sma50),
        sma200=_coalesce(details.sma200, current.sma200),
        details_updated_at=updated_at,
        details_status=details.details_status or status,
        payout_details=details.payout_details or current.payout_details,
    )


class RefreshHoldingSecurityDetails:
    def __init__(
        self,
        repository: HoldingRepository,
        provider: SecurityDetailsProvider,
    ) -> None:
        self._repository = repository
        self._provider = provider

    def execute(self, user_id: str, holding_id: str) -> Holding:
        holdings = self._repository.list_for_user(user_id)
        holding = next((item for item in holdings if item.id == holding_id), None)
        if holding is None:
            raise NotFoundError("Holding not found.")

        if not should_refresh_security_details(holding.security):
            return holding

        details = self._provider.get_details(holding.security)
        timestamp = now_iso()
        updated = replace(
            holding,
            security=merge_security_details(
                holding.security,
                details,
                status="fresh",
                updated_at=timestamp,
            ),
            updated_at=timestamp,
        )
        return self._repository.update_for_user(user_id, holding_id, updated)


class RefreshHeldSecurityDetails:
    def __init__(
        self,
        repository: HoldingRepository,
        provider: SecurityDetailsProvider,
    ) -> None:
        self._repository = repository
        self._provider = provider

    def execute(self, user_id: str) -> SecurityDetailsRefreshResult:
        holdings = self._repository.list_for_user(user_id)
        details_by_symbol: dict[str, SecurityMetadata] = {}
        failed_symbols: list[str] = []

        for holding in holdings:
            symbol = holding.security.symbol
            if not should_refresh_security_details(holding.security):
                continue
            if symbol in details_by_symbol or symbol in failed_symbols:
                continue

            try:
                details_by_symbol[symbol] = self._provider.get_details(holding.security)
            except Exception:
                failed_symbols.append(symbol)

        refreshed_holdings: list[Holding] = []
        timestamp = now_iso()
        for holding in holdings:
            details = details_by_symbol.get(holding.security.symbol)
            if details is None:
                refreshed_holdings.append(holding)
                continue

            updated = replace(
                holding,
                security=merge_security_details(
                    holding.security,
                    details,
                    status="fresh",
                    updated_at=timestamp,
                ),
                updated_at=timestamp,
            )
            refreshed_holdings.append(
                self._repository.update_for_user(user_id, holding.id, updated)
            )

        return SecurityDetailsRefreshResult(
            holdings=refreshed_holdings,
            failed_symbols=failed_symbols,
        )
