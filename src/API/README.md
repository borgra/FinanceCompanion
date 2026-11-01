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

In AI mode, security lookup, price/details refresh, and distribution retrieval use the configured Foundry connection. No Alpha Vantage account/key is needed. Stock price/details refresh invokes the existing Foundry `stock-details-agent` by name and sends only the normalized ticker as its task input. The agent's saved Azure definition controls its model, instructions, tools, and structured output; the API does not register, replace, or override that definition. Set `FINANCE_COMPANION_AZURE_FOUNDRY_STOCK_DETAILS_AGENT_NAME` to select another existing stock-details agent. This invocation requires a Foundry project endpoint and Entra access. Direct resource endpoints remain supported for the separate security-search and distribution workflows, but cannot invoke a named stock-details agent.

The API validates the returned listing, source evidence, price/date and optional metrics before saving them. This is AI web research rather than a real-time quote feed. Missing optional details preserve saved values, and failures preserve prices and all distribution records. Quote provenance remains visible in the security details dialog. `AZURE_FOUNDRY_DEPLOYMENT` continues to configure the separate search/distribution model calls; stock details uses the model saved on its Azure agent.

Price research has server-enforced admission controls: a 60-second cooldown per user/listing (including failed attempts), one active request per user, two active requests overall, 12 starts per user per minute, and global limits of 30 starts per minute and 240 per hour. Rejected individual requests return HTTP 429 with `Retry-After`. Production requires shared Cosmos Table storage; atomic conditional writes enforce the same budgets across replicas and restarts. Development without Cosmos uses bounded in-memory state. A usage-storage outage blocks new inference; crashed request leases expire after 180 seconds. These controls apply to price/details refresh; the separate search and distribution workflows retain their existing behavior.

Quote source/date/basis and freshness are server-owned. Generic holding writes ignore client assertions of research provenance, preserve saved provenance for unchanged prices/listings, and clear it for manual price or listing changes. Refresh re-reads the owned holding after research to preserve edits made during the external request; conflicting price/listing edits return HTTP 409 instead of being overwritten. This re-read does not add general optimistic concurrency to every repository write.

Production must explicitly set `FINANCE_COMPANION_ALLOWED_EMAIL`; source/example defaults use a reserved demonstration address. Keep real identity settings and credentials in ignored local configuration or private deployment settings. `python scripts/check-public-content.py` from the repository root checks publishable files for recognizable credential formats, sensitive local paths, and personal email addresses. Add `--history` to check reachable historical Git blobs for credential signatures. The public-content CI job runs without deployment credentials. This focused scanner supplements code review and GitHub secret scanning; it cannot recognize every possible secret. The API also requires a patched `certifi` trust bundle through its dependency minimum.

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
FINANCE_COMPANION_AZURE_FOUNDRY_STOCK_DETAILS_AGENT_NAME=stock-details-agent
FINANCE_COMPANION_AZURE_FOUNDRY_REASONING_EFFORT=low
FINANCE_COMPANION_AZURE_FOUNDRY_AUTH_MODE=entra
```

For dividend research, both project and direct resource endpoints use Responses for web research, with `text.format` in the same call. The dividend agent name is sent as metadata; runtime supplies the canonical dividend definition inline. Stock details instead sends an `agent_reference` to the existing stock-details agent, with only the ticker as input. It does not send an inline prompt, model, tools, or output-schema override. Leave API_VERSION empty. Project endpoints require Entra. Local constrained `DefaultAzureCredential` uses your `az login`; production uses the API Container App's managed identity, with optional `FINANCE_COMPANION_AZURE_FOUNDRY_MANAGED_IDENTITY_CLIENT_ID` to select a user-assigned identity. Web research requests the `https://ai.azure.com/.default` token scope. Configure an Azure deployment supporting Responses, web_search and strict structured outputs for search/distribution calls; configure those capabilities on the stock-details agent itself for stock calls. See [Foundry Entra RBAC](../../Docs/Foundry%20Entra%20RBAC.md) for precise roles, scopes, setup scripts and deployment variables.

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
