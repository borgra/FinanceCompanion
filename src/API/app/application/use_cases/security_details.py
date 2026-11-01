from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from math import isfinite
from contextlib import nullcontext
from typing import Protocol

from app.domain.exceptions import NotFoundError, ResearchConflictError
from app.domain.models import Holding, SecurityMetadata
from app.domain.models.security_metadata import is_cash_security
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


def _updated_at(value: str | None):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def should_refresh_security_details(security: SecurityMetadata) -> bool:
    updated_at = _updated_at(security.details_updated_at)
    if updated_at is None:
        return True
    return updated_at < datetime.now(tz=UTC) - timedelta(hours=48)


def _has_valid_price(price: float | None) -> bool:
    return price is not None and isfinite(price) and price > 0


def _listing_key(security: SecurityMetadata) -> tuple[str, ...]:
    return tuple(value.strip().upper() for value in (security.symbol, security.exchange, security.asset_type, security.currency))


def _research_unchanged(before: SecurityMetadata, current: SecurityMetadata) -> bool:
    return (_listing_key(before) == _listing_key(current)
            and before.price == current.price and before.details_updated_at == current.details_updated_at)



def merge_security_details(
    current: SecurityMetadata,
    details: SecurityMetadata,
    *,
    status: str,
    updated_at: str,
) -> SecurityMetadata:
    if not _has_valid_price(details.price):
        return current
    return replace(current,
        symbol=current.symbol,
        name=details.name or current.name,
        exchange=details.exchange or current.exchange,
        asset_type=details.asset_type or current.asset_type,
        currency=details.currency or current.currency,
        price=_coalesce(details.price, current.price),
        price_as_of=details.price_as_of,
        price_source_url=details.price_source_url,
        price_basis=details.price_basis,
        sector=_coalesce(details.sector, current.sector),
        industry=_coalesce(details.industry, current.industry),
        pe_ratio=_coalesce(details.pe_ratio, current.pe_ratio),
        thirty_day_yield=_coalesce(details.thirty_day_yield, current.thirty_day_yield),
        fifty_two_week_low=_coalesce(details.fifty_two_week_low, current.fifty_two_week_low),
        fifty_two_week_high=_coalesce(details.fifty_two_week_high, current.fifty_two_week_high),
        dividend_previous_year=current.dividend_previous_year,
        dividend_current_year=current.dividend_current_year,
        dividend_growth_rate=current.dividend_growth_rate,
        estimated_future_payout=current.estimated_future_payout,
        dividend_status=current.dividend_status,
        sma20=_coalesce(details.sma20, current.sma20),
        sma50=_coalesce(details.sma50, current.sma50),
        sma200=_coalesce(details.sma200, current.sma200),
        details_updated_at=updated_at,
        details_status=details.details_status or status,
        payout_details=current.payout_details,
        source_payout_details=current.source_payout_details,
        manual_payout_details=current.manual_payout_details,
        corporate_actions=current.corporate_actions,
        dividend_research_retrieved_at=current.dividend_research_retrieved_at,
        dividend_research_provider=current.dividend_research_provider,
        dividend_research_source_url=current.dividend_research_source_url,
        dividend_research_authoritative=current.dividend_research_authoritative,
        dividend_research_schema_version=current.dividend_research_schema_version,
        dividend_research_adjustment_basis=current.dividend_research_adjustment_basis,
        dividend_research_warnings=current.dividend_research_warnings,
    )


class RefreshHoldingSecurityDetails:
    def __init__(
        self,
        repository: HoldingRepository,
        provider: SecurityDetailsProvider,
        admission=None,
    ) -> None:
        self._repository = repository
        self._provider = provider
        self._admission = admission

    def execute(
        self,
        user_id: str,
        holding_id: str,
    ) -> Holding:
        holdings = self._repository.list_for_user(user_id)
        holding = next((item for item in holdings if item.id == holding_id), None)
        if holding is None:
            raise NotFoundError("Holding not found.")
        if is_cash_security(holding.security):
            return holding

        with self._admission.reserve(user_id, holding.security) if self._admission else nullcontext():
            details = self._provider.get_details(holding.security)
        latest = next((item for item in self._repository.list_for_user(user_id) if item.id == holding_id), None)
        if latest is None:
            raise NotFoundError("Holding not found.")
        if not _research_unchanged(holding.security, latest.security):
            raise ResearchConflictError("The holding's price or listing changed during research. Your edits were preserved; retry shortly.")
        timestamp = now_iso()
        updated = replace(
            latest,
            security=merge_security_details(
                latest.security,
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
        admission=None,
    ) -> None:
        self._repository = repository
        self._provider = provider
        self._admission = admission

    def execute(
        self,
        user_id: str,
    ) -> SecurityDetailsRefreshResult:
        holdings = self._repository.list_for_user(user_id)
        details_by_listing: dict[tuple[str, ...], SecurityMetadata] = {}
        failed_symbols: list[str] = []
        failed_listings: set[tuple[str, ...]] = set()

        for holding in holdings:
            if is_cash_security(holding.security):
                continue
            symbol = holding.security.symbol
            listing = _listing_key(holding.security)
            if not should_refresh_security_details(holding.security):
                continue
            if listing in details_by_listing or listing in failed_listings:
                continue

            try:
                with self._admission.reserve(user_id, holding.security) if self._admission else nullcontext():
                    details_by_listing[listing] = self._provider.get_details(holding.security)
            except Exception:
                failed_listings.add(listing)
                if symbol not in failed_symbols:
                    failed_symbols.append(symbol)

        refreshed_holdings: list[Holding] = []
        timestamp = now_iso()
        original_by_id = {item.id: item for item in holdings}
        for holding in self._repository.list_for_user(user_id):
            original = original_by_id.get(holding.id)
            if original is None or not should_refresh_security_details(original.security):
                refreshed_holdings.append(holding)
                continue
            details = details_by_listing.get(_listing_key(original.security))
            if details is None:
                refreshed_holdings.append(holding)
                continue
            if not _research_unchanged(original.security, holding.security):
                if holding.security.symbol not in failed_symbols:
                    failed_symbols.append(holding.security.symbol)
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
