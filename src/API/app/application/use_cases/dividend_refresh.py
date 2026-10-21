from __future__ import annotations

from dataclasses import asdict, replace
from datetime import UTC, date, datetime, timedelta
from typing import Callable
from zoneinfo import ZoneInfo
import logging
import threading
import time

from app.application.dividend_payouts import merge_dividend_payouts
from app.domain.dividend_research import DividendResearchProviderError, DividendResearchRequest, subtract_months, validate_dividend_research_result
from app.domain.distribution_forecasting import MODEL, forecast_distributions, normalize_research, reconcile_events, select_source_events, stable_id
from app.domain.exceptions import NotFoundError
from app.domain.models import Holding
from app.domain.models.security_metadata import is_cash_security
from app.domain.protocols import DividendResearchProvider, HoldingRepository
from app.infrastructure.in_memory_repositories import now_iso

logger = logging.getLogger(__name__)


class RefreshHoldingDividends:
    def __init__(self, repository: HoldingRepository, provider: DividendResearchProvider, *, today: Callable[[], date] | None = None, freshness_seconds: int = 60) -> None:
        self._repository = repository
        self._provider = provider
        # Initial coverage is US listed securities, whose exchanges share this market timezone.
        self._today = today or (lambda: datetime.now(ZoneInfo("America/New_York")).date())
        self._freshness_seconds = freshness_seconds
        self._in_flight_lock = threading.Lock()
        self._in_flight: set[tuple[str, str]] = set()

    def execute(self, user_id: str, holding_id: str) -> Holding:
        holdings = self._repository.list_for_user(user_id)
        holding = next((item for item in holdings if item.id == holding_id), None)
        if holding is None:
            raise NotFoundError("Holding not found.")
        if is_cash_security(holding.security):
            return holding
        researched_at = holding.security.dividend_research_retrieved_at
        provider_cache_key = getattr(self._provider, "cache_key", None)
        if researched_at and provider_cache_key and holding.security.dividend_research_cache_key == provider_cache_key and holding.security.dividend_research_status in {"fresh", "partial"}:
            try:
                if datetime.fromisoformat(researched_at.replace("Z", "+00:00")) > datetime.now(UTC) - timedelta(seconds=self._freshness_seconds):
                    return holding
            except (ValueError, TypeError):
                pass
        today = self._today()
        request = DividendResearchRequest(
            symbol=holding.security.symbol, exchange=holding.security.exchange,
            currency=holding.security.currency, asset_type=holding.security.asset_type,
            retrieval_start=subtract_months(today, 60), retrieval_end=today, schema_version=2,
        )
        in_flight_key = (user_id, holding.security.symbol.strip().casefold())
        with self._in_flight_lock:
            if in_flight_key in self._in_flight:
                raise DividendResearchProviderError("A distribution refresh for this security is already in progress.")
            self._in_flight.add(in_flight_key)
        started = time.monotonic()
        try:
            result = validate_dividend_research_result(self._provider.research(request), request)
        finally:
            with self._in_flight_lock:
                self._in_flight.discard(in_flight_key)
        if result.status == "unavailable":
            # An empty research result is not evidence that saved distributions
            # or projections have disappeared. Do not reconcile or persist it.
            raise DividendResearchProviderError("No reliable dividend history was available. Existing records were preserved; please retry later.")
        if result.resolved_exchange or result.resolved_asset_type:
            request = replace(request, exchange=result.resolved_exchange or request.exchange,
                asset_type=result.resolved_asset_type or request.asset_type)
        inputs, actions = normalize_research(result, request)
        inputs, source_warnings = select_source_events(inputs)
        projected, forecast_warnings = forecast_distributions(inputs, request)
        visible = [item for item in inputs if request.history_start.isoformat() <= item.ex_dividend_date <= request.forecast_end.isoformat()]
        snapshot = {
            "asOf": today.isoformat(), "algorithm": MODEL, "schemaVersion": 2,
            "model": result.provenance.model, "promptVersion": result.provenance.prompt_version,
            "sourceSnapshotId": result.provenance.snapshot_id,
            "inputEvents": [asdict(item) for item in inputs],
            "corporateActions": [asdict(item) for item in actions],
        }
        if result.evidence_snapshot is not None:
            snapshot["evidence"] = result.evidence_snapshot
        snapshot_id = stable_id("snapshot", snapshot)
        timestamp = now_iso()
        changed = []
        for item in holdings:
            equivalent_exchanges = {holding.security.exchange.casefold(), (result.resolved_exchange or holding.security.exchange).casefold()}
            if result.resolved_exchange:
                equivalent_exchanges.update({"united states", "us", "usa", "unknown", ""})
            if item.security.symbol.casefold() != holding.security.symbol.casefold() or item.security.exchange.casefold() not in equivalent_exchanges:
                continue
            previous = item.security.source_payout_details
            prior_audit = list(item.security.payout_audit_details)
            if result.provenance.provider != "stub":
                demo = [payout for payout in previous if payout.source in {"stub", "seed"}]
                previous = [payout for payout in previous if payout.source not in {"stub", "seed"}]
                prior_audit.extend(replace(payout, status="superseded", event_id=payout.event_id or stable_id("fixture", asdict(payout))) for payout in demo)
            source, audit, reconciliation_warnings = reconcile_events(
                previous, visible + projected, prior_audit, request,
            )
            manual = [replace(payout, mode="manual", status="completed") for payout in item.security.manual_payout_details]
            warnings = list(dict.fromkeys(result.warnings + source_warnings + forecast_warnings + reconciliation_warnings))
            research_status = result.status
            if research_status == "fresh" and (source_warnings or reconciliation_warnings or any("unavailable" in warning for warning in forecast_warnings) or not result.provenance.authoritative):
                research_status = "partial"
            security = replace(
                item.security, payout_details=merge_dividend_payouts(source, manual),
                exchange=result.resolved_exchange or item.security.exchange,
                asset_type=result.resolved_asset_type or item.security.asset_type,
                source_payout_details=source, manual_payout_details=manual,
                payout_audit_details=audit,
                corporate_actions=actions if actions or (item.security.dividend_research_provider == "stub" and result.provenance.provider != "stub") else item.security.corporate_actions,
                dividend_research_retrieved_at=result.retrieved_at,
                dividend_research_provider=result.provenance.provider,
                dividend_research_source_url=result.provenance.source_url,
                dividend_research_authoritative=result.provenance.authoritative,
                dividend_research_schema_version=2, dividend_research_adjustment_basis="current_share_basis",
                dividend_research_warnings=warnings, dividend_research_as_of=today.isoformat(),
                dividend_research_status=research_status,
                dividend_research_history_start=request.history_start.isoformat(),
                dividend_research_forecast_end=request.forecast_end.isoformat(),
                dividend_research_snapshot_id=snapshot_id, dividend_research_snapshot=snapshot,
                dividend_research_cache_key=provider_cache_key,
                dividend_status="stub" if result.provenance.provider == "stub" else "researched",
            )
            changed.append(replace(item, security=security, updated_at=timestamp))
        logger.info("distribution_research security_id=%s source_count=%d event_count=%d status=%s latency_ms=%d", request.security_id, len({item.source_url for item in inputs}), len(visible) + len(projected), result.status, (time.monotonic() - started) * 1000)
        persisted = self._repository.update_batch_for_user(user_id, changed)
        return next(item for item in persisted if item.id == holding_id)
