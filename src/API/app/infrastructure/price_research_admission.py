"""Bound price research costs before inference, including across API replicas.

Only hashed user/listing keys, random lease IDs and timestamps are stored. The
single bounded Cosmos entity uses conditional writes, never last-write-wins.
"""
from __future__ import annotations

from contextlib import contextmanager
from copy import deepcopy
import hashlib
import json
import math
import threading
import time
import uuid

from azure.core import MatchConditions
from azure.core.exceptions import ResourceExistsError, ResourceModifiedError, ResourceNotFoundError
from azure.data.tables import UpdateMode

from app.domain.exceptions import ResearchControlUnavailableError, ResearchRateLimitError
from app.domain.models import SecurityMetadata


class MemoryAdmissionState:
    """Development-only state; production uses the shared table implementation."""

    def __init__(self):
        self._lock = threading.Lock()
        self._state = {}

    def change(self, transition):
        with self._lock:
            state = deepcopy(self._state)
            transition(state)
            self._state = state


class TableAdmissionState:
    PARTITION = "system:price-research"
    ROW = "admission-v1"

    def __init__(self, client):
        self._client = client

    def change(self, transition):
        try:
            for _ in range(5):
                try:
                    entity = self._client.get_entity(self.PARTITION, self.ROW)
                except ResourceNotFoundError:
                    entity = None
                state = json.loads(entity["state"]) if entity is not None else {}
                transition(state)
                updated = {"PartitionKey": self.PARTITION, "RowKey": self.ROW,
                           "state": json.dumps(state, separators=(",", ":"))}
                try:
                    if entity is None:
                        self._client.create_entity(updated)
                    else:
                        self._client.update_entity(updated, mode=UpdateMode.REPLACE,
                            etag=entity.metadata["etag"], match_condition=MatchConditions.IfNotModified)
                    return
                except (ResourceExistsError, ResourceModifiedError):
                    continue
            raise ResearchControlUnavailableError("Price research is busy. Saved data was preserved; retry shortly.")
        except (ResearchRateLimitError, ResearchControlUnavailableError):
            raise
        except Exception:
            # A storage outage must never permit unmetered paid inference or
            # disclose connection strings/provider diagnostics to the browser.
            raise ResearchControlUnavailableError("Price research usage controls are unavailable. Saved data was preserved; retry shortly.") from None


class PriceResearchAdmission:
    COOLDOWN = 60
    LEASE_SECONDS = 180
    USER_PER_MINUTE = 12
    GLOBAL_PER_MINUTE = 30
    GLOBAL_PER_HOUR = 240
    GLOBAL_CONCURRENT = 2

    def __init__(self, state, *, clock=time.time):
        self._state = state
        self._clock = clock

    @contextmanager
    def reserve(self, user_id: str, security: SecurityMetadata):
        user = hashlib.sha256(user_id.encode()).hexdigest()
        listing = hashlib.sha256(json.dumps([user, security.symbol.upper().strip(),
            security.exchange.upper().strip(), security.asset_type.upper().strip(), security.currency.upper().strip()]).encode()).hexdigest()
        token = uuid.uuid4().hex

        def acquire(state):
            now = self._clock()
            active = {key: value for key, value in state.get("active", {}).items() if value["expires"] > now}
            attempts = [value for value in state.get("attempts", []) if value["at"] > now - 3600]
            cooldowns = {key: value for key, value in state.get("cooldowns", {}).items() if value > now}
            retry_at = [cooldowns[listing]] if listing in cooldowns else []
            same_user = [value["expires"] for value in active.values() if value["user"] == user]
            retry_at.extend(same_user)
            if len(active) >= self.GLOBAL_CONCURRENT:
                retry_at.append(min(value["expires"] for value in active.values()))
            user_minute = [value["at"] for value in attempts if value["user"] == user and value["at"] > now - 60]
            global_minute = [value["at"] for value in attempts if value["at"] > now - 60]
            if len(user_minute) >= self.USER_PER_MINUTE:
                retry_at.append(min(user_minute) + 60)
            if len(global_minute) >= self.GLOBAL_PER_MINUTE:
                retry_at.append(min(global_minute) + 60)
            if len(attempts) >= self.GLOBAL_PER_HOUR:
                retry_at.append(min(value["at"] for value in attempts) + 3600)
            if retry_at:
                raise ResearchRateLimitError(math.ceil(max(retry_at) - now))
            active[token] = {"user": user, "expires": now + self.LEASE_SECONDS}
            attempts.append({"user": user, "at": now})
            cooldowns[listing] = now + self.COOLDOWN
            state.update(active=active, attempts=attempts, cooldowns=cooldowns)

        self._state.change(acquire)
        try:
            yield
        finally:
            def release(state):
                state.get("active", {}).pop(token, None)
            try:
                self._state.change(release)
            except ResearchControlUnavailableError:
                # Lease expiry safely recovers after crashes/outages. Do not
                # discard an otherwise validated quote on a failed release.
                pass
