from test_api_contracts import authenticate, build_test_client


def _change(account, **overrides):
    payload = {key: value for key, value in account.items() if key not in {"createdAt", "updatedAt"}}
    payload.update(overrides)
    return payload


def test_accounts_batch_updates_atomically_and_validates_proposed_full_assignment_set():
    client = build_test_client()
    authenticate(client)
    original = client.get("/api/v1/accounts").json()
    investments = [item for item in original if item["type"] == "Investment"]
    first, second = investments[:2]

    saved = client.put("/api/v1/accounts/batch", json={"accounts": [
        _change(first, yearlyContribution=11111),
        _change(second, yearlyContribution=22222),
    ]})
    assert saved.status_code == 200
    assert [item["yearlyContribution"] for item in saved.json()] == [11111, 22222]

    invalid_first = _change(saved.json()[0], yearlyContribution=33333, assignedIncomeSourceIds=["income-source-primary"])
    valid_second = _change(saved.json()[1], yearlyContribution=44444)
    rejected = client.put("/api/v1/accounts/batch", json={"accounts": [invalid_first, valid_second]})
    assert rejected.status_code == 400
    assert rejected.json()["detail"] == "Income source is already assigned to another account."
    persisted = {item["id"]: item for item in client.get("/api/v1/accounts").json()}
    assert persisted[first["id"]]["yearlyContribution"] == 11111
    assert persisted[second["id"]]["yearlyContribution"] == 22222

    duplicate = client.put("/api/v1/accounts/batch", json={"accounts": [_change(first), _change(first)]})
    assert duplicate.status_code == 400
    missing = _change(first)
    missing["id"] = "acc-missing"
    assert client.put("/api/v1/accounts/batch", json={"accounts": [missing]}).status_code == 404
