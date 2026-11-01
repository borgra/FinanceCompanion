from copy import deepcopy
import json
import threading

from azure.core.exceptions import ResourceExistsError, ResourceModifiedError, ResourceNotFoundError
import pytest

from app.domain.exceptions import ResearchControlUnavailableError, ResearchRateLimitError
from app.domain.models import SecurityMetadata
from app.infrastructure.price_research_admission import MemoryAdmissionState, PriceResearchAdmission, TableAdmissionState


def security(symbol="JEPQ"):
    return SecurityMetadata(symbol, "Synthetic ETF", "NASDAQ", "ETF", "USD")


class Entity(dict):
    def __init__(self, value, version):
        super().__init__(deepcopy(value))
        self.metadata = {"etag": str(version)}


class FakeTable:
    def __init__(self):
        self.value = None
        self.version = 0
        self.lock = threading.Lock()
        self.conflict_once = False

    def get_entity(self, partition, row):
        with self.lock:
            if self.value is None:
                raise ResourceNotFoundError()
            return Entity(self.value, self.version)

    def create_entity(self, value):
        with self.lock:
            if self.value is not None:
                raise ResourceExistsError()
            self.value = deepcopy(value)
            self.version += 1

    def update_entity(self, value, *, mode, etag, match_condition):
        assert mode == "replace" and match_condition.name == "IfNotModified"
        with self.lock:
            if self.conflict_once:
                self.conflict_once = False
                self.version += 1
            if etag != str(self.version):
                raise ResourceModifiedError()
            self.value = deepcopy(value)
            self.version += 1


@pytest.mark.parametrize("shared", [False, True])
def test_repeat_and_concurrent_requests_are_denied_across_coordinators(shared):
    state = TableAdmissionState(FakeTable()) if shared else MemoryAdmissionState()
    now = [1000.0]
    first = PriceResearchAdmission(state, clock=lambda: now[0])
    second = PriceResearchAdmission(state, clock=lambda: now[0])
    with first.reserve("user-1", security()):
        with pytest.raises(ResearchRateLimitError):
            with second.reserve("user-1", security("MSFT")):
                pytest.fail("Concurrent calls must not reach inference")
        with second.reserve("user-2", security()):
            with pytest.raises(ResearchRateLimitError):
                with first.reserve("user-3", security()):
                    pytest.fail("Shared concurrency cap must be enforced")
    with pytest.raises(ResearchRateLimitError) as error:
        with second.reserve("user-1", security()):
            pass
    assert error.value.retry_after == 60
    now[0] += 61
    with second.reserve("user-1", security()):
        pass


def test_failed_inference_keeps_cooldown_but_releases_concurrency():
    admission = PriceResearchAdmission(MemoryAdmissionState(), clock=lambda: 1000)
    with pytest.raises(ValueError):
        with admission.reserve("user-1", security()):
            raise ValueError("synthetic failure")
    with pytest.raises(ResearchRateLimitError):
        with admission.reserve("user-1", security()):
            pass
    with admission.reserve("user-1", security("MSFT")):
        pass


def test_user_and_global_attempt_budgets_count_released_requests():
    admission = PriceResearchAdmission(MemoryAdmissionState(), clock=lambda: 1000)
    for number in range(admission.USER_PER_MINUTE):
        with admission.reserve("user-1", security(str(number))):
            pass
    with pytest.raises(ResearchRateLimitError):
        with admission.reserve("user-1", security("OTHER")):
            pass
    for number in range(admission.GLOBAL_PER_MINUTE - admission.USER_PER_MINUTE):
        with admission.reserve(f"other-{number}", security(str(number))):
            pass
    with pytest.raises(ResearchRateLimitError):
        with admission.reserve("extra-user", security()):
            pass


def test_hourly_budget_and_state_size_are_bounded_without_raw_identity():
    state = MemoryAdmissionState()
    now = [1000.0]
    admission = PriceResearchAdmission(state, clock=lambda: now[0])
    for number in range(admission.GLOBAL_PER_HOUR):
        now[0] += 10
        with admission.reserve("private-user-id", security(f"PRIVATE-{number}")):
            pass
    serialized = json.dumps(state._state)
    assert "private-user-id" not in serialized and "PRIVATE-" not in serialized
    assert len(serialized.encode("utf-16-le")) < 64_000
    with pytest.raises(ResearchRateLimitError):
        with admission.reserve("extra-user", security("OTHER")):
            pass
    now[0] += 3601
    with admission.reserve("private-user-id", security()):
        pass
    assert len(state._state["attempts"]) == 1


def test_expired_crash_lease_recovers_and_old_release_cannot_clear_new_lease():
    state = MemoryAdmissionState()
    now = [1000.0]
    admission = PriceResearchAdmission(state, clock=lambda: now[0])
    first = admission.reserve("user-1", security())
    first.__enter__()
    now[0] += admission.LEASE_SECONDS + 1
    second = admission.reserve("user-1", security())
    second.__enter__()
    first.__exit__(None, None, None)
    with pytest.raises(ResearchRateLimitError):
        with admission.reserve("user-1", security("OTHER")):
            pass
    second.__exit__(None, None, None)


def test_table_conflict_is_retried_without_losing_reservations():
    table = FakeTable()
    admission = PriceResearchAdmission(TableAdmissionState(table), clock=lambda: 1000)
    with admission.reserve("user-1", security()):
        table.conflict_once = True
        with admission.reserve("user-2", security()):
            active = json.loads(table.value["state"])["active"]
            assert len(active) == 2
    assert json.loads(table.value["state"])["active"] == {}


def test_storage_outage_fails_closed_and_error_does_not_disclose_diagnostics():
    class Unavailable:
        def get_entity(self, *args):
            raise RuntimeError("private-storage-connection-string")
    with pytest.raises(ResearchControlUnavailableError) as error:
        with PriceResearchAdmission(TableAdmissionState(Unavailable())).reserve("user", security()):
            pytest.fail("Inference must not run during a usage-storage outage")
    assert "private-storage" not in str(error.value)
