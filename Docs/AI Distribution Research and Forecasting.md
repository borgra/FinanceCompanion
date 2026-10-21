# AI Distribution Research and Forecasting

**Status:** Live retrieval implemented; credential/RBAC configuration required for live use  
**Owner:** Product / Engineering  
**Last updated:** 2026-10-21

The dividend retrieval and extraction design below is superseded by [Foundry Dividend History Agent](Foundry%20Dividend%20History%20Agent.md). Current refreshes use a single structured Responses call with the shared `infra/agents/` definition; deterministic forecasting, reconciliation, manual payouts, and repository persistence remain in place.

## Summary

Research a security’s distribution events from the web, normalize history to a consistent per-share basis, adjust for splits and reverse splits, and forecast regular distributions through the end of next calendar year. When a forecast is later announced or paid, replace its displayed estimate with the sourced event while retaining an audit trail.

Azure AI Foundry is the AI provider. Foundry extracts structured facts from fetched sources; deterministic application code validates, normalizes, reconciles, and forecasts them.

## Product brief

- **Customer:** Finance Companion users tracking income from held securities.
- **Problem:** Distribution records are fragmented, split-adjusted inconsistently, and future estimates can be mistaken for confirmed payments.
- **Outcome:** A sourced, understandable per-security timeline of actual, announced, and projected distributions.
- **Success:** Users can identify the source, share basis, status, and estimate period of each event; new announcements replace matching forecasts without duplicates.
- **Non-goals:** Trading, recommendations, tax advice, guaranteed forecasts, and long-range dividend-growth projections.

## Scope

### In scope

- Refresh researched distributions for a held non-cash security.
- Display actual distribution history for the trailing 24 calendar months.
- Display declared events and projected regular events from the refresh date through December 31 of the current year and all of the next calendar year.
- Discover/fetch web sources, AI-assisted extraction, validation, source precedence, split/reverse-split normalization, reconciliation, and provenance.
- Preserve and merge user-entered payout records.
- Local stub configuration and production Azure AI Foundry configuration.

### Initial coverage

- Listed common stocks and ETFs with supported source coverage.
- Other asset types may return `unsupported` or partial results until an appropriate source and forecast policy exist.

## User flow

1. User opens **Passive Income** or a held security’s details.
2. User selects **Refresh distribution data**.
3. The API researches the security and returns history, corporate actions, declared events, forecasts, freshness, and warnings.
4. The UI shows the 24-month history and the remaining-current-year / next-calendar-year schedule, with each event labeled actual, announced, or projected.
5. A later refresh finds an issuer announcement; the matching forecast is superseded and the declared event is shown instead.

## Date and amount rules

- Use `asOf` as a date in the security’s exchange/market timezone; persist it with the research result.
- History window: `asOf − 24 calendar months` through `asOf`, inclusive, selected by **ex-date**. If the start month lacks that day, clamp to its last calendar day.
- Forecast windows: `asOf < ex-date ≤ December 31 of asOf year`; then January 1 through December 31 of the next year.
- Use ex-date consistently for history, forecast, matching, and calendar placement. Retain declaration, record, and payment dates when available.
- Store currency and exact decimal amount per share. Do not substitute zero for missing or unavailable amounts.
- Keep distribution type distinct: income, capital gain, return of capital, and other. Do not forecast special distributions by default.
- Provide per-share amounts and, where holdings are available, estimated holding income (`amount × quantity`) separately.

## Source research and AI extraction

1. Resolve the security using ticker + exchange and a stable identifier when available; do not identify by ticker alone.
2. Discover and fetch issuer/investor-relations pages, exchange notices, regulatory filings, and reputable secondary sources.
3. Prefer issuer and regulatory evidence; use secondary sources to corroborate or fill gaps. Record conflicts and warnings.
4. Treat fetched pages as untrusted data. Azure Foundry must extract only facts present in supplied content and return schema-constrained JSON with source URL and evidence excerpt per fact.
5. Validate every record in application code: identity, dates, currency, positive finite amount, supported type/status, uniqueness, and evidence URL. Reject unsupported or contradictory facts; never accept unsupported model assertions.
6. Store retrieval time, source URL, source authority, evidence reference/hash, model/deployment, prompt version, schema version, and warnings.

