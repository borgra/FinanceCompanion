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

