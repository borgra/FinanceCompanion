from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from app.infrastructure.settings import Settings
from app.presentation.http.container import build_container
from app.presentation.http.retirement_router import router as retirement_router
from app.presentation.http.routers import router


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    settings.validate_security()
    app = FastAPI(title=settings.app_name)
    app.state.container = build_container(settings)

    @app.middleware("http")
    async def persist_local_json(request, call_next):
        if settings.environment == "development":
            host = (request.headers.get("host") or "").strip().lower()
            if host and host not in {"localhost", "localhost:8000", "127.0.0.1", "127.0.0.1:8000", "[::1]", "[::1]:8000", "testserver"}:
                return JSONResponse(status_code=403, content={"detail": "Untrusted Host header."})
        # SameSite=None cookies require CSRF protection independent of CORS.
        # Non-browser clients can use bearer tokens without an Origin header.
        if request.method != "OPTIONS":
            origin = request.headers.get("origin")
            cookie_session = settings.session_cookie_name in request.cookies
            is_write = request.method not in {"GET", "HEAD"}
            if (
                (origin is not None and origin not in settings.cors_origins)
                # The trusted UI and API can be hosted on different sites.
                # An exact trusted Origin authorizes that browser request;
                # Fetch Metadata still blocks cross-site requests without one.
                or (origin is None and request.headers.get("sec-fetch-site") == "cross-site")
                or (is_write and cookie_session and origin is None)
            ):
                return JSONResponse(status_code=403, content={"detail": "A trusted Origin is required for this request."})
        response = await call_next(request)
        store = getattr(app.state.container, "data_store", None)
        # Research refreshes persist atomically inside their conditional repository
        # write. A second save could fail after an already committed success.
        research_refresh = request.method == "POST" and request.url.path.endswith(("/security-details/refresh", "/dividends/refresh"))
        if store is not None and not research_refresh:
            store.save()
        return response

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(router, prefix=settings.api_prefix)
    app.include_router(retirement_router, prefix=settings.api_prefix)
    return app


app = create_app()
