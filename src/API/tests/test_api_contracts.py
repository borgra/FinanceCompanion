from fastapi.testclient import TestClient

from app.application.use_cases.security_details import (
    RefreshHeldSecurityDetails,
    RefreshHoldingSecurityDetails,
)
from app.application.use_cases.security_search import SearchSecurities
from app.domain.models import SecurityMetadata, SecurityPayoutDetails, VerifiedIdentity
from app.infrastructure.settings import Settings
from app.main import create_app
from app.presentation.http.container import build_container

TEST_SESSION_SECRET = "test-secret-123456789012345678901234567890"


class FakeVerifier:
    def verify(self, token: str, client_id: str | None, tenant_id: str | None) -> VerifiedIdentity:
        return VerifiedIdentity(
            subject="entra-subject-1",
            object_id="entra-object-1",
            tenant_id="entra-tenant-1",
            email="steveborgra@gmail.com",
            display_name="Steve Borgra",
        )


class FakeSecuritySearchProvider:
    def search(self, query: str):
        if query.casefold() != "vti":
            return []

        from app.domain.models import SecurityMetadata

        return [
            SecurityMetadata(
                symbol="VTI",
                name="Vanguard Total Stock Market ETF",
                exchange="United States",
                asset_type="ETF",
                currency="USD",
            )
        ]


class FakeSecurityDetailsProvider:
    def get_details(self, security: SecurityMetadata) -> SecurityMetadata:
        return SecurityMetadata(
            symbol=security.symbol,
            name=security.name,
            exchange="NYSE Arca",
            asset_type=security.asset_type,
            currency=security.currency,
            price=321.45,
            sector="Diversified",
            industry="Broad Market",
            pe_ratio=24.2,
            thirty_day_yield=0.013,
            fifty_two_week_low=255,
            fifty_two_week_high=320,
            dividend_previous_year=3.55,
            dividend_current_year=3.72,
            dividend_growth_rate=0.0479,
            estimated_future_payout=3.72,
            dividend_status="recent",
            sma20=312,
            sma50=307,
            sma200=291,
            details_status="fresh",
            payout_details=[
                SecurityPayoutDetails(
                    ex_dividend_date="2026-06-28",
                    amount=0.45,
                    declaration_date="2026-06-10",
                    record_date="2026-06-29",
                    payment_date="2026-07-02",
                    source="dividends",
                )
            ],
        )


def build_test_client() -> TestClient:
    settings = Settings(
        allowed_email="steveborgra@gmail.com",
        session_secret=TEST_SESSION_SECRET,
        cors_origins=["http://localhost:5173"],
        entra_client_id="entra-client-id",
        entra_tenant_id="entra-tenant-id",
    )
    app = create_app(settings)
    app.state.container = build_container(settings, verifier=FakeVerifier())
    app.state.container.search_securities = SearchSecurities(FakeSecuritySearchProvider())
    details_provider = FakeSecurityDetailsProvider()
    app.state.container.refresh_holding_security_details = RefreshHoldingSecurityDetails(
        app.state.container.create_holding._repository,
        details_provider,
    )
    app.state.container.refresh_held_security_details = RefreshHeldSecurityDetails(
        app.state.container.create_holding._repository,
        details_provider,
    )
    return TestClient(app)


def authenticate(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/entra/verify",
        json={"idToken": "test-id-token"},
    )
    assert response.status_code == 200
    assert "finance_companion_session" in response.cookies
    payload = response.json()
    assert payload["user"]["email"] == "steveborgra@gmail.com"
    return response.cookies["finance_companion_session"]


def test_budget_and_accounts_are_protected():
    client = build_test_client()

    response = client.get("/api/v1/budget/categories")

    assert response.status_code == 401


