from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from math import isfinite
import json
from threading import Lock
from typing import Protocol

from app.domain.exceptions import NotFoundError, SecurityDetailsUnavailableError
from app.domain.models import Holding, SecurityMetadata
from app.domain.models.security_metadata import is_cash_security
from app.domain.protocols import HoldingRepository
from app.domain.security_details import DETAIL_FIELDS, SecurityDetailsResult, canonical_asset_type, listing_key
from app.infrastructure.in_memory_repositories import now_iso


class SecurityDetailsProvider(Protocol):
    def get_details(self, security: SecurityMetadata) -> SecurityDetailsResult: ...


@dataclass(slots=True)
class SecurityDetailsRefreshResult:
    holdings: list[Holding]
    failed_symbols: list[str]


def _updated_at(value: str | None):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None
        return parsed if parsed and parsed.tzinfo else None
    except (ValueError, TypeError, AttributeError):
        return None


def should_refresh_security_details(security: SecurityMetadata) -> bool:
    timestamp = _updated_at(security.details_updated_at)
    now = datetime.now(UTC)
    return timestamp is None or timestamp > now or timestamp <= now - timedelta(hours=48)


def _has_valid_price(price: float | None) -> bool:
    return isinstance(price, (float, int)) and not isinstance(price, bool) and isfinite(price) and price > 0


def _merge_provenance(current: dict, details: SecurityDetailsResult) -> dict:
    incoming = deepcopy(details.provenance)
    if not incoming:
        return {}  # Offline values must never inherit an AI attribution.
    sources = {item["id"]: item for item in incoming.get("sources", [])}
    evidence = {item["field"]: item for item in incoming.get("fieldEvidence", [])}
    prior_sources = {item["id"]: item for item in current.get("sources", [])}
    for field in DETAIL_FIELDS:
        if getattr(details, field) is not None:
            continue
        old = next((item for item in current.get("fieldEvidence", []) if item.get("field") == field), None)
        if not old:
            continue
        old = deepcopy(old)
        ids = []
        for old_id in old.get("sourceIds", []):
            if old_id not in prior_sources:
                continue
            new_id = "saved-" + old_id.removeprefix("saved-")
            while new_id in sources and sources[new_id]["url"] != prior_sources[old_id]["url"]:
                new_id += "-old"
            sources[new_id] = {**prior_sources[old_id], "id": new_id}
            ids.append(new_id)
        if ids:
            evidence[field] = {**old, "sourceIds": ids}
    used = {key for item in evidence.values() for key in item.get("sourceIds", [])}
    incoming["sources"] = [item for key, item in sources.items() if key in used]
    incoming["fieldEvidence"] = list(evidence.values())
    return incoming


def merge_security_details(current: SecurityMetadata, details: SecurityDetailsResult, *, status: str, updated_at: str) -> SecurityMetadata:
    if not _has_valid_price(details.price):
        raise SecurityDetailsUnavailableError("No valid price was found. Saved details were kept; try again.")
    values = {field: getattr(details, field) for field in DETAIL_FIELDS if getattr(details, field) is not None}
    name = current.name if canonical_asset_type(current.asset_type) == "Mutual Fund" else details.name or current.name
    merged = replace(current, **values, name=name,
        details_updated_at=updated_at, details_status=details.status or status,
        details_provenance=_merge_provenance(current.details_provenance, details))
    # Mirror the actual Cosmos details column, including evidence retained for old fields.
    column = {key: getattr(merged, key) for key in DETAIL_FIELDS}
    column.update(detailsUpdatedAt=updated_at, detailsStatus=merged.details_status,
        detailsProvenance=merged.details_provenance)
    if len(json.dumps(column, ensure_ascii=True, allow_nan=False).encode("utf-16-le")) > 30_000:
        raise SecurityDetailsUnavailableError("Stock detail evidence exceeds storage capacity. Saved details were kept.")
    return merged


class RefreshHoldingSecurityDetails:
    def __init__(self, repository: HoldingRepository, provider: SecurityDetailsProvider) -> None:
        self._repository = repository
        self._provider = provider
        self._lock = Lock()
        self._in_flight: set[tuple] = set()

    def execute(self, user_id: str, holding_id: str) -> Holding:
        initial = self._repository.list_for_user(user_id)
        holding = next((item for item in initial if item.id == holding_id), None)
        if holding is None:
            raise NotFoundError("Holding not found.")
        if is_cash_security(holding.security):
            return holding
        key = listing_key(holding.security)
        flight = (user_id, key)
        with self._lock:
            if flight in self._in_flight:
                raise SecurityDetailsUnavailableError("A stock-details update for this listing is already in progress.")
            self._in_flight.add(flight)
        try:
            details = self._provider.get_details(holding.security)
            latest = self._repository.list_for_user(user_id)
            target = next((item for item in latest if item.id == holding_id), None)
            if target is None:
                raise NotFoundError("Holding not found.")
            if listing_key(target.security) != key:
                raise SecurityDetailsUnavailableError("The holding changed during research. Saved details were kept; try again.")
            previous = {item.id: item for item in initial}
            # A concurrent manual edit or accepted research wins over this request.
            for item in latest:
                old = previous.get(item.id)
                if listing_key(item.security) == key and old and (
                    any(getattr(item.security, field) != getattr(old.security, field)
                        for field in (*DETAIL_FIELDS, "name", "details_updated_at", "details_status", "details_provenance"))
                ):
                    raise SecurityDetailsUnavailableError("Stock details changed during research. Saved details were kept; try again.")
            timestamp = now_iso()
            expected = [item for item in latest if listing_key(item.security) == key]
            changed = [replace(item, security=merge_security_details(item.security, details,
                status="partial", updated_at=timestamp), updated_at=timestamp) for item in expected]
            saved = self._repository.update_batch_for_user(user_id, changed, expected=expected)
            return next(item for item in saved if item.id == holding_id)
        except (NotFoundError, SecurityDetailsUnavailableError):
            raise
        except Exception:
            raise SecurityDetailsUnavailableError("Unable to save stock details. Saved details were kept; try again.") from None
        finally:
            with self._lock:
                self._in_flight.discard(flight)


class RefreshHeldSecurityDetails:
    def __init__(self, repository: HoldingRepository, provider: SecurityDetailsProvider,
                 single: RefreshHoldingSecurityDetails | None = None) -> None:
        self._repository = repository
        self._single = single or RefreshHoldingSecurityDetails(repository, provider)

    def execute(self, user_id: str) -> SecurityDetailsRefreshResult:
        seen, failed = set(), []
        for holding in self._repository.list_for_user(user_id):
            key = listing_key(holding.security)
            if is_cash_security(holding.security) or not should_refresh_security_details(holding.security) or key in seen:
                continue
            seen.add(key)
            try:
                self._single.execute(user_id, holding.id)
            except Exception:
                if holding.security.symbol not in failed:
                    failed.append(holding.security.symbol)
        return SecurityDetailsRefreshResult(self._repository.list_for_user(user_id), failed)
