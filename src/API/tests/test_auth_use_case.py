from app.application.use_cases.auth import AuthenticateIdentityUser
from app.domain.exceptions import AuthenticationError
from app.domain.models import VerifiedIdentity
from app.infrastructure.in_memory_repositories import InMemoryDataStore, InMemoryUserRepository
from app.infrastructure.security import JwtSessionTokenService

TEST_SESSION_SECRET = "test-secret-123456789012345678901234567890"
TEST_ISSUER = "finance-companion-api"
TEST_AUDIENCE = "finance-companion-ui"


class FakeVerifier:
    def __init__(self, identity: VerifiedIdentity) -> None:
        self.identity = identity

    def verify(self, token: str, client_id: str | None, tenant_id: str | None) -> VerifiedIdentity:
        return self.identity


def test_authenticate_identity_user_issues_session_for_allowed_user():
    store = InMemoryDataStore()
    use_case = AuthenticateIdentityUser(
        verifier=FakeVerifier(
            VerifiedIdentity(
                subject="entra-subject-1",
                object_id="entra-object-1",
                tenant_id="entra-tenant-1",
                email="steveborgra@gmail.com",
                display_name="Steve Borgra",
            )
        ),
        users=InMemoryUserRepository(store),
        sessions=JwtSessionTokenService(TEST_SESSION_SECRET, 3600, TEST_ISSUER, TEST_AUDIENCE),
        allowed_email="steveborgra@gmail.com",
    )

    token, user = use_case.execute("id-token", "client-id", "tenant-id")

    assert token
    assert user.email == "steveborgra@gmail.com"
    assert user.identity_subject == "entra-subject-1"
    assert user.identity_object_id == "entra-object-1"
    assert user.identity_tenant_id == "entra-tenant-1"


def test_authenticate_identity_user_rejects_unknown_email():
    store = InMemoryDataStore()
    use_case = AuthenticateIdentityUser(
        verifier=FakeVerifier(
            VerifiedIdentity(
                subject="entra-subject-1",
                object_id="entra-object-1",
                tenant_id="entra-tenant-1",
                email="other@example.com",
            )
        ),
        users=InMemoryUserRepository(store),
        sessions=JwtSessionTokenService(TEST_SESSION_SECRET, 3600, TEST_ISSUER, TEST_AUDIENCE),
        allowed_email="steveborgra@gmail.com",
    )

    try:
        use_case.execute("id-token", "client-id", "tenant-id")
    except AuthenticationError as exc:
        assert "not allowed" in str(exc)
    else:
        raise AssertionError("Expected AuthenticationError")
