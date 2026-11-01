from dataclasses import replace
import json
from unittest.mock import MagicMock

from app.application.use_cases.holdings import ImportHoldingDetails
from app.domain.models import HoldingAccountPosition
from app.infrastructure.cosmos_repositories import (
    CosmosHoldingRepository,
    _security_metadata_from_dict,
    _security_metadata_to_dict,
)
from app.infrastructure.in_memory_repositories import InMemoryHoldingRepository
from app.infrastructure.local_json_store import LocalJsonDataStore
from app.presentation.http.mappers import to_security_metadata, to_security_metadata_payload


def researched(store):
    holding = store.holdings['user-steve'][0]
    return replace(holding, security=replace(holding.security,
        price=123.45, price_as_of='2026-10-30', price_basis='latest_close',
        price_source_url='https://www.nasdaq.com/market-activity/etf/vti',
    ))


def assert_provenance(security):
    assert security.price == 123.45
    assert security.price_as_of == '2026-10-30'
    assert security.price_basis == 'latest_close'
    assert security.price_source_url == 'https://www.nasdaq.com/market-activity/etf/vti'


def test_price_provenance_survives_local_restart_and_http_mapping(tmp_path):
    path = tmp_path / 'finance.json'
    store = LocalJsonDataStore('local@example.test', path)
    holding = researched(store)
    InMemoryHoldingRepository(store).update_for_user('user-steve', holding.id, holding)
    store.save()

    restored = LocalJsonDataStore('local@example.test', path).holdings['user-steve'][0]
    assert_provenance(restored.security)
    payload = to_security_metadata_payload(restored.security)
    serialized = payload.model_dump(by_alias=True)
    assert serialized['priceAsOf'] == '2026-10-30'
    assert serialized['priceBasis'] == 'latest_close'
    assert serialized['priceSourceUrl'] == restored.security.price_source_url
    assert_provenance(to_security_metadata(payload))


def test_price_provenance_survives_cosmos_current_and_legacy_storage(tmp_path):
    store = LocalJsonDataStore('local@example.test', tmp_path / 'finance.json')
    holding = researched(store)
    assert_provenance(_security_metadata_from_dict(_security_metadata_to_dict(holding.security)))

    client = MagicMock()
    client.get_entity.return_value = {'PartitionKey': 'user-steve', 'RowKey': f'holding:{holding.id}'}
    repository = CosmosHoldingRepository(client)
    repository.update_for_user('user-steve', holding.id, holding)
    entity = client.upsert_entity.call_args.args[0]
    assert json.loads(entity['securityDetails'])['priceAsOf'] == '2026-10-30'
    client.query_entities.return_value = [entity]
    assert_provenance(repository.list_for_user('user-steve')[0].security)


def test_manual_price_import_clears_researched_price_attribution(tmp_path):
    store = LocalJsonDataStore('local@example.test', tmp_path / 'finance.json')
    holding = researched(store)
    repository = InMemoryHoldingRepository(store)
    repository.update_for_user('user-steve', holding.id, holding)
    updated, unmatched = ImportHoldingDetails(repository).execute('user-steve', [
        (holding.security.symbol, holding.security.name, 124.0,
         [HoldingAccountPosition('acc-taxable-brokerage', 1, None)], False, None),
    ])
    assert unmatched == []
    assert updated[0].security.price == 124.0
    assert updated[0].security.price_as_of is None
    assert updated[0].security.price_basis is None
    assert updated[0].security.price_source_url is None
