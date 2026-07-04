from fastapi.testclient import TestClient

from app.domain.models import VerifiedIdentity
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
    assert budget_payload[0]["id"] == "cat-housing"
    assert budget_payload[0]["subCategories"][0]["id"] == "sub-house"
    assert account_payload[0]["id"] == "acc-lfcu"
    assert account_payload[0]["monthlyRecords"][0]["month"] == "Jan-26"
    assert session_response.json()["email"] == "steveborgra@gmail.com"


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
