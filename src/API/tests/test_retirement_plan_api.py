from app.domain.models import User

from test_api_contracts import authenticate, build_test_client


def retirement_plan_payload(**overrides):
    payload = {
        "id": "ignored-client-id",
        "name": "Ignored client name",
        "currentAge": 45,
        "retirementAge": 58,
        "longevityAge": 95,
        "annualRoiPercent": 6.5,
        "withdrawalRatePercent": 4,
        "annualRetirementExpense": 72000,
        "withdrawalMode": "meet_expense",
        "taxableContribution": {
            "monthlyAmount": 500,
            "annualIncreasePercent": 3,
            "endAge": 60,
        },
        "retirementContribution": {
            "monthlyAmount": 750,
            "annualIncreasePercent": 2,
            "endAge": 65,
        },
        "expenseChanges": [
            {"age": 63, "percentChange": -20, "label": "Mortgage paid off"}
        ],
        "socialSecurity": {
            "enabled": True,
            "claimAge": 67,
            "monthlyBenefit": 2800,
            "annualColaPercent": 2,
        },
        "includeHsaInRetirement": False,
    }
    payload.update(overrides)
    return payload


def test_retirement_plan_requires_authentication_and_starts_unconfigured():
    client = build_test_client()

    assert client.get("/api/v1/retirement-plan").status_code == 401
    assert client.put("/api/v1/retirement-plan", json=retirement_plan_payload()).status_code == 401

    authenticate(client)
    response = client.get("/api/v1/retirement-plan")
    assert response.status_code == 404


def test_retirement_plan_round_trip_is_a_user_owned_base_plan():
    client = build_test_client()
    authenticate(client)

    saved = client.put("/api/v1/retirement-plan", json=retirement_plan_payload())
    fetched = client.get("/api/v1/retirement-plan")

    assert saved.status_code == 200, saved.text
    assert fetched.status_code == 200
    assert saved.json() == fetched.json()
    assert fetched.json()["id"] == "base-plan"
    assert fetched.json()["name"] == "Base Plan"
    assert fetched.json()["taxableContribution"]["monthlyAmount"] == 500
    assert fetched.json()["retirementContribution"]["monthlyAmount"] == 750
    assert fetched.json()["expenseChanges"][0]["label"] == "Mortgage paid off"
    assert fetched.json()["updatedAt"]


def test_invalid_retirement_plan_does_not_replace_the_last_saved_plan():
    client = build_test_client()
    authenticate(client)
    first = client.put("/api/v1/retirement-plan", json=retirement_plan_payload())
    assert first.status_code == 200

    invalid = retirement_plan_payload(retirementAge=44, annualRetirementExpense=-1)
    rejected = client.put("/api/v1/retirement-plan", json=invalid)
    fetched = client.get("/api/v1/retirement-plan")

    assert rejected.status_code == 422
    assert fetched.status_code == 200
    assert fetched.json() == first.json()


def test_retirement_plan_rejects_non_finite_and_out_of_horizon_inputs():
    client = build_test_client()
    authenticate(client)

    invalid_claim = client.put(
        "/api/v1/retirement-plan",
        json=retirement_plan_payload(
            longevityAge=66,
            socialSecurity={
                "enabled": True,
                "claimAge": 67,
                "monthlyBenefit": 1000,
                "annualColaPercent": 0,
            },
        ),
    )
    non_finite = client.put(
        "/api/v1/retirement-plan",
        json=retirement_plan_payload(annualRoiPercent="NaN"),
    )

    assert invalid_claim.status_code == 422
    assert non_finite.status_code == 422


def test_retirement_plan_rejects_pre_retirement_duplicate_and_fractional_event_ages():
    client = build_test_client()
    authenticate(client)

    before_retirement = client.put(
        "/api/v1/retirement-plan",
        json=retirement_plan_payload(expenseChanges=[{"age": 57, "percentChange": -10, "label": "Too early"}]),
    )
    duplicate_age = client.put(
        "/api/v1/retirement-plan",
        json=retirement_plan_payload(expenseChanges=[
            {"age": 63, "percentChange": -10, "label": "One"},
            {"age": 63, "percentChange": 5, "label": "Two"},
        ]),
    )
    fractional_age = client.put(
        "/api/v1/retirement-plan",
        json=retirement_plan_payload(expenseChanges=[{"age": 63.5, "percentChange": -10, "label": "Fractional"}]),
    )
    long_label = client.put(
        "/api/v1/retirement-plan",
        json=retirement_plan_payload(expenseChanges=[{"age": 63, "percentChange": -10, "label": "x" * 121}]),
    )

    assert before_retirement.status_code == 422
    assert duplicate_age.status_code == 422
    assert fractional_age.status_code == 422
    assert long_label.status_code == 422


def test_retirement_plan_is_isolated_between_two_authenticated_users():
    client = build_test_client()
    token_service = client.app.state.container.session_tokens
    first_token = token_service.issue(User(id="retirement-user-a", email="a@example.com", display_name="A"))
    second_token = token_service.issue(User(id="retirement-user-b", email="b@example.com", display_name="B"))

    saved = client.put(
        "/api/v1/retirement-plan",
        json=retirement_plan_payload(),
        headers={"Authorization": f"Bearer {first_token}"},
    )
    invisible = client.get(
        "/api/v1/retirement-plan",
        headers={"Authorization": f"Bearer {second_token}"},
    )
    fetched_by_owner = client.get(
        "/api/v1/retirement-plan",
        headers={"Authorization": f"Bearer {first_token}"},
    )

    assert saved.status_code == 200
    assert invisible.status_code == 404
    assert fetched_by_owner.status_code == 200
    assert fetched_by_owner.json() == saved.json()


def test_disabled_social_security_claim_age_must_be_within_horizon_without_replacing_saved_plan():
    client = build_test_client()
    authenticate(client)
    saved = client.put("/api/v1/retirement-plan", json=retirement_plan_payload())
    assert saved.status_code == 200

    rejected = client.put(
        "/api/v1/retirement-plan",
        json=retirement_plan_payload(
            longevityAge=66,
            socialSecurity={
                "enabled": False,
                "claimAge": 67,
                "monthlyBenefit": 0,
                "annualColaPercent": 0,
            },
        ),
    )
    fetched = client.get("/api/v1/retirement-plan")

    assert rejected.status_code == 422
    assert fetched.status_code == 200
    assert fetched.json() == saved.json()
