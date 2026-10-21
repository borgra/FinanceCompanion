# Live distribution testing locally

Foundry searches the public web for distribution history, then imports cited facts. Live research requires a project endpoint, deployment, explicitly approved versions of both agents, a blocking RAI policy ID and Entra sign-in with inference/metadata-read permissions. See [Research Agent Security](Research%20Agent%20Security.md) before rollout. No market-data key, separate search resource/key, or source files are required. Forecast arithmetic stays in application code.

## One-time prerequisites

- Python 3.12 or newer, Node.js 24 LTS with npm 11, and Azure CLI installed.
- A verified `gpt-6-luna` Foundry deployment supporting Responses, built-in `web_search`, and strict structured outputs. Search and model usage are billed by Azure; subscription policy must allow web search. Give your developer account inference access using [the Entra/RBAC guide](Foundry%20Entra%20RBAC.md). Browser sign-in is separate from server-to-Foundry authentication.

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
FINANCE_COMPANION_AZURE_FOUNDRY_AGENT_NAME=dividend-history-agent
FINANCE_COMPANION_AZURE_FOUNDRY_STOCK_DETAILS_AGENT_NAME=stock-details-agent
FINANCE_COMPANION_AZURE_FOUNDRY_AGENT_VERSION=YOUR_APPROVED_DIVIDEND_VERSION
FINANCE_COMPANION_AZURE_FOUNDRY_STOCK_DETAILS_AGENT_VERSION=YOUR_APPROVED_STOCK_VERSION
FINANCE_COMPANION_AZURE_FOUNDRY_RAI_POLICY_ID=YOUR_FULL_POLICY_ARM_ID
FINANCE_COMPANION_AZURE_FOUNDRY_REASONING_EFFORT=low
FINANCE_COMPANION_AZURE_FOUNDRY_AUTH_MODE=entra
FINANCE_COMPANION_AZURE_FOUNDRY_API_VERSION=
FINANCE_COMPANION_AZURE_FOUNDRY_MANAGED_IDENTITY_CLIENT_ID=
```

Use a project endpoint such as `https://RESOURCE.services.ai.azure.com/api/projects/PROJECT`. Both research flows require their approved registered versions and full policy ID; resource-only endpoints and API keys cannot run them. Keep API version and managed identity client ID empty locally. Do not put credentials in `VITE_` settings. Remove any Cosmos connection string from this JSON-backed local configuration.

