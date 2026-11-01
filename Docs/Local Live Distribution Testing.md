# Live distribution testing locally

Foundry searches the public web for distribution history and corporate actions, then imports cited facts. You only configure your Foundry endpoint/deployment and sign in with Entra. No Alpha Vantage account, market-data key, separate search resource/key, or source files are required. Forecast arithmetic stays in application code.

## One-time prerequisites

- Python 3.12 or newer, Node.js 24 LTS with npm 11, and Azure CLI installed.
- A Foundry deployment supporting Responses, built-in `web_search`, and strict structured outputs. Search and model usage are billed by Azure; subscription policy must allow web search. Give your developer account inference access using [the Entra/RBAC guide](Foundry%20Entra%20RBAC.md). Browser sign-in is separate from server-to-Foundry authentication.

## Configure and start

1. Open PowerShell in `D:\github\FinanceCompanion`.
2. For a new checkout, copy `.env.local.example` to `.env.local`. If you already have `.env.local`, keep it and merge the live settings below. This file is ignored by Git. Do not replace an existing credential file blindly.
3. Set this block in `.env.local`:

```dotenv
FINANCE_COMPANION_ENVIRONMENT=development
FINANCE_COMPANION_DATA_BACKEND=json
FINANCE_COMPANION_LOCAL_JSON_PATH=.local-data/finance.json
FINANCE_COMPANION_DISABLE_AUTH_FOR_LOCAL_DEVELOPMENT=true
VITE_AUTH_MODE=local
VITE_API_BASE_URL=http://localhost:8000/api/v1
FINANCE_COMPANION_DIVIDEND_RESEARCH_PROVIDER=azure_foundry
FINANCE_COMPANION_AZURE_FOUNDRY_ENDPOINT=YOUR_FOUNDRY_ENDPOINT
FINANCE_COMPANION_AZURE_FOUNDRY_DEPLOYMENT=YOUR_DEPLOYMENT_NAME
FINANCE_COMPANION_AZURE_FOUNDRY_STOCK_DETAILS_AGENT_NAME=stock-details-agent
FINANCE_COMPANION_AZURE_FOUNDRY_REASONING_EFFORT=low
FINANCE_COMPANION_AZURE_FOUNDRY_AUTH_MODE=entra
FINANCE_COMPANION_AZURE_FOUNDRY_API_VERSION=
FINANCE_COMPANION_AZURE_FOUNDRY_MANAGED_IDENTITY_CLIENT_ID=
```

Use a project endpoint such as `https://RESOURCE.services.ai.azure.com/api/projects/PROJECT` or a direct resource endpoint such as `https://RESOURCE.openai.azure.com`. Both use Responses for web research. Keep API version and managed identity client ID empty locally. Do not put credentials in `VITE_` settings. Remove any Cosmos connection string from this JSON-backed local configuration.

