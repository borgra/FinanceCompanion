from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.infrastructure.settings import Settings
from app.presentation.http.container import build_container
from app.presentation.http.routers import router


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    settings.validate_security()
    app = FastAPI(title=settings.app_name)
    app.state.container = build_container(settings)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(router, prefix=settings.api_prefix)
    return app


app = create_app()
