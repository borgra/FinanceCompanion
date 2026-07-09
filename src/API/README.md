# Finance Companion API

FastAPI service for Finance Companion using a clean architecture layout:

- `app/domain`: business models, exceptions, and generic protocols
- `app/application`: use cases that orchestrate work
- `app/infrastructure`: placeholder in-memory adapters, Entra token verification, and JWT sessions
- `app/presentation`: HTTP routers, schemas, and mapping

## Security posture

- The API validates Entra ID tokens using server-side configured tenant and client IDs.
- The browser does not keep the app session token in `localStorage`; the API issues an `HttpOnly` session cookie instead.
- Outside local development, the API requires a real session secret.

## Local run

```powershell
cd src/API
python -m pip install -e .[dev]
uvicorn app.main:app --reload --port 8000
```

The API also reads the repo-level `.env.local` file created for local full-stack startup. If you prefer API-only overrides, copy [.env.example](.env.example) to `.env`.

Security search uses Yahoo Finance search without an API key. The adapter is isolated behind the security search use case because Yahoo Finance does not provide the same formal public API contract as paid or key-based market-data providers.

## One-shot local startup

From the repository root:

```powershell
.\start-local.ps1
```

That launches the API and UI in separate PowerShell windows using the shared repo-level `.env.local` file.

## Local tests

```powershell
python -m pytest
```
