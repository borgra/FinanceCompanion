"""Persistence boundaries for slow, untrusted distribution research."""
from copy import deepcopy
from dataclasses import replace
from datetime import date

import pytest

from app.application.use_cases.dividend_refresh import RefreshHoldingDividends
from app.domain.dividend_research import DividendResearchProviderError
from app.domain.exceptions import NotFoundError
from app.domain.models import Holding, HoldingAccountPosition, SecurityMetadata, SecurityPayoutDetails
from app.infrastructure.in_memory_repositories import InMemoryDataStore, InMemoryHoldingRepository
from app.infrastructure.local_json_store import LocalJsonDataStore
from app.infrastructure.stub_dividend_research import StubDividendResearchProvider

TODAY = date(2026, 9, 4)


def holding(identifier="first", **identity):
    return Holding(identifier, SecurityMetadata(**{
        "symbol": "VTI", "name": "Vanguard Total Stock Market ETF", "exchange": "NYSE Arca",
        "asset_type": "ETF", "currency": "USD", "price": 123, **identity,
    }), [HoldingAccountPosition("brokerage", 10, 321)], "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z")


class Provider:
    def __init__(self, callback=None):
        self.callback = callback
        self.calls = 0

    def research(self, request):
        self.calls += 1
        if self.callback:
            self.callback()
        return StubDividendResearchProvider().research(request)


def setup(provider=None, repository_type=InMemoryHoldingRepository):
    store = InMemoryDataStore()
    store.holdings["user"] = [holding()]
    repository = repository_type(store)
    provider = provider or Provider()
    use_case = RefreshHoldingDividends(repository, provider, today=lambda: TODAY, freshness_seconds=0)
    return store, repository, provider, use_case


def test_inflight_guard_spans_the_conditional_commit_and_is_released_after_success():
    class Repository(InMemoryHoldingRepository):
        nested_failures = 0

        def update_batch_for_user(self, user_id, holdings, *, expected=None):
            assert expected is not None
            with pytest.raises(DividendResearchProviderError, match="already in progress"):
                use_case.execute(user_id, "first")
            self.nested_failures += 1
            return super().update_batch_for_user(user_id, holdings, expected=expected)

    _, repository, provider, use_case = setup(repository_type=Repository)
    use_case.execute("user", "first")
    use_case.execute("user", "first")
    assert provider.calls == 2
    assert repository.nested_failures == 2


@pytest.mark.parametrize("field,value", [("symbol", "OTHER"), ("exchange", "NASDAQ"), ("asset_type", "Stock"), ("currency", "CAD")])
def test_changed_target_identity_during_research_never_receives_prior_listing_facts(field, value):
    store, repository, provider, use_case = setup()
    def mutate():
        original = store.holdings["user"][0]
        store.holdings["user"][0] = replace(original, security=replace(original.security, **{field: value}))
    provider.callback = mutate
    with pytest.raises(DividendResearchProviderError, match="holding changed"):
        use_case.execute("user", "first")
    after = deepcopy(store.holdings["user"])
    assert getattr(after[0].security, field) == value
    assert not after[0].security.source_payout_details
    provider.callback = None
    assert repository.list_for_user("user") == after


def test_deleted_target_is_not_recreated_and_inflight_guard_is_released():
    store, repository, provider, use_case = setup()
    provider.callback = lambda: store.holdings.__setitem__("user", [])
    with pytest.raises(NotFoundError):
        use_case.execute("user", "first")
    assert repository.list_for_user("user") == []
    store.holdings["user"] = [holding()]
    provider.callback = None
    assert use_case.execute("user", "first").security.dividend_research_provider == "stub"


def test_fanout_respects_canonical_exchange_asset_currency_and_user_boundaries():
    store, repository, _, use_case = setup()
    store.holdings["user"] += [
        holding("alias", exchange="ARCX", asset_type="exchange-traded fund"),
        holding("currency", currency="CAD"), holding("asset", asset_type="Stock"),
        holding("exchange", exchange="NASDAQ"), replace(holding("disabled"), manage_dividends=False),
    ]
    store.holdings["other-user"] = [holding("other-user-holding")]
    before = deepcopy(store.holdings)
    use_case.execute("user", "first")
    updated = {item.id: item for item in repository.list_for_user("user")}
    assert updated["first"].security.dividend_research_provider == "stub"
    assert updated["alias"].security.dividend_research_provider == "stub"
    for original in before["user"][2:]:
        assert updated[original.id] == original
    assert store.holdings["other-user"] == before["other-user"]


def test_manual_schedule_position_and_stock_edits_during_research_are_merged_from_current_state():
    store, _, provider, use_case = setup()
    manual = SecurityPayoutDetails(ex_dividend_date="2026-03-01", amount=9.99, source="user", mode="manual")
    def mutate():
        original = store.holdings["user"][0]
        store.holdings["user"][0] = replace(original,
            account_positions=[HoldingAccountPosition("brokerage", 42, 987)],
            security=replace(original.security, manual_payout_details=[manual], dividend_growth_rate=0.09,
                price=456, details_status="manual", details_updated_at="2026-09-04T12:00:00Z"))
    provider.callback = mutate
    updated = use_case.execute("user", "first")
    assert updated.account_positions == [HoldingAccountPosition("brokerage", 42, 987)]
    assert updated.security.manual_payout_details == [manual]
    assert manual in updated.security.payout_details
    assert updated.security.dividend_growth_rate == 0.09
    assert updated.security.price == 456
    assert updated.security.details_status == "manual"
    assert updated.security.details_updated_at == "2026-09-04T12:00:00Z"


