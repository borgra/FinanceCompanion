from test_api_contracts import authenticate, build_test_client


def test_net_worth_is_user_scoped_singleton_with_idempotent_put():
    client = build_test_client()
    authenticate(client)

    assert client.get('/api/v1/net-worth').status_code == 404

    first = client.put('/api/v1/net-worth', json={'beginningNetWorth': -1250.5})
    second = client.put('/api/v1/net-worth', json={'beginningNetWorth': -1250.5})
    fetched = client.get('/api/v1/net-worth')

    assert first.status_code == 200
    assert second.status_code == 200
    assert fetched.status_code == 200
    assert fetched.json()['beginningNetWorth'] == -1250.5
    assert fetched.json()['investmentSnapshots'] == {}
    assert first.json()['updatedAt']
    assert second.json()['updatedAt']


def test_investment_snapshots_are_persisted_without_overwriting_the_baseline():
    client = build_test_client()
    authenticate(client)

    snapshot = client.put(
        '/api/v1/net-worth/investment-snapshots/taxable-account/Jan-26',
        json={'value': 12345.67},
    )

    assert snapshot.status_code == 200
    assert snapshot.json()['beginningNetWorth'] is None
    assert snapshot.json()['investmentSnapshots'] == {
        'taxable-account': {'Jan-26': 12345.67},
    }

    baseline = client.put('/api/v1/net-worth', json={'beginningNetWorth': 100000})
    fetched = client.get('/api/v1/net-worth')

    assert baseline.status_code == 200
    assert baseline.json()['beginningNetWorth'] == 100000
    assert baseline.json()['investmentSnapshots'] == snapshot.json()['investmentSnapshots']
    assert fetched.json()['investmentSnapshots'] == snapshot.json()['investmentSnapshots']


def test_net_worth_rejects_non_finite_values_and_requires_authentication():
    client = build_test_client()

    assert client.get('/api/v1/net-worth').status_code == 401
    assert client.put(
        '/api/v1/net-worth/investment-snapshots/account/Jan-26',
        json={'value': 1},
    ).status_code == 401
    authenticate(client)

    for value in ('Infinity', '-Infinity', 'NaN'):
        response = client.put('/api/v1/net-worth', json={'beginningNetWorth': value})
        assert response.status_code == 422
        snapshot_response = client.put(
            '/api/v1/net-worth/investment-snapshots/account/Jan-26',
            json={'value': value},
        )
        assert snapshot_response.status_code == 422
def test_mortgage_configuration_and_schedule_are_preserved_with_snapshots():
    client = build_test_client()
    authenticate(client)

    configured = client.put('/api/v1/net-worth/configuration', json={'trackMortgageInNetWorth': True})
    assert configured.status_code == 200
    assert configured.json()['trackMortgageInNetWorth'] is True

    schedule = {
        'houseValue': 800000,
        'startingOutstandingMortgage': 361031,
        'annualInterestRate': 0.065,
        'monthlyPrincipalPayment': 971.97,
        'monthlyAdditionalPrincipalPayment': 300,
        'scheduleStartMonth': '2026-01',
    }
    saved = client.put('/api/v1/net-worth/mortgage-schedule', json=schedule)
    assert saved.status_code == 200
    assert saved.json()['mortgageSchedule'] == {**schedule, 'principalOverrides': {}, 'extraPrincipalOverrides': {}}

    snapshots = client.put('/api/v1/net-worth/investment-snapshots', json={
        'investmentSnapshots': {'taxable': {'Jan-26': 5000}},
    })
    assert snapshots.status_code == 200
    assert snapshots.json()['trackMortgageInNetWorth'] is True
    assert snapshots.json()['mortgageSchedule'] == {**schedule, 'principalOverrides': {}, 'extraPrincipalOverrides': {}}


def test_mortgage_schedule_requires_paydown_when_balance_remains():
    client = build_test_client()
    authenticate(client)
    response = client.put('/api/v1/net-worth/mortgage-schedule', json={
        'houseValue': 800000,
        'startingOutstandingMortgage': 361031,
        'annualInterestRate': 0.065,
        'monthlyPrincipalPayment': 0,
        'monthlyAdditionalPrincipalPayment': 0,
        'scheduleStartMonth': '2026-01',
    })
    assert response.status_code == 422



def test_mortgage_schedule_accepts_sparse_table_overrides():
    client = build_test_client()
    authenticate(client)
    response = client.put('/api/v1/net-worth/mortgage-schedule', json={
        'houseValue': 800000,
        'startingOutstandingMortgage': 361031,
        'annualInterestRate': 0.02875,
        'monthlyPrincipalPayment': 971.97,
        'monthlyAdditionalPrincipalPayment': 300,
        'scheduleStartMonth': '2026-01',
        'principalOverrides': {'2026-01:0': 971.97},
        'extraPrincipalOverrides': {'2026-01:0': 300},
    })
    assert response.status_code == 200, response.text


def test_mortgage_schedule_accepts_fill_down_overrides_without_base_payment():
    client = build_test_client()
    authenticate(client)
    response = client.put('/api/v1/net-worth/mortgage-schedule', json={
        'houseValue': 800000,
        'startingOutstandingMortgage': 320000,
        'annualInterestRate': 0.02875,
        'monthlyPrincipalPayment': 0,
        'monthlyAdditionalPrincipalPayment': 0,
        'scheduleStartMonth': '2026-01',
        'principalOverrides': {'2026-01:0': 1500, '2026-01:1': 1500},
        'extraPrincipalOverrides': {'2026-01:0': 300, '2026-01:1': 300},
    })
    assert response.status_code == 200, response.text


def test_deleting_mortgage_schedule_preserves_other_net_worth_data():
    client = build_test_client()
    authenticate(client)
    client.put('/api/v1/net-worth/configuration', json={'trackMortgageInNetWorth': True})
    client.put('/api/v1/net-worth/mortgage-schedule', json={
        'houseValue': 800000,
        'startingOutstandingMortgage': 320000,
        'annualInterestRate': 0.0375,
        'monthlyPrincipalPayment': 981.13,
        'monthlyAdditionalPrincipalPayment': 300,
        'scheduleStartMonth': '2025-03',
    })
    response = client.delete('/api/v1/net-worth/mortgage-schedule')
    assert response.status_code == 200
    schedule = response.json()['mortgageSchedule']
    assert schedule == {
        'houseValue': 800000,
        'startingOutstandingMortgage': 0,
        'annualInterestRate': 0.0375,
        'monthlyPrincipalPayment': 0,
        'monthlyAdditionalPrincipalPayment': 0,
        'scheduleStartMonth': '2025-03',
        'principalOverrides': {},
        'extraPrincipalOverrides': {},
    }
    assert response.json()['trackMortgageInNetWorth'] is True
