from test_api_contracts import authenticate, build_test_client
from test_retirement_plan_api import retirement_plan_payload


def test_workspace_requires_authentication():
    client = build_test_client()

    assert client.get('/api/v1/workspace').status_code == 401


def test_workspace_returns_the_complete_user_bootstrap_contract():
    client = build_test_client()
    authenticate(client)

    response = client.get('/api/v1/workspace')

    assert response.status_code == 200
    payload = response.json()
    assert payload['schemaVersion'] == 1
    assert payload['incomeSources'] == client.get('/api/v1/income-sources').json()
    assert payload['budgetCategories'] == client.get('/api/v1/budget/categories').json()
    assert payload['accounts'] == client.get('/api/v1/accounts').json()
    assert payload['holdings'] == client.get('/api/v1/holdings').json()
    assert payload['netWorth'] == client.get('/api/v1/net-worth').json()
    assert payload['retirementPlan'] is None

    saved_plan = client.put('/api/v1/retirement-plan', json=retirement_plan_payload())
    saved_net_worth = client.put('/api/v1/net-worth', json={'beginningNetWorth': 123456})
    updated = client.get('/api/v1/workspace').json()

    assert updated['retirementPlan'] == saved_plan.json()
    assert updated['netWorth'] == saved_net_worth.json()
