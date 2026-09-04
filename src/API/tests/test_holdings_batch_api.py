from test_api_contracts import authenticate, build_test_client


def _create_holding(client, symbol: str):
    security = client.get("/api/v1/securities/search?q=vti").json()[0]
    security["symbol"] = symbol.upper()
    security["name"] = symbol.upper()
    security["price"] = 100
    response = client.post("/api/v1/holdings", json={
        "security": security,
        "accountPositions": [{"accountId": "acc-taxable-brokerage", "quantity": 1, "costBasis": None}],
    })
    assert response.status_code == 201
    return response.json()


def _change(holding, quantity):
    return {
        "id": holding["id"],
        "security": holding["security"],
        "accountPositions": [{"accountId": "acc-taxable-brokerage", "quantity": quantity, "costBasis": None}],
    }


def test_holdings_batch_updates_all_items_in_one_request_and_is_atomic_on_validation_failure():
    client = build_test_client()
    authenticate(client)
    first = _create_holding(client, "vti")
    second = _create_holding(client, "schd")

    saved = client.put("/api/v1/holdings/batch", json={"holdings": [_change(first, 5), _change(second, 7)]})
    assert saved.status_code == 200
    assert [item["accountPositions"][0]["quantity"] for item in saved.json()] == [5, 7]

    invalid = _change(second, 9)
    invalid["accountPositions"][0]["accountId"] = "missing-account"
    rejected = client.put("/api/v1/holdings/batch", json={"holdings": [_change(first, 8), invalid]})
    assert rejected.status_code == 400
    persisted = {item["id"]: item for item in client.get("/api/v1/holdings").json()}
    assert persisted[first["id"]]["accountPositions"][0]["quantity"] == 5
    assert persisted[second["id"]]["accountPositions"][0]["quantity"] == 7


def test_cash_is_canonical_across_create_update_batch_and_import_and_rejects_payments():
    client = build_test_client()
    authenticate(client)
    security = client.get("/api/v1/securities/search?q=vti").json()[0]
    security.update({
        "symbol": "legacy-cash",
        "name": "Checking balance",
        "exchange": "Legacy",
        "assetType": "Cash",
        "currency": "EUR",
        "price": 99,
    })
    created = client.post("/api/v1/holdings", json={
        "security": security,
        "accountPositions": [{"accountId": "acc-taxable-brokerage", "quantity": 4, "costBasis": None}],
    })
    assert created.status_code == 201
    cash = created.json()
    assert {key: cash["security"][key] for key in ("symbol", "name", "exchange", "assetType", "currency", "price")} == {
        "symbol": "CASH", "name": "Cash", "exchange": "Cash", "assetType": "Cash", "currency": "USD", "price": 1,
    }

    changed = {**cash["security"], "symbol": "other", "name": "Wrong", "exchange": "Other", "currency": "CAD", "price": 8}
    updated = client.put(f"/api/v1/holdings/{cash['id']}", json={
        "security": changed,
        "accountPositions": cash["accountPositions"],
    })
    assert updated.status_code == 200
    assert updated.json()["security"]["symbol"] == "CASH"
    assert updated.json()["security"]["price"] == 1

    batched_security = {**updated.json()["security"], "name": "Batch wrong", "price": 17}
    batched = client.put("/api/v1/holdings/batch", json={"holdings": [{
        "id": cash["id"], "security": batched_security, "accountPositions": cash["accountPositions"],
    }]})
    assert batched.status_code == 200
    assert batched.json()[0]["security"]["name"] == "Cash"
    imported = client.put("/api/v1/holdings/import", json={"rows": [{
        "symbol": "CASH", "name": "Imported wrong", "price": 22,
        "accountPositions": [{"accountId": "acc-taxable-brokerage", "quantity": 5}],
    }]})
    assert imported.status_code == 200
    assert imported.json()["holdings"][0]["security"]["price"] == 1
    assert imported.json()["holdings"][0]["security"]["name"] == "Cash"

    payment = client.put(f"/api/v1/holdings/{cash['id']}/manual-payouts", json={"manualPayoutDetails": []})
    assert payment.status_code == 400
    payment_import = client.put("/api/v1/holdings/manual-payouts/import", json={"rows": [{
        "symbol": "CASH", "payout": {"exDividendDate": "2026-01-01", "amount": 1},
    }]})
    assert payment_import.status_code == 400