def test_seeded_contracts_are_served_after_authentication():
    client = build_test_client()
    authenticate(client)

    income_response = client.get("/api/v1/income-sources")
    budget_response = client.get("/api/v1/budget/categories")
    account_response = client.get("/api/v1/accounts")
    session_response = client.get("/api/v1/auth/session")

    assert income_response.status_code == 200
    assert budget_response.status_code == 200
    assert account_response.status_code == 200
    assert session_response.status_code == 200

    income_payload = income_response.json()
    budget_payload = budget_response.json()
    account_payload = account_response.json()

    assert income_payload[0]["id"] == "income-source-primary"
    assert income_payload[1]["id"] == "income-source-side"
    assert {source["id"] for source in income_payload} == {
        "income-source-primary",
        "income-source-side",
        "income-source-bonus",
        "income-source-dividends",
    }
    assert budget_payload[0]["id"] == "cat-housing"
    assert budget_payload[0]["isEssential"] is True
    assert budget_payload[0]["subCategories"][0]["id"] == "sub-house"
    assert len(budget_payload) == 11
    assert any(category["id"] == "cat-savings" for category in budget_payload)
    assert next(category for category in budget_payload if category["id"] == "cat-savings")["isEssential"] is False
    assert account_payload[0]["id"] == "acc-lfcu"
    assert account_payload[0]["assignedIncomeSourceIds"] == ["income-source-primary", "income-source-side"]
    assert account_payload[0]["savingsAccountId"] == "acc-hys"
    assert account_payload[0]["monthlyRecords"][0]["month"] == "Jan-26"
    investment_accounts = [account for account in account_payload if account["type"] == "Investment"]
    assert {account["investmentAccountType"] for account in investment_accounts} == {
        "Taxable",
        "401k",
        "IRA",
        "HSA",
    }
    assert next(
        account for account in investment_accounts if account["id"] == "acc-401k"
    )["employerIncomeSourceId"] == "income-source-primary"
    assert next(
        account for account in investment_accounts if account["id"] == "acc-401k"
    )["manageHoldings"] is False
    assert next(
        account for account in investment_accounts if account["id"] == "acc-taxable-brokerage"
    )["manageHoldings"] is True
    taxable_account = next(
        account for account in investment_accounts if account["id"] == "acc-taxable-brokerage"
    )
    ira_account = next(account for account in investment_accounts if account["id"] == "acc-roth-ira")
    assert taxable_account["monthlyRecords"][0]["invest"] == 1800
    assert ira_account["monthlyRecords"][0]["invest"] == 900
    assert (
        taxable_account["monthlyRecords"][0]["invest"]
        + ira_account["monthlyRecords"][0]["invest"]
    ) == account_payload[0]["monthlyRecords"][0]["invest"]
    assert session_response.json()["email"] == "steveborgra@gmail.com"


def test_budget_category_essential_classification_persists_through_updates():
    client = build_test_client()
    authenticate(client)

    created = client.post(
        "/api/v1/budget/categories",
        json={
            "name": "Investing",
            "colorHex": "#a78bfa",
            "icon": "savings",
            "isEssential": False,
        },
    )

    assert created.status_code == 201
    category = created.json()
    assert category["isEssential"] is False

    updated = client.put(
        f"/api/v1/budget/categories/{category['id']}",
        json={
            "name": "Investing",
            "colorHex": "#a78bfa",
            "icon": "savings",
            "isEssential": True,
        },
    )

    assert updated.status_code == 200
    assert updated.json()["isEssential"] is True
    listed = client.get("/api/v1/budget/categories")
    assert next(item for item in listed.json() if item["id"] == category["id"])["isEssential"] is True


