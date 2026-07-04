from __future__ import annotations

from datetime import UTC, datetime, timedelta

import jwt

from app.domain.exceptions import AuthenticationError
from app.domain.models import SessionUser, User
from app.domain.protocols import SessionTokenService


class JwtSessionTokenService(SessionTokenService):
    def __init__(self, secret: str, expiration_seconds: int, issuer: str, audience: str) -> None:
        self._secret = secret
        self._expiration_seconds = expiration_seconds
        self._issuer = issuer
        self._audience = audience

    def issue(self, user: User) -> str:
        now = datetime.now(tz=UTC)
        payload = {
            "sub": user.id,
            "email": user.email,
            "iss": self._issuer,
            "aud": self._audience,
            "nbf": int(now.timestamp()),
            "jti": f"{user.id}:{int(now.timestamp())}",
            "typ": "session",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(seconds=self._expiration_seconds)).timestamp()),
        }
        return jwt.encode(payload, self._secret, algorithm="HS256")

    def parse(self, token: str) -> SessionUser:
        try:
            payload = jwt.decode(
                token,
                self._secret,
                algorithms=["HS256"],
                audience=self._audience,
                issuer=self._issuer,
                options={"require": ["aud", "exp", "iat", "iss", "nbf", "sub", "email", "typ"]},
            )
        except jwt.PyJWTError as exc:
            raise AuthenticationError("The session token is invalid.") from exc

        user_id = payload.get("sub")
        email = payload.get("email")
        if payload.get("typ") != "session":
            raise AuthenticationError("The session token type is invalid.")
        if not user_id or not email:
            raise AuthenticationError("The session token is missing required claims.")
        return SessionUser(user_id=user_id, email=email)
