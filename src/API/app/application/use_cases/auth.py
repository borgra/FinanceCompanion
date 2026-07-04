from app.domain.exceptions import AuthenticationError
from app.domain.protocols import IdentityTokenVerifier, SessionTokenService, UserRepository


class AuthenticateIdentityUser:
    def __init__(
        self,
        verifier: IdentityTokenVerifier,
        users: UserRepository,
        sessions: SessionTokenService,
        allowed_email: str,
    ) -> None:
        self._verifier = verifier
        self._users = users
        self._sessions = sessions
        self._allowed_email = allowed_email.casefold()

    def execute(self, token: str, client_id: str | None, tenant_id: str | None) -> tuple[str, object]:
        identity = self._verifier.verify(token, client_id, tenant_id)

        if identity.email.casefold() != self._allowed_email:
            raise AuthenticationError("This Microsoft account is not allowed to use Finance Companion.")

        user = self._users.get_by_email(identity.email)
        if user is None:
            raise AuthenticationError("The authenticated Microsoft account is not mapped to a local user.")

        user = self._users.update_identity_profile(
            user.id,
            subject=identity.subject,
            object_id=identity.object_id,
            tenant_id=identity.tenant_id,
            picture_url=identity.picture_url,
        )
        return self._sessions.issue(user), user


class GetCurrentUser:
    def __init__(self, users: UserRepository) -> None:
        self._users = users

    def execute(self, user_id: str):
        user = self._users.get_by_id(user_id)
        if user is None:
            raise AuthenticationError("Session user does not exist.")
        return user
