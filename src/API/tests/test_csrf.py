import pytest
from fastapi.testclient import TestClient

from app.domain.models import VerifiedIdentity
from app.infrastructure.settings import Settings
from app.main import create_app
from app.presentation.http.container import build_container


TRUSTED_ORIGIN = "https://finance.example.com"


def client_for_writes(*, bypass=False):
    app = create_app(Settings(
        session_secret="csrf-test-session-secret-12345678901234567890",
        cors_origins=[TRUSTED_ORIGIN],
        disable_auth_for_local_development=bypass,
    ))
    client = TestClient(app)
    user = app.state.container.get_current_user.execute("user-steve")
    token = app.state.container.session_tokens.issue(user)
    return client, token


@pytest.mark.parametrize("origin", [None, "null", "https://attacker.example", "https://finance.example.com.attacker.example"])
def test_cookie_write_requires_exact_trusted_origin(origin):
    client, token = client_for_writes()
    client.cookies.set("finance_companion_session", token)
    headers = {"Origin": origin} if origin is not None else {}
    response = client.post("/api/v1/auth/logout", headers=headers)
    assert response.status_code == 403
    assert "set-cookie" not in response.headers


def test_trusted_cookie_write_and_preflight_work():
    client, token = client_for_writes()
    client.cookies.set("finance_companion_session", token)
    headers = {"Origin": TRUSTED_ORIGIN}
    preflight = client.options("/api/v1/auth/logout", headers={
        **headers, "Access-Control-Request-Method": "POST",
    })
    assert preflight.status_code == 200
    response = client.post("/api/v1/auth/logout", headers=headers)
    assert response.status_code == 204
    assert response.headers["access-control-allow-origin"] == TRUSTED_ORIGIN
    assert "set-cookie" in response.headers


def test_trusted_cross_site_browser_can_complete_production_login_and_session():
    settings = Settings(
        environment="production",
        session_secret="csrf-test-session-secret-12345678901234567890",
        dividend_research_provider="stub",
        cors_origins=[TRUSTED_ORIGIN],
        entra_client_id="test-client", entra_tenant_id="test-tenant",
        allowed_email="user@example.test",
    )

    class FakeVerifier:
        def verify(self, token, client_id, tenant_id):
            assert (token, client_id, tenant_id) == ("test-id-token", "test-client", "test-tenant")
            return VerifiedIdentity(
                subject="test-subject", object_id="test-object", tenant_id="test-tenant",
                email="user@example.test",
            )

    app = create_app(settings)
    app.state.container = build_container(settings, verifier=FakeVerifier())
    # Static Web Apps and Container Apps use different sites in production.
    # The browser sends both its exact Origin and cross-site Fetch Metadata.
    client = TestClient(app, base_url="https://api.example.net", headers={
        "Origin": TRUSTED_ORIGIN, "Sec-Fetch-Site": "cross-site",
    })
    preflight = client.options("/api/v1/auth/entra/verify", headers={
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    })
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == TRUSTED_ORIGIN
    assert client.get("/api/v1/auth/session").status_code == 401

    login = client.post("/api/v1/auth/entra/verify", json={"idToken": "test-id-token"})
    assert login.status_code == 200
    assert login.json()["user"]["email"] == "user@example.test"
    assert login.headers["access-control-allow-origin"] == TRUSTED_ORIGIN
    assert login.headers["access-control-allow-credentials"] == "true"
    cookie = login.headers["set-cookie"].lower()
    assert "secure" in cookie and "httponly" in cookie and "samesite=none" in cookie
    assert client.get("/api/v1/auth/session").json()["email"] == "user@example.test"
    assert client.get("/api/v1/accounts").status_code == 200
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.get("/api/v1/auth/session").status_code == 401


@pytest.mark.parametrize("origin", [None, "null", "https://attacker.example", "https://finance.example.com.attacker.example"])
def test_cross_site_login_rejects_missing_or_untrusted_origin_before_verifying_identity(origin):
    client, _ = client_for_writes()
    calls = []
    client.app.state.container.authenticate_identity_user.execute = lambda *args: calls.append(args)
    headers = {"Sec-Fetch-Site": "cross-site"}
    if origin is not None:
        headers["Origin"] = origin
    response = client.post("/api/v1/auth/entra/verify", json={"idToken": "test-id-token"}, headers=headers)
    assert response.status_code == 403
    assert "set-cookie" not in response.headers
    assert calls == []


def test_bearer_client_can_write_without_origin():
    client, token = client_for_writes()
    response = client.post("/api/v1/holdings/not-owned/dividends/refresh", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 404


def test_cross_site_form_cannot_trigger_research_even_with_local_auth_bypass():
    client, _ = client_for_writes(bypass=True)
    called = []
    client.app.state.container.refresh_holding_dividends.execute = lambda *args: called.append(args)
    response = client.post("/api/v1/holdings/any/dividends/refresh", headers={"Origin": "https://attacker.example"})
    assert response.status_code == 403
    assert called == []


def test_cross_site_request_without_origin_is_rejected():
    client, _ = client_for_writes(bypass=True)
    response = client.post("/api/v1/auth/logout", headers={"Sec-Fetch-Site": "cross-site"})
    assert response.status_code == 403


def test_cross_site_get_search_is_rejected_even_with_local_auth_bypass():
    client, _ = client_for_writes(bypass=True)
    assert client.get("/api/v1/securities/search?q=AAPL", headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403
    assert client.get("/api/v1/securities/search?q=AAPL", headers={"Origin": "https://attacker.example"}).status_code == 403


def test_dns_rebinding_host_is_rejected_in_local_development():
    client, _ = client_for_writes(bypass=True)
    response = client.get("/api/v1/securities/search?q=AAPL", headers={"Host": "rebind.attacker.example:8000"})
    assert response.status_code == 403


def test_cookie_read_still_works_without_origin():
    client, token = client_for_writes()
    client.cookies.set("finance_companion_session", token)
    assert client.get("/api/v1/auth/session").status_code == 200
