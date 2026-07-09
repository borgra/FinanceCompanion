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

Security search and security detail refresh use Alpha Vantage. Set `FINANCE_COMPANION_ALPHA_VANTAGE_API_KEY` in `.env.local` for local startup, or map the GitHub secret `ALPHA_VANTAGE_API_KEY` in deployment workflows.

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