The live implementation uses Foundry's built-in Responses `web_search` tool for hosted discovery and page access. It requires no separate market-data or search account/key. The application requests actual search sources and citations, validates their association with imported claims, and stores the cited AI research for review. This evidence is model-generated research, not independently fetched publisher text; imports remain partial/non-authoritative. No arbitrary URL is fetched by the API. Source citations must be public HTTPS URLs; page content cannot invoke application tools. Microsoft's grounding terms, attribution and usage charges apply.

## Corporate-action normalization

- Store split/reverse-split actions with effective date and ratio `newShares / oldShares`.
- Declare each amount’s basis: raw/source basis or already adjusted to a named as-of basis.
- Fetch corporate actions across the full displayed and forecast-input history. Normalize pre-action history to the selected as-of share basis once. For ratio `r = newShares / oldShares`, historical amount on the old basis becomes `amount / r` on the new basis: 4-for-1 divides by 4; 1-for-10 multiplies by 10.
- Use ex-date versus effective date to determine the event’s basis. Never double-adjust provider-adjusted history.
- For announced future splits, retain both native event-basis amount and as-of-share-basis equivalent; disclose the basis used in the UI.
- Preserve raw amount, normalized amount, action IDs, and calculation version for auditability.
- Initial scope is splits and reverse splits. Other corporate actions require explicit normalization rules before support.

## Forecast specification

- Forecast only regular distributions. Explicitly distinguish issuer-declared events from model estimates.
- Detect payment cadence from sourced distribution history or issuer schedules. Estimate future dates from the observed seasonal schedule and exchange calendar; label dates as estimates unless declared.
- Forecast amounts with a versioned, deterministic model. **Recommended v1:** use up to three most recent split-normalized distributions in the same seasonal/cadence slot; use their median as the base amount. If fewer than two comparable observations exist, use the median of the latest four regular distributions only when at least two exist; otherwise return no amount estimate. Special distributions are excluded.
- Use additional sourced history (up to five years) as forecast input when available; show only the requested trailing 24 months in history.
- If at least three comparable values exist, expose their minimum and maximum as a historical estimate range. This is a scenario range, not a confidence interval.
- Prefer exact issuer-declared dates/amounts over estimates. Do not use an LLM response as the arithmetic forecast.
- Store model name/version, input event IDs, estimate date, base/range, cadence, assumptions, and data snapshot. Missing data must produce `unavailable`, not fabricated precision.

## Forecast reconciliation lifecycle

`projected → announced → completed`

- Match an announcement to a projected event by security identity, distribution type, cadence/seasonal period, and event window—not exact date alone.
- Replace the projected event in the current view with the announced amount/date; associate it with the superseded forecast.
- Replace announced values with completed values when payment data is confirmed. Actual records are not overwritten by forecasts.
- If the date/amount changes, retain prior revisions and provenance; show only the latest valid event in the active schedule.
- If no safe match exists, retain both source records with a conflict warning; do not silently merge them or double-count them in totals. Require deterministic review/reconciliation before treating both as separate payable events.
- Repeated refreshes are idempotent. A newer official source may correct an earlier source record; retain the previous value in the audit log.

## UX requirements

- Integrate with the existing **Passive Income** experience and held-security details; keep long-range annual dividend-growth estimates separate.
- Show year choices for **Current year (Actual + forecast)**, **Previous year (Actual)**, and **Next year (Forecast)**, defaulting to the current year. Include ex-date, pay date when known, per-share amount, currency, type, status, and source link.
- Mark estimates as **Projected** and declared items as **Announced**; never rely on color alone. Explain split-adjusted values and show original amount/basis on demand.
- Provide refresh action, last researched time, partial/stale status, and warnings.
- **Refresh Distribution Data** processes eligible securities sequentially, with a 15-second wait after each attempt before the next security. There is no initial or final wait. Waiting progress is announced, and leaving the view cancels queued requests.
- **Manage Dividends** is a per-holding checkbox in Holdings, applied with **Save changes**. It defaults to enabled for new and existing holdings. Turning it off skips individual and bulk distribution research without deleting saved payouts or changing their income totals. Cash remains ineligible for research.
- States: loading; no distributions found; unsupported security; partial/unverified sources; stale data; provider/rate-limit failure with retry; AI configuration/permission failure; successful refresh.
- Preserve manual payout records and identify them as user-entered. Do not imply the forecast is guaranteed or investment advice.
- Support keyboard operation, screen readers, responsive layouts, and accessible status announcements.

