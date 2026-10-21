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

To open the local app without signing in, set `FINANCE_COMPANION_DISABLE_AUTH_FOR_LOCAL_DEVELOPMENT=true` in `.env.local` (or `src/API/.env`). This is opt-in and only accepted when `FINANCE_COMPANION_ENVIRONMENT=development`; the API fails startup if it is enabled elsewhere. It uses the configured local development user ID, which defaults to the seeded `user-steve` account.

In AI distribution mode, security lookup and distribution retrieval use Foundry web research with Entra. No Alpha Vantage account/key is needed. Live market-price/technical-indicator refresh is outside this mode; saved prices are preserved. Optional legacy market-data adapters require explicit selection and their own key.

Dividend research defaults to a deterministic, visibly non-authoritative stub when no provider is configured in development. Live AI mode is `azure_foundry`. The canonical Docker stack remains offline/stub. The production workflow selects its provider through GitHub Environment variables and defaults explicitly to stub.

## Distribution research and forecasts

`DELETE /api/v1/holdings/{holding_id}/payouts` removes payment and research data for one owned holding. It preserves the holding's quantities, security details, corporate actions, dividend growth rate, and `manageDividends` setting. The research cache is cleared so a later refresh can load source payments again.

`POST /api/v1/holdings/{holding_id}/dividends/refresh` refreshes an owned non-cash holding and its same-symbol, same-exchange siblings. Holdings expose a `manageDividends` setting, which defaults to `true` for new and legacy holdings. When `false`, distribution refresh returns the holding unchanged without calling the research provider, and sibling refreshes exclude it. Holding update and batch requests that omit the setting preserve its current value. It uses a US market date, fetches up to five years of forecast inputs, displays the exact trailing 24 calendar months by ex-date, and generates regular-distribution estimates through December 31 of next year. The Passive Income screen combines this schedule into previous year, current actual + forecast, and next forecast year views. Refreshes reuse results for 60 seconds; failed refreshes preserve the existing schedule.

The existing `amount` remains numeric for compatibility. `amountPerShare` and `rawAmount` retain decimal strings; events also carry stable identity, security/exchange identity, currency/type/regular status, evidence reference, source authority, named share basis, applied split IDs, and forecast method/input IDs/range. `sourcePayoutDetails` contains active sourced and projected records, `manualPayoutDetails` preserves user entries, `payoutDetails` merges them, and `payoutAuditDetails` holds superseded revisions. `excludedFromTotals` quarantines unresolved conflicts or unverifiable legacy share bases. Legacy completed/announced records still deserialize. A structured research snapshot stores forecast inputs and model/prompt/schema versions, plus the public AI answer, citations, search actions and accepted claim excerpts for inspection. It never stores tokens, credentials or model reasoning.

Cosmos Table storage retains legacy JSON for small holdings and uses versioned deterministic gzip/base64 encoding split across bounded string properties for larger snapshots/audits. Replacement writes clear obsolete chunks. Entity and batch-size guards reject writes before reaching service limits. Long-lived research beyond those limits needs a dedicated distribution repository; audit entries are never silently discarded.

Forecasts use the median of up to three same-season split-normalized observations, falling back to the latest four only when at least two exist. Specials, irregular/stale histories and capital-gain events are excluded from automatic forecasts. Estimate dates follow observed seasonality and roll weekends to Monday. **Exchange holidays are not modeled**; the API reports this limitation. Historical min/max ranges are scenarios, not statistical confidence intervals. Announcements replace matching projections within a deterministic 14-day event window; ambiguous matches remain visible with warnings and are excluded from totals.

### Automatic live retrieval and Foundry

See [Local Live Distribution Testing](../../Docs/Local%20Live%20Distribution%20Testing.md) for configuration-only startup and an opt-in retrieval/persistence/restart check. No prepared source files are needed.

Dividend refresh uses one Responses call with `web_search` and strict JSON output. The canonical instructions and schema live in `infra/agents/`; native development reads them directly and the API image bundles them. The agent retrieves the trailing 24 months plus announced upcoming dividends. The API validates the requested listing, positive exact amounts, and dates, then uses the existing deterministic forecasting and persistence pipeline. Invalid optional dates are dropped with warnings; failed, empty, or unavailable research preserves saved records. Security lookup retains its separate identity research flow.

Set these server-only values in the ignored root `.env.local`:

```dotenv
FINANCE_COMPANION_DIVIDEND_RESEARCH_PROVIDER=azure_foundry
FINANCE_COMPANION_AZURE_FOUNDRY_ENDPOINT=https://YOUR-RESOURCE.services.ai.azure.com/api/projects/YOUR-PROJECT
FINANCE_COMPANION_AZURE_FOUNDRY_DEPLOYMENT=YOUR-PINNED-DEPLOYMENT
FINANCE_COMPANION_AZURE_FOUNDRY_AGENT_NAME=dividend-history-agent
FINANCE_COMPANION_AZURE_FOUNDRY_REASONING_EFFORT=low
FINANCE_COMPANION_AZURE_FOUNDRY_AUTH_MODE=entra
```

Both project and direct resource endpoints use Responses for web research, with `text.format` in the same call. The configured agent name is sent as metadata; runtime supplies the canonical definition inline so both endpoint types work without an extra agent lookup. Leave API_VERSION empty. Project endpoints require Entra. Local constrained `DefaultAzureCredential` uses your `az login`; production uses the API Container App's managed identity, with optional `FINANCE_COMPANION_AZURE_FOUNDRY_MANAGED_IDENTITY_CLIENT_ID` to select a user-assigned identity. Web research requests the `https://ai.azure.com/.default` token scope. Configure an Azure deployment supporting Responses, web_search and strict structured outputs. See [Foundry Entra RBAC](../../Docs/Foundry%20Entra%20RBAC.md) for precise roles, scopes, setup scripts and deployment variables.

`infra/scripts/deploy-foundry.ps1` can provision the dedicated GPT-6 Luna deployment. Use `low` reasoning effort for it to keep research within the request budget; leave effort empty for models that do not support this setting.

No separate search key/resource, market-data subscription or source manifest is needed. Search/model usage is billed through Azure and can be blocked by subscription policy. Browser Entra sign-in is independent and optional in local development.

The structured answer is AI-generated research, not independently fetched publisher text. Imported results remain partial/non-authoritative, with saved JSON, citations, and search evidence visible under Passive Income's research details. The agent imports income dividends on the current share basis; special distributions are excluded from recurring forecasts. `regularityBasis=inferred_cadence_v1` discloses deterministic recurrence inference. Corporate actions are no longer researched by this provider; existing stored actions remain available. Forecasts remain unavailable when enough reliable recent inputs cannot be found.

Build the API image from the repository root with `docker build -f src/API/Dockerfile .` so its canonical agent definition is included. `docker compose -f docker-compose.local.yml up --build` uses the same context and excludes local credentials/data from the build context.

Normal AI research uses Microsoft's hosted search and grounding terms, not arbitrary server-side URL fetching. CI mocks external services; live calls happen only through an explicitly configured provider or the opt-in smoke script.

## One-shot local startup

From the repository root:

```powershell
.\start-local.ps1
```

That validates the shared root `.env.local`, prepares local dependencies, and starts the API/UI in the background with readiness checks and logs in `.local-data/logs`. The API uses `src/API/.venv` and JSON persistence at the configured repository-relative path. After local API changes, run `./start-local.ps1 -RestartApi` to restart only the tracked API process and wait for its health endpoint; the UI is left running.

## Local tests

```powershell
python -m pytest
```