def test_newer_accepted_dividend_research_wins_over_older_inflight_result():
    store, repository, provider, use_case = setup()
    def mutate():
        original = store.holdings["user"][0]
        store.holdings["user"][0] = replace(original, security=replace(original.security,
            dividend_research_retrieved_at="2026-09-04T15:00:00Z", dividend_research_snapshot_id="newer-snapshot"))
    provider.callback = mutate
    with pytest.raises(DividendResearchProviderError, match="research changed"):
        use_case.execute("user", "first")
    assert repository.list_for_user("user")[0].security.dividend_research_snapshot_id == "newer-snapshot"
    assert repository.list_for_user("user")[0].security.source_payout_details == []


def test_edit_after_last_read_fails_conditional_write_and_preserves_entire_newer_record():
    class Repository(InMemoryHoldingRepository):
        conflict = True

        def update_batch_for_user(self, user_id, holdings, *, expected=None):
            assert expected is not None
            if self.conflict:
                original = self._store.holdings[user_id][0]
                self._store.holdings[user_id][0] = replace(original,
                    account_positions=[HoldingAccountPosition("brokerage", 77, 1000)], updated_at="newer-edit")
            return super().update_batch_for_user(user_id, holdings, expected=expected)

    store, repository, _, use_case = setup(repository_type=Repository)
    with pytest.raises(DividendResearchProviderError, match="Unable to save distribution"):
        use_case.execute("user", "first")
    expected = replace(holding(), account_positions=[HoldingAccountPosition("brokerage", 77, 1000)], updated_at="newer-edit")
    assert store.holdings["user"] == [expected]
    repository.conflict = False
    assert use_case.execute("user", "first").account_positions == expected.account_positions


def test_evidence_agent_execution_metadata_survives_persistence():
    class AgentProvider(Provider):
        def research(self, request):
            return replace(super().research(request), evidence_snapshot={
                "agent_name": "dividend-history-agent", "agent_version": "7", "execution_mode": "registered_agent",
                "definition_hash": "approved-hash", "facts": [{"source": "saved-public-evidence"}],
            })
    _, repository, _, use_case = setup(AgentProvider())
    use_case.execute("user", "first")
    snapshot = repository.list_for_user("user")[0].security.dividend_research_snapshot
    assert snapshot["agentName"] == "dividend-history-agent"
    assert snapshot["agentVersion"] == "7"
    assert snapshot["executionMode"] == "registered_agent"
    assert snapshot["definitionHash"] == "approved-hash"
    assert snapshot["evidence"]["facts"] == [{"source": "saved-public-evidence"}]


@pytest.mark.parametrize("status", ["unavailable", "unsupported"])
def test_failed_research_retains_entire_persisted_holding_and_releases_inflight(status):
    class FailedProvider(Provider):
        fail = True

        def research(self, request):
            result = super().research(request)
            return replace(result, status=status, payments=[], corporate_actions=[]) if self.fail else result
    store, repository, provider, use_case = setup(FailedProvider())
    before = deepcopy(store.holdings["user"])
    with pytest.raises(DividendResearchProviderError, match="No reliable dividend"):
        use_case.execute("user", "first")
    assert repository.list_for_user("user") == before
    provider.fail = False
    assert use_case.execute("user", "first").security.dividend_research_provider == "stub"


def test_accepted_research_and_preserved_positions_survive_local_json_restart(tmp_path):
    path = tmp_path / "finance.json"
    store = LocalJsonDataStore("local@example.test", path)
    original = holding()
    store.holdings["user"] = [original]
    store.save()
    refreshed = RefreshHoldingDividends(InMemoryHoldingRepository(store), Provider(), today=lambda: TODAY).execute("user", "first")
    restarted = InMemoryHoldingRepository(LocalJsonDataStore("local@example.test", path)).list_for_user("user")
    assert restarted == [refreshed]
    assert restarted[0].account_positions == original.account_positions
    assert restarted[0].security.price == original.security.price
    assert restarted[0].security.dividend_research_snapshot_id
    assert restarted[0].security.source_payout_details


def test_local_json_write_failure_rolls_back_memory_and_retains_disk_record(tmp_path, monkeypatch):
    path = tmp_path / "finance.json"
    store = LocalJsonDataStore("local@example.test", path)
    original = holding()
    store.holdings["user"] = [original]
    store.save()
    original_bytes = path.read_bytes()
    def fail_save():
        raise OSError("synthetic disk failure")
    monkeypatch.setattr(store, "save", fail_save)
    with pytest.raises(DividendResearchProviderError, match="Unable to save distribution"):
        RefreshHoldingDividends(InMemoryHoldingRepository(store), Provider(), today=lambda: TODAY).execute("user", "first")
    assert store.holdings["user"] == [original]
    assert path.read_bytes() == original_bytes
    restarted = InMemoryHoldingRepository(LocalJsonDataStore("local@example.test", path)).list_for_user("user")
    assert restarted == [original]