## API and data contract

Extend the existing `DividendResearchProvider`, `DividendResearchResult`, `RefreshHoldingDividends`, and `POST /api/v1/holdings/{holding_id}/dividends/refresh` flow. Keep the stub provider for tests and credential-free local use.

Holdings expose a persisted `manageDividends` boolean, defaulting to `true` when absent from legacy data. Updates that omit the field preserve the saved setting. Disabled holdings bypass provider calls and are excluded from security-wide research updates.

Each event should carry:

```text
eventId, securityId, exDate, declarationDate?, recordDate?, paymentDate?,
amountPerShare, currency, distributionType, status, sourceUrl, evidenceRef?,
shareBasis, rawAmount?, forecastMethod?, forecastRange?, supersedesEventId?
```

Research metadata should include `asOf`, `retrievedAt`, history/forecast boundaries, provider, authority, source snapshot ID, model/prompt/schema versions, adjustment basis, and warnings. Use stable event identity and explicit status enums. Preserve compatibility with existing manual/source payout records; version persisted/API schemas when adding required fields.

Event statuses: `completed`, `announced`, `projected`, `superseded`. Research-result status is separate: `fresh`, `partial`, `unavailable`, or `unsupported`. Existing `completed`/`announced` data must continue to deserialize.

## Architecture

- **UI:** React Passive Income/security detail; API-backed refresh and event timeline. Do not call Foundry from the browser.
- **API:** FastAPI provider adapter; source discovery/fetch adapters; Foundry extraction adapter; deterministic validators, action normalization, forecast/reconciliation services; existing holding repository persistence.
- **Provider boundary:** Keep the domain provider protocol independent of Azure SDK and web-search vendor. Inject provider implementations through the existing container.
- **Persistence:** Continue using current repository abstraction. Persist source/manual/forecast records and provenance without collapsing user-entered data. Ensure same-symbol holdings for a user stay consistent.
- **Refresh:** On demand in the initial release; enforce per-security timeout, retry/rate-limit handling, idempotency, and a refresh-freshness policy. Scheduled crawling is a later decision.
- **Observability:** Record request ID, security ID, source count, extraction/validation outcome, latency, and provider errors. Never log secrets, full credentials, or unnecessary page contents.

## Azure Foundry and environment configuration

Use the existing `FINANCE_COMPANION_` environment prefix and settings/container composition. Extend the provider choice from `stub` to `stub | azure_foundry`; fail startup for incomplete production configuration. Keep local default `stub` and the canonical credential-free Docker stack unchanged.

Configuration:

| Setting | Secret? | Purpose |
| --- | --- | --- |
| `FINANCE_COMPANION_DIVIDEND_RESEARCH_PROVIDER` | No | `stub` or `azure_foundry` |
| `FINANCE_COMPANION_AZURE_FOUNDRY_ENDPOINT` | No | Foundry inference/project endpoint for selected SDK |
| `FINANCE_COMPANION_AZURE_FOUNDRY_DEPLOYMENT` | No | Deployed model name |
| `FINANCE_COMPANION_AZURE_FOUNDRY_API_VERSION` | No | Set only if required by selected API |
| `FINANCE_COMPANION_AZURE_FOUNDRY_AUTH_MODE` | No | Prefer `entra`; allow key auth only if required |
| `FINANCE_COMPANION_AZURE_FOUNDRY_API_KEY` | Yes | Only if Foundry uses key auth instead of Entra/RBAC |

