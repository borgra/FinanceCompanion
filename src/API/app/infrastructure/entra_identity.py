from __future__ import annotations

from datetime import UTC, datetime, timedelta

import httpx
import jwt
from jwt import PyJWKClient

from app.domain.exceptions import AuthenticationError
from app.domain.models import VerifiedIdentity
from app.domain.protocols import IdentityTokenVerifier


class EntraIdentityTokenVerifier(IdentityTokenVerifier):
    def __init__(self) -> None:
        self._metadata_cache: dict[str, tuple[datetime, dict[str, str]]] = {}
        self._jwks_clients: dict[str, PyJWKClient] = {}

    def verify(self, token: str, client_id: str | None, tenant_id: str | None) -> VerifiedIdentity:
        if not client_id:
            raise AuthenticationError("Microsoft Entra client ID is not configured.")
        if not tenant_id:
            raise AuthenticationError("Microsoft Entra tenant ID is not configured.")

        issuer = f"https://login.microsoftonline.com/{tenant_id}/v2.0"
        metadata = self._get_metadata(tenant_id)

        try:
            signing_key = self._get_jwks_client(metadata["jwks_uri"]).get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                audience=client_id,
                issuer=issuer,
                options={"require": ["aud", "exp", "iat", "iss", "oid", "sub", "tid"]},
            )
        except Exception as exc:
            import traceback
            print(f"DIAGNOSTIC: Token verification failed: {exc}", flush=True)
            traceback.print_exc()
            raise AuthenticationError("Microsoft token verification failed.") from exc

        token_tenant_id = str(payload.get("tid", "")).strip()
        if token_tenant_id != tenant_id:
            raise AuthenticationError("Microsoft token tenant does not match the configured tenant.")

        email = (
            str(payload.get("preferred_username") or payload.get("email") or payload.get("upn") or "").strip()
        )
        if not email:
            raise AuthenticationError("Microsoft token did not include a usable email or username claim.")

        object_id = str(payload.get("oid", "")).strip()
        subject = str(payload.get("sub", "")).strip()
        if not object_id or not subject:
            raise AuthenticationError("Microsoft token is missing required user identity claims.")

        return VerifiedIdentity(
            subject=subject,
            object_id=object_id,
            tenant_id=token_tenant_id,
            email=email,
            display_name=str(payload.get("name")) if payload.get("name") else None,
            picture_url=None,
        )

    def _get_metadata(self, tenant_id: str) -> dict[str, str]:
        now = datetime.now(tz=UTC)
        cached = self._metadata_cache.get(tenant_id)
        if cached and cached[0] > now:
            return cached[1]

        metadata_url = f"https://login.microsoftonline.com/{tenant_id}/v2.0/.well-known/openid-configuration"
        try:
            response = httpx.get(metadata_url, timeout=10.0)
            response.raise_for_status()
            payload = response.json()
        except Exception as exc:
            raise AuthenticationError("Microsoft OpenID configuration could not be loaded.") from exc

        metadata = {"jwks_uri": str(payload["jwks_uri"])}
        self._metadata_cache[tenant_id] = (now + timedelta(hours=24), metadata)
        return metadata

    def _get_jwks_client(self, jwks_uri: str) -> PyJWKClient:
        client = self._jwks_clients.get(jwks_uri)
        if client is None:
            client = PyJWKClient(jwks_uri)
            self._jwks_clients[jwks_uri] = client
        return client
