from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status

from app.domain.exceptions import AuthenticationError
from app.domain.models import SessionUser
from app.presentation.http.container import Container


def get_container(request: Request) -> Container:
    return request.app.state.container  # type: ignore[no-any-return]


def require_session_user(
    authorization: Annotated[str | None, Header()] = None,
    request: Request = None,
    container: Annotated[Container, Depends(get_container)] = None,
) -> SessionUser:
    session_cookie = request.cookies.get(container.settings.session_cookie_name)
    token = session_cookie
    if not token and authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token.")
    try:
        return container.session_tokens.parse(token)
    except AuthenticationError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