4. Sign in once with `az login --tenant YOUR_TENANT_ID` and, when needed, `az account set --subscription YOUR_SUBSCRIPTION_ID`. No Foundry API key is needed in Entra mode. Your user must have the role described in the RBAC guide; Azure CLI sign-in alone does not grant inference access.
5. If the demo Docker stack is running, stop it with `docker compose -f docker-compose.local.yml down`. The native API and Docker API must not write `.local-data/finance.json` simultaneously.
6. Run `./start-local.ps1`. It installs/updates dependencies in the repository's Python virtual environment and UI `node_modules`, starts both servers in the background, and waits for readiness. The normal credential-free Docker stack remains available for offline demonstration; it does not read these live settings.
7. Open [the local app](http://localhost:5173), choose **Investing → Passive Income**, then **Refresh JEPQ distributions** under **Research status and sources**. The general **Refresh distribution data** button refreshes all held securities. Add JEPQ and a positive share quantity under Holdings first if it is not in your test data.

Security search also uses Foundry web research, so adding JEPQ or another supported security needs no market-data account. Search does not invent a market price or payout history; distribution import occurs through its separate refresh action. Stock price/details refresh invokes your existing `stock-details-agent` in the configured Foundry project and sends only the ticker as task input. Its saved Azure instructions, tools, model, and output schema control the research. The API validates its returned facts and preserves saved data on failure. Stock refresh needs a project endpoint with Entra access; a direct model-resource endpoint cannot select a named agent. The API's cooldown, shared usage budgets, server-owned quote provenance, and ownership checks still apply. `stub` is explicitly demonstration-only.

Use `./src/API/.venv/Scripts/python.exe ./scripts/test-live-security-details.py --symbol JEPQ --exchange NASDAQ --asset-type ETF` from the repository root for an opt-in live agent check that does not alter holdings. It uses the configured project and agent name; model/search charges apply. Never commit real local credentials or portfolio data.

## Verify retrieval and persistence

From the repository root, with the local servers running:

```powershell
./scripts/test-live-distributions.ps1 -Symbol JEPQ -VerifyRestart
```

This is an opt-in live call to your configured Azure deployment. It refreshes an existing holding, requires a completed web search with citations, rejects stub/unavailable results, checks sourced events and projections were written to the local JSON file, restarts the tracked API, then verifies the restarted API returns the same events and snapshot. It does not reset data or alter manual payouts. Select another held ticker with `-Symbol`. Wait at least 60 seconds after a previous refresh to avoid the freshness cache.

Open **Research status and sources → Saved AI research and citations** to inspect the saved answer and linked sources. These are AI-generated cited claims, not independently fetched publisher quotations. Imports are labeled partial because public-web coverage and extraction can be incomplete. The application rejects uncited/mismatched facts instead of filling missing months. Research has a 90-second budget per security, and the screen reports progress while refreshing multiple securities.

After a failed refresh, the source link and saved research still belong to the last successful import. An accurate saved link does not prove that the new response passed validation. Listing identity can be verified from either a cited identity paragraph or current cited payment rows explicitly matching the ticker, listing exchange and USD amount. Missing optional share-basis wording retains the payment with an unverified basis; amounts requiring an unresolved split adjustment remain excluded from totals.

For Vanguard ETFs such as VOO and VYM, the identity link may point to a fund profile whose distribution table is not readable by web research. Distribution history links identify the sources used for imported payments separately. Research supplies exchange and alternative table URLs as discovery hints. If its first answer has no cited ex-date and USD amount rows, it makes at most one alternative-source search before extraction, within the same 90-second budget and reserving time for validation. Empty profiles, date-only schedules, and estimates are not imported as paid distributions; citation and listing checks still apply. If extraction supplies a tax classification that the cited row does not support, the payment is retained as Other with a warning rather than discarding its otherwise validated amount and dates.

A cited split outside the full research/forecast window, such as VOO's 2013 split, does not make current distributions unverified. Actions with missing or inconsistent date evidence still retain the conservative share-basis exclusion.

Manually added tickers may start with Unknown exchange and asset type. A distribution refresh researches their identity rather than rejecting these missing fields. A full cited US-listed USD stock or ETF identity is required before importing payments for an unknown asset type, and the resolved exchange and asset type are saved with the holding. Common ETF labels and Schwab's legal exchange name, NYSE Arca, Inc., normalize to the supported identity. Split evidence accepts both N-for-M and explicit N new shares for M old shares, with the same ratio, direction, and date checks. Known unsupported asset types, non-US exchanges, and non-USD currencies still return unsupported, with warnings identifying the blocking saved field.

Inspect the three year choices in Passive Income. JEPQ's observed recurring history should produce monthly projections when sufficient valid data is available. Real declared dates can fall near month boundaries; the calendar uses **ex-date**, not pay date. Recurrence/tax classification and share-basis uncertainty are shown as warnings rather than silently invented source facts. Events with unresolved split basis are excluded from totals. Historical and next-year amounts are per-share values multiplied by current quantities, not historical portfolio ownership.

Results persist in `.local-data/finance.json`; logs are in `.local-data/logs`. Closing the UI or stopping/restarting the API preserves that file. After editing configuration, run `./start-local.ps1 -RestartApi`. Run `./stop-local.ps1` to stop the native servers. `./start-local.ps1 -CheckConfig` validates configuration structure without making live calls.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Demo data still shown | Confirm provider is `azure_foundry` and search provider is `foundry_web_search`, restart the API, refresh the security. Live mode never silently falls back to stub. |
| Search unavailable or rate limited | Check model/search quota, supported tool/model/region and subscription web-search policy. Existing records remain visible on failure. |
| Foundry 401 | Sign into the correct tenant; check endpoint kind, token audience, and the actual identity being used. |
| Foundry 403 | Check the endpoint's matching RBAC scope and role; wait for propagation; check the resource firewall/private endpoint. |
| Foundry 400/404 or unsupported model | Check project/resource endpoint, exact deployment name, Responses/web-search and structured-output support. |
| Missing older pre-split values | Provider share basis may be unspecified; these records are retained as unverified and excluded rather than double-adjusted. |
| No forecast | Check regular cadence, sufficient recent history, source warnings, and positive holding quantities. |
| Port conflict/startup failure | Stop the other native/Docker stack; inspect `.local-data/logs/api.error.log` and `ui.error.log`. |

Default automated tests use mocked HTTP and local persistence; they do not spend Azure/provider credits. The opt-in script above checks the configured live path. Never use `reset-local.ps1` or delete `.local-data` as a prerequisite for testing persistence.