def test_income_source_can_only_be_assigned_to_one_account():
    client = build_test_client()
    authenticate(client)

    response = client.post(
        "/api/v1/accounts",
        json={
            "name": "Duplicate income account",
            "type": "Checking",
            "startingBalance": 0,
            "startDate": "2026-01-01",
            "yieldRate": 0,
            "assignedIncomeSourceIds": ["income-source-primary"],
            "columns": [],
            "monthlyRecords": [],
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Income source is already assigned to another account."


def test_security_can_be_searched_and_added_to_multiple_accounts():
    client = build_test_client()
    authenticate(client)

    search_response = client.get("/api/v1/securities/search?q=vti")

    assert search_response.status_code == 200
    security = search_response.json()[0]
    assert security["symbol"] == "VTI"
    assert security["assetType"] == "ETF"

    create_response = client.post(
        "/api/v1/holdings",
        json={
            "security": security,
            "accountPositions": [
                {"accountId": "acc-taxable-brokerage", "quantity": 12.5, "costBasis": 3100},
                {"accountId": "acc-roth-ira", "quantity": 4, "costBasis": 990},
            ],
        },
    )

    assert create_response.status_code == 201
    payload = create_response.json()
    assert payload["security"]["symbol"] == "VTI"
    assert payload["security"]["name"] == "Vanguard Total Stock Market ETF"
    assert [item["accountId"] for item in payload["accountPositions"]] == [
        "acc-taxable-brokerage",
        "acc-roth-ira",
    ]

    holdings_response = client.get("/api/v1/holdings")
    assert holdings_response.status_code == 200
    assert any(item["security"]["symbol"] == "VTI" for item in holdings_response.json())


def test_security_details_refresh_persists_stock_and_payout_details():
    client = build_test_client()
    authenticate(client)

    security = client.get("/api/v1/securities/search?q=vti").json()[0]
    create_response = client.post(
        "/api/v1/holdings",
        json={
            "security": security,
            "accountPositions": [
                {"accountId": "acc-taxable-brokerage", "quantity": 12.5, "costBasis": 3100},
            ],
        },
    )
    assert create_response.status_code == 201
    holding_id = create_response.json()["id"]

    refresh_response = client.post(f"/api/v1/holdings/{holding_id}/security-details/refresh")

    assert refresh_response.status_code == 200
    refreshed_security = refresh_response.json()["security"]
    assert refreshed_security["price"] == 321.45
    assert refreshed_security["peRatio"] == 24.2
    assert refreshed_security["estimatedFuturePayout"] == 3.72
    assert refreshed_security["dividendStatus"] == "recent"
    assert refreshed_security["payoutDetails"] == [
        {
            "exDividendDate": "2026-06-28",
            "amount": 0.45,
            "declarationDate": "2026-06-10",
            "recordDate": "2026-06-29",
                "paymentDate": "2026-07-02",
                "source": "dividends",
                "mode": "source",
            }
        ]

    holdings_response = client.get("/api/v1/holdings")

    assert holdings_response.status_code == 200
    persisted_security = next(
        item["security"]
        for item in holdings_response.json()
        if item["id"] == holding_id
    )
    assert persisted_security["price"] == 321.45
    assert persisted_security["payoutDetails"][0]["paymentDate"] == "2026-07-02"


def test_existing_security_add_reuses_holding_and_keeps_saved_details():
    client = build_test_client()
    authenticate(client)

    security = client.get("/api/v1/securities/search?q=vti").json()[0]
    first_response = client.post(
        "/api/v1/holdings",
        json={
            "security": security,
            "accountPositions": [
                {"accountId": "acc-taxable-brokerage", "quantity": 12.5, "costBasis": 3100},
            ],
        },
    )
    assert first_response.status_code == 201
    holding_id = first_response.json()["id"]
    refresh_response = client.post(f"/api/v1/holdings/{holding_id}/security-details/refresh")
    assert refresh_response.status_code == 200

    second_response = client.post(
        "/api/v1/holdings",
        json={
            "security": security,
            "accountPositions": [
                {"accountId": "acc-taxable-brokerage", "quantity": 0, "costBasis": None},
                {"accountId": "acc-roth-ira", "quantity": 0, "costBasis": None},
            ],
        },
    )

    assert second_response.status_code == 201
    payload = second_response.json()
    assert payload["id"] == holding_id
    assert payload["security"]["price"] == 321.45
    assert payload["security"]["payoutDetails"][0]["exDividendDate"] == "2026-06-28"
    assert payload["accountPositions"] == [
        {"accountId": "acc-taxable-brokerage", "quantity": 12.5, "costBasis": 3100},
        {"accountId": "acc-roth-ira", "quantity": 0, "costBasis": None},
    ]

    holdings_response = client.get("/api/v1/holdings")
    assert holdings_response.status_code == 200
    assert len([
        item
        for item in holdings_response.json()
        if item["security"]["symbol"] == "VTI"
    ]) == 1


def test_manual_payouts_persist_until_a_refresh_explicitly_replaces_them():
    client = build_test_client()
    authenticate(client)
    holding_id = "holding-jepq"

    manual_response = client.put(
        f"/api/v1/holdings/{holding_id}/manual-payouts",
        json={
            "manualPayoutDetails": [
                {
                    "exDividendDate": "2025-09-02",
                    "paymentDate": "2025-09-05",
                    "amount": 0.44195,
                    "source": "user",
                }
            ]
        },
    )

    assert manual_response.status_code == 200
    assert manual_response.json()["security"]["payoutDetails"][0]["paymentDate"] == "2025-09-05"
    assert manual_response.json()["security"]["payoutDetails"][0]["mode"] == "manual"

    preserved_response = client.post(f"/api/v1/holdings/{holding_id}/security-details/refresh")

    assert preserved_response.status_code == 200
    assert preserved_response.json()["security"]["payoutDetails"][0]["mode"] == "manual"

    replaced_response = client.post(
        f"/api/v1/holdings/{holding_id}/security-details/refresh",
        json={"replaceManualPayouts": True},
    )

    assert replaced_response.status_code == 200
    assert replaced_response.json()["security"]["manualPayoutDetails"] == []
    assert replaced_response.json()["security"]["payoutDetails"][0]["mode"] == "source"


def test_delete_holding_removes_security_from_holdings():
    client = build_test_client()
    authenticate(client)

    security = client.get("/api/v1/securities/search?q=vti").json()[0]
    create_response = client.post(
        "/api/v1/holdings",
        json={
            "security": security,
            "accountPositions": [
                {"accountId": "acc-taxable-brokerage", "quantity": 12.5, "costBasis": 3100},
            ],
        },
    )
    assert create_response.status_code == 201
    holding_id = create_response.json()["id"]

    delete_response = client.delete(f"/api/v1/holdings/{holding_id}")

    assert delete_response.status_code == 204
    holdings_response = client.get("/api/v1/holdings")
    assert holdings_response.status_code == 200
    assert all(item["id"] != holding_id for item in holdings_response.json())


def test_logout_clears_the_cookie_session():
    client = build_test_client()
    authenticate(client)

    logout_response = client.post("/api/v1/auth/logout")
    session_response = client.get("/api/v1/auth/session")

    assert logout_response.status_code == 204
    assert session_response.status_code == 401


def test_server_side_entra_settings_are_used_instead_of_request_overrides():
    client = build_test_client()

    response = client.post(
        "/api/v1/auth/entra/verify",
        json={"idToken": "test-id-token", "clientId": "wrong-client", "tenantId": "wrong-tenant"},
    )

    assert response.status_code == 200


def test_holding_import_updates_matching_tickers_and_rejects_invalid_rows():
    client = build_test_client()
    authenticate(client)
    security = client.get("/api/v1/securities/search?q=vti").json()[0]
    created = client.post("/api/v1/holdings", json={
        "security": security,
        "accountPositions": [{"accountId": "acc-taxable-brokerage", "quantity": 1, "costBasis": None}],
    })
    assert created.status_code == 201

    response = client.put("/api/v1/holdings/import", json={"rows": [
        {"symbol": "VTI", "name": "Vanguard Total Market", "price": 325.25},
        {"symbol": "NONE", "name": "Unknown", "price": 12.0},
    ]})
    assert response.status_code == 200
    assert response.json()["holdings"][0]["security"]["name"] == "Vanguard Total Market"
    assert response.json()["holdings"][0]["security"]["price"] == 325.25
    assert response.json()["unmatchedSymbols"] == ["NONE"]

    invalid = client.put("/api/v1/holdings/import", json={"rows": [
        {"symbol": "VTI", "name": "Vanguard", "price": 1},
        {"symbol": "vti", "name": "Duplicate", "price": 2},
    ]})
    assert invalid.status_code == 400

    invalid_price = client.put("/api/v1/holdings/import", json={"rows": [
        {"symbol": "VTI", "name": "Vanguard", "price": 0},
    ]})
    assert invalid_price.status_code == 422