- **Local:** keep stub as default. Optional real integration uses a separate development deployment and local Entra credentials (`DefaultAzureCredential`/developer login) or ignored `.env.local` secrets. Never commit `.env.local`. Containerized real-Azure development must explicitly provide a secure credential path; do not assume host Azure CLI credentials are available inside Docker.
- **CI:** unit/contract tests use the stub or mocked Foundry/search adapters. Live AI tests are opt-in, protected, and budget-limited.
- **Production:** the API Container App uses a managed identity with least-privilege Foundry access; GitHub Actions OIDC remains for deployment only. Configure GitHub Environment `deployment` variables such as `AZURE_FOUNDRY_ENDPOINT`, `AZURE_FOUNDRY_DEPLOYMENT`, and `AZURE_FOUNDRY_AUTH_MODE=entra`, then map them to the `FINANCE_COMPANION_` runtime settings. No Foundry key is needed in GitHub Secrets in this mode. If key auth is unavoidable, use `AZURE_FOUNDRY_API_KEY` (and any required search key) as protected Environment secrets or store them in Key Vault, then inject only as Container App secret references.
- `.github/workflows/backend-deploy.yml` uses GitHub Environment `deployment`, OIDC, and configurable distribution-provider/Foundry settings; live rollout must configure those variables and the API managed identity roles. The default remains explicit stub. Keep GitHub Environment naming consistent and protected.
- Never expose Foundry/search secrets through Vite variables, frontend bundles, API responses, logs, or untrusted pull-request workflows.
- Set timeouts, bounded retries, output limits, and rate limits. Pin deployment/model and prompt/schema versions; temperature zero does not guarantee repeatable LLM output.

Example local template (no credentials):

```dotenv
FINANCE_COMPANION_DIVIDEND_RESEARCH_PROVIDER=stub
FINANCE_COMPANION_AZURE_FOUNDRY_ENDPOINT=
FINANCE_COMPANION_AZURE_FOUNDRY_DEPLOYMENT=
FINANCE_COMPANION_AZURE_FOUNDRY_API_VERSION=
FINANCE_COMPANION_AZURE_FOUNDRY_AUTH_MODE=entra
```

## Acceptance criteria

- A held supported security refresh returns sourced records for the exact trailing 24-month window and forecast windows through next calendar year-end.
- Every displayed sourced event has a security identity, date, currency, amount/basis, status, and inspectable provenance or an explicit unavailable reason.
- 4-for-1 and 1-for-10 actions normalize pre-action per-share values correctly; already-adjusted source values are never adjusted twice.
- Declared events replace matching forecasts; completed events replace announced records; repeated refreshes do not duplicate events or erase manual records.
- Conflicting or unsupported extraction data is rejected or warned; no AI-generated unsupported facts reach the UI.
- Forecast results are reproducible from the same stored input snapshot and algorithm version; each forecast is visibly labeled and never presented as guaranteed.
- Stub mode works without Azure credentials. Foundry production mode refuses to start when required endpoint/deployment/auth settings are missing.
- Foundry credentials are absent from browser output, logs, committed files, and untrusted CI contexts.
- UI clearly distinguishes actual/announced/projected data, handles loading/empty/error/partial/stale states, and is keyboard/screen-reader usable.

## Test requirements

- Unit: schema/evidence validation, source precedence, deduplication, cadence/date boundaries, decimal precision, all split/reverse-split ratios, and no double adjustment.
- Unit: forecast window boundaries, seasonality/fallback/insufficient data, exclusions for special distributions, declared-over-projected precedence, and deterministic snapshot replay.
- Integration: Foundry and search adapters mocked; malformed model JSON, prompt injection in page content, timeouts, rate limits, conflicting sources, and auth failures.
- API/persistence: ownership/authentication, same-symbol holdings, manual/source merge, schema migration/backward compatibility, idempotent refresh, and audit history.
- UI: status labels, source link, share-basis disclosure, refresh/retry, replacement of projected events, and accessible loading/error states.
- CI: no live provider calls in default test suite; optional smoke test uses protected credentials and explicit opt-in.

## Risks and decisions

- **Source/search strategy:** use Foundry hosted web search and Microsoft's grounding terms/billing. Independent publisher-text verification and broader coverage remain future improvements; the API does not scrape arbitrary URLs.
- **Forecast policy:** validate the proposed seasonal-median v1 against historical holdout data by asset class; exclude categories with poor coverage/accuracy.
- **Coverage:** define stable security-ID provider and supported exchanges/currencies before expanding beyond U.S.-listed stocks/ETFs.
- **Storage:** decide whether event-level history/audit data belongs in holding metadata or a separate distribution repository as volume grows.
- **Refresh policy:** decide freshness TTL, user-visible rate limit, and whether background refresh is needed after the on-demand release.
- **Forecast quality:** monitor forecast error by asset class and method; disable a method when source quality or observed accuracy falls below agreed thresholds.

