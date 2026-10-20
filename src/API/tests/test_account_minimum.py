import json
from dataclasses import replace
from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from azure.data.tables import UpdateMode
from pydantic import ValidationError

from app.domain.exceptions import NotFoundError
from app.infrastructure.cosmos_repositories import CosmosAccountRepository, _account_to_entity
from app.infrastructure.in_memory_repositories import InMemoryAccountRepository, InMemoryDataStore
from app.infrastructure.local_json_store import LocalJsonDataStore
from app.presentation.http.mappers import to_account
from app.presentation.http.schemas import AccountUpsertRequest
from test_api_contracts import authenticate, build_test_client


def payload(**overrides):
    return {
        "name": "Minimum checking", "type": "Checking", "startingBalance": 150,
        "startDate": "2026-01-01", "yieldRate": 0, **overrides,
    }


def account(value="123.45"):
    return to_account("minimum-test", AccountUpsertRequest(**payload(minimumAmount=value)), "created", "updated")


@pytest.mark.parametrize("value", [None, "", "  ", 0, "0", "0.00"])
def test_blank_and_zero_minimum_normalize_to_null(value):
    assert AccountUpsertRequest(**payload(minimumAmount=value)).minimum_amount is None


@pytest.mark.parametrize("value", ["100", " 100.01 ", 100.01, "999999999.99", 999999999.99, "0.01"])
def test_minimum_accepts_exact_decimal_money(value):
    actual = AccountUpsertRequest(**payload(minimumAmount=value)).minimum_amount
    assert actual == Decimal(str(value).strip()).quantize(Decimal("0.01"))


@pytest.mark.parametrize("value", [
    -1, "-1", "-0", True, [], {}, "abc", "1,000", ".5", "1.", "+1", "1e2",
    "1.001", "1.000", 1.001, "1000000000", 1000000000, "NaN", "Infinity", float("nan"), float("inf"),
])
def test_minimum_rejects_invalid_money(value):
    with pytest.raises(ValidationError):
        AccountUpsertRequest(**payload(minimumAmount=value))


def test_api_create_preserve_batch_clear_and_rejected_save():
    client = build_test_client()
    authenticate(client)
    saved = client.post("/api/v1/accounts", json=payload(minimumAmount="100.25"))
    assert saved.status_code == 201
    created = saved.json()
    assert created["minimumAmount"] == 100.25
    account_id = created["id"]

    update = payload(name="Renamed account", monthlyRecords=[{
        "month": "Oct-26", "credit": 200, "outflows": {}, "invest": 0, "savings": 0,
    }])
    assert client.put(f"/api/v1/accounts/{account_id}", json=update).json()["minimumAmount"] == 100.25
    batch = client.put("/api/v1/accounts/batch", json={"accounts": [{"id": account_id, **update}]})
    assert batch.status_code == 200
    assert batch.json()[0]["minimumAmount"] == 100.25

    rejected = client.put(f"/api/v1/accounts/{account_id}", json=payload(minimumAmount="100.001"))
    assert rejected.status_code == 422
    assert next(item for item in client.get("/api/v1/accounts").json() if item["id"] == account_id)["minimumAmount"] == 100.25

    cleared = client.put("/api/v1/accounts/batch", json={"accounts": [{"id": account_id, **payload(minimumAmount=0)}]})
    assert cleared.json()[0]["minimumAmount"] is None
    assert client.put(f"/api/v1/accounts/{account_id}", json=payload(minimumAmount="0.01")).json()["minimumAmount"] == 0.01
    assert client.put(f"/api/v1/accounts/{account_id}", json=payload(minimumAmount=None)).json()["minimumAmount"] is None


def test_account_minimum_remains_scoped_to_owner_in_api():
    client = build_test_client()
    authenticate(client)
    repository = client.app.state.container.create_account._repository
    repository.create_for_user("other-user", account("999.99"))
    assert all(item["id"] != "minimum-test" for item in client.get("/api/v1/accounts").json())
    assert client.put("/api/v1/accounts/minimum-test", json=payload(minimumAmount=10)).status_code == 404
    assert client.put("/api/v1/accounts/batch", json={"accounts": [{"id": "minimum-test", **payload(minimumAmount=10)}]}).status_code == 404
    assert repository.list_for_user("other-user")[0].minimum_amount == Decimal("999.99")


def test_memory_roundtrip_and_owner_isolation():
    repository = InMemoryAccountRepository(InMemoryDataStore("local@example.test"))
    repository.create_for_user("owner", account("999999999.99"))
    assert repository.list_for_user("owner")[0].minimum_amount == Decimal("999999999.99")
    assert repository.list_for_user("other") == []
    with pytest.raises(NotFoundError):
        repository.update_for_user("other", "minimum-test", account())


def test_local_json_roundtrip_legacy_defaults_and_clear(tmp_path):
    path = tmp_path / "minimum.json"
    store = LocalJsonDataStore("local@example.test", path)
    store.accounts["owner"] = [account("999999999.99")]
    store.save()
    assert json.loads(path.read_text())["accounts"]["owner"][0]["minimumAmount"] == "999999999.99"
    restored = LocalJsonDataStore("local@example.test", path)
    assert restored.accounts["owner"][0].minimum_amount == Decimal("999999999.99")
    restored.accounts["owner"][0] = replace(restored.accounts["owner"][0], minimum_amount=None)
    restored.save()
    assert LocalJsonDataStore("local@example.test", path).accounts["owner"][0].minimum_amount is None
    data = json.loads(path.read_text())
    del data["accounts"]["owner"][0]["minimumAmount"]
    path.write_text(json.dumps(data))
    assert LocalJsonDataStore("local@example.test", path).accounts["owner"][0].minimum_amount is None


def test_cosmos_exact_roundtrip_legacy_and_clearing_replaces_entity():
    client = MagicMock()
    repository = CosmosAccountRepository(client)
    repository.create_for_user("owner", account("999999999.99"))
    entity = client.create_entity.call_args.args[0]
    assert entity["minimumAmount"] == "999999999.99"
    client.query_entities.return_value = [entity]
    assert repository.list_for_user("owner")[0].minimum_amount == Decimal("999999999.99")
    client.query_entities.assert_called_with("PartitionKey eq 'owner'")
    client.get_entity.return_value = entity
    repository.update_for_user("owner", "minimum-test", account(None))
    assert client.upsert_entity.call_args.args[0]["minimumAmount"] is None
    assert client.upsert_entity.call_args.kwargs["mode"] is UpdateMode.REPLACE
    repository.update_batch_for_user("owner", [account(None)])
    operation = client.submit_transaction.call_args.args[0][0]
    assert operation[1]["minimumAmount"] is None
    assert operation[2]["mode"] is UpdateMode.REPLACE
    legacy = _account_to_entity("owner", account())
    del legacy["minimumAmount"]
    client.query_entities.return_value = [legacy]
    assert repository.list_for_user("owner")[0].minimum_amount is None