4. Sign in once with `az login --tenant YOUR_TENANT_ID` and, when needed, `az account set --subscription YOUR_SUBSCRIPTION_ID`. No Foundry API key is needed in Entra mode. Your user must have the role described in the RBAC guide; Azure CLI sign-in alone does not grant inference access.
5. If the demo Docker stack is running, stop it with `docker compose -f docker-compose.local.yml down`. The native API and Docker API must not write `.local-data/finance.json` simultaneously.
6. Run `./start-local.ps1`. It installs/updates dependencies in the repository's Python virtual environment and UI `node_modules`, starts both servers in the background, and waits for readiness. The normal credential-free Docker stack remains available for offline demonstration; it does not read these live settings.
7. Open [the local app](http://localhost:5173), choose **Investing → Passive Income**, then **Refresh JEPQ distributions** under **Research status and sources**. The general **Refresh distribution data** button refreshes all held securities. Add JEPQ and a positive share quantity under Holdings first if it is not in your test data.

Security search also uses Foundry web research, so adding JEPQ or another supported security needs no market-data account. Search does not invent a market price or payout history; distribution import occurs through the refresh action. Holdings **Update all holdings** and the individual update action use the separate stock-details agent for sourced prices and optional metrics. Missing optional fields retain saved values; failed research preserves all saved details. The details dialog shows dated price/NAV evidence and sources. `stub` is explicitly demonstration-only.

## Verify stock details

Register both agents with `infra/scripts/deploy-foundry.ps1`, or use `register-foundry-agent.ps1 -AgentKind stock-details -RaiPolicyId '<full-policy-arm-id>'` and separately `-AgentKind dividend-history`. Agent kinds select canonical files; custom names do not select different instructions. Review returned versions and set each approved version explicitly. Registration never promotes a runtime version automatically.

Run this opt-in, billable smoke after supplying your actual deployment and account resource ID:

```powershell
./infra/scripts/test-foundry.ps1 -SubscriptionId '<subscription-id>' -Endpoint '<endpoint>' -Deployment '<deployment-name>' -RaiPolicyId '/subscriptions/<subscription-id>/resourceGroups/<group>/providers/Microsoft.CognitiveServices/accounts/<account>/raiPolicies/research-injection-blocking-v1' -AgentVersion '<approved-version>' -AgentKind stock-details -Symbol MSFT -SecurityName 'Microsoft Corporation' -Exchange NASDAQ -AssetType Equity
```

The smoke checks management-plane model identity before inference, then makes one web-search/strict-output request with field evidence. A deployment alias is not proof of model identity. `-WhatIf` makes no Azure or model calls. Repeat with an ETF and an identifiable USD mutual fund (`-AssetType 'Mutual Fund'`) to verify actual coverage; optional metrics may be unavailable.

In Holdings, refresh a saved listing, inspect its dated sources, reload the browser, then restart the API and confirm the accepted details and sources persist. Verify shares, cost basis, dividend settings and payment history remain intact. Update all skips successful research from the last 48 hours, while the individual action forces research. A failed or unsupported listing must preserve its previous details and timestamp.

## Verify retrieval and persistence

From the repository root, with the local servers running:

```powershell
./scripts/test-live-distributions.ps1 -Symbol JEPQ -VerifyRestart
```

This is an opt-in live call to your configured Azure deployment. It refreshes an existing holding, requires a completed web search with citations, rejects stub/unavailable results, checks sourced events and projections were written to the local JSON file, restarts the tracked API, then verifies the restarted API returns the same events and snapshot. It does not reset data or alter manual payouts. Select another held ticker with `-Symbol`. Wait at least 60 seconds after a previous refresh to avoid the freshness cache.

Open **Research status and sources → Saved AI research and citations** to inspect the saved answer and linked sources. These are AI-generated cited claims, not independently fetched publisher quotations. Imports are labeled partial because public-web coverage and extraction can be incomplete. The application rejects uncited/mismatched facts instead of filling missing months. Research has a 90-second budget per security, and the screen reports progress while refreshing multiple securities.

After a failed refresh, the source link and saved research still belong to the last successful import. An accurate saved link does not prove that the new response passed validation. The returned structured listing must match the requested ticker, exchange, asset type and currency. Each dividend URL must be present in completed web-search tool sources. Unknown share basis and raw amounts without complete split evidence remain unverified and excluded from totals and forecasts.

For funds whose issuer tables require JavaScript, the registered agent can research reputable alternative tables within its tool-call budget. Empty profiles, date-only schedules and estimates are not evidence of paid distributions. Unknown tax classification is returned as Other. These are cited AI claims; URL membership does not independently verify a publisher's numbers.

Manually added tickers may start with Unknown exchange and asset type. A distribution refresh researches their identity rather than rejecting these missing fields. A complete supported US-listed USD stock or ETF identity is required before importing payments, and the resolved exchange and asset type are saved with the holding. Common ETF labels and Schwab's legal exchange name, NYSE Arca, Inc., normalize to the supported identity. The dividend agent does not return corporate-action history; it cannot certify normalization of raw historical amounts. Known unsupported asset types, non-US exchanges and non-USD currencies preserve saved data without importing results.

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

Both research flows require the registered agents' approved versions and live blocking policy. Missing or changed definitions/policies fail closed. The smoke script invokes a registered version; a model-only test is insufficient. See the security guide for configuration-only and adversarial smoke modes.