## Implementation review and release decisions

The Passive Income **Income** view uses the three requested calendar-year choices, defaulting to the current year:

- **Current year — Actual + forecast:** completed, announced, and projected events.
- **Previous year — Actual:** completed events only. Unresolved announcements and expired projections never become actuals automatically.
- **Next year — Forecast:** sourced announcements and deterministic projections, labeled separately.

These replace the proposed History / Remaining this year / Next year navigation. The research history remains the exact trailing 24-calendar-month window; up to five years of normalized inputs are retained in the research snapshot for reproducibility. Calendar placement uses ex-date. Payment date remains supporting information. Holding income uses current quantities, since historical position ownership is not modeled. Currency totals are separate; there is no implicit FX conversion. The separate **Future Forecast** tab retains saved annual-growth assumptions.

### Data-model decisions

Extend the existing payout record and repository instead of introducing a separate distribution store in this release. Schema v2 adds stable security/event IDs, distribution type and regular/special classification, exact decimal strings, per-event share basis, raw amount/action IDs, forecast inputs/method/range, provenance, and supersession links. Existing numeric `amount` remains for older clients; calculations prefer exact `amountPerShare`. Legacy completed/announced/manual records continue to load.

`sourcePayoutDetails` contains researched facts and deterministic projections; `manualPayoutDetails` remains user-owned; `payoutDetails` is the active merged view. `payoutAuditDetails` retains revisions, and the research snapshot retains forecast inputs and algorithm version. Conflicting events carry `excludedFromTotals` and are quarantined from income totals. Security identity uses exchange plus symbol within the current supported coverage; a provider-independent permanent identifier remains future work.

### Live source strategy and configuration

Live AI research uses `DIVIDEND_RESEARCH_PROVIDER=azure_foundry`. Dividend refresh makes one Responses call with `web_search` and strict JSON output using the canonical instructions/schema in `infra/agents/`. The API checks ticker/exchange identity, positive exact amounts, date roles, and public HTTPS source URLs without a prose extraction pass. No Alpha Vantage account/key, source manifest, or hand-entered monthly history is required. The application performs all forecast arithmetic. Empty or failed research preserves saved records.

The dividend agent maps cash dividends to income on the current share basis. Explicitly special distributions do not enter recurring forecast inputs; deterministic recurrence inference remains available as `regularityBasis=inferred_cadence_v1`. Saved snapshots include the structured AI answer, citations, public search actions, and accepted event references; the Passive Income screen exposes them for inspection. Corporate actions are no longer retrieved by this provider. Public-web research is not proof of complete source coverage, so imported results carry partial-status warnings.

Local native startup reads the ignored `.env.local` only, uses your host's Azure CLI login for Foundry Entra access, and persists to `.local-data/finance.json`. See [Local Live Distribution Testing](Local%20Live%20Distribution%20Testing.md) for the template, startup command, smoke check, and restart verification. The ordinary Docker stack remains a credential-free offline demo; host login is not copied into a container.

Production uses a system- or explicitly selected user-assigned API Container App managed identity. Deployment workflows now take provider/Foundry settings from GitHub Environment `deployment` variables instead of permanently hardcoding the stub. Defaults remain explicit stub until live settings are supplied. See [Foundry Entra RBAC](Foundry%20Entra%20RBAC.md) for the project/resource roles, administrator setup script, and network/tenant/propagation checks. No Azure resource or permission changes are performed automatically by source-code editing.

### Explicit limitations

- Initial research coverage is U.S.-listed equities/ETFs in USD. Unsupported securities return an explicit state.
- Projected dates use observed seasonality and weekend adjustment. A licensed exchange holiday calendar has not been integrated; warnings disclose this and dates remain estimates.
- Insufficient, irregular, or stale regular history yields no forecast. Special distributions are excluded from projection.
- Refreshes use a short per-security freshness policy; scheduled crawling and forecast holdout/accuracy monitoring remain future work.
- Long-lived audit/snapshot storage should move to a separate security-level repository if holding metadata volume approaches storage limits.

