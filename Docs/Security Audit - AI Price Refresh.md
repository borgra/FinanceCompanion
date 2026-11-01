# Security audit: AI price/details refresh

Reviewed November 1, 2026. Scope: the uncommitted Foundry price/details restoration, new price provenance fields, API/UI/storage integrations, and their directly relevant existing controls and dependencies. The original findings below record the audit snapshot. Remediation was then applied at the user's request.

## Remediation status

All four original findings have code/dependency fixes in the workspace:

- TLS trust bundle: `certifi>=2026.10.19` is required; the local environment now uses 2026.10.23. Container builds consume the new minimum. Installed production-image verification remains a deployment task.
- AI cost controls: 60-second listing cooldowns, per-user/global attempt budgets, one active request per user and two globally. Production uses an atomic, ETag-protected shared Cosmos entity; storage failure prevents inference. HTTP 429 includes `Retry-After`. Expiring leases recover from process crashes. The UI displays the retry message and stops a bulk refresh when throttled.
- Provenance: client assertions of quote origin/freshness are ignored on create/update/batch. Unrelated edits preserve saved server provenance; changed prices/listings become manual. Invalid/future legacy quote dates can recover through new research.
- Development dependencies: Vitest/mocker 4.1.12 and patched minimatch 11.0.3; full and production-only npm scans returned zero findings. OSV checked 48 installed Python packages with zero findings; `pip check` passes.

Additional integrity and public-repository safeguards:

- Refresh re-reads the owned holding after inference and merges into current data, preserving quantity, settings and distribution edits made during that slow operation. Conflicting price/listing changes are rejected; deleted holdings are not recreated. General repository writes still do not provide end-to-end optimistic concurrency between the final read and persistence.
- Personal email literals were replaced with reserved demonstration addresses in current source, examples and tests. Production requires an explicitly configured allowed email. Ignored credentials and user data were left untouched.
- A standard-library public-content checker and a read-only, credential-free CI job check publishable files for recognizable credentials, sensitive local paths, and personal email addresses. The history credential scan checked 1,378 reachable blobs and found no matching credential signatures; no commits touched the ignored local credential/data paths checked in the audit. This is a focused signature scan, not proof that every kind of secret is absent.
- Old commits can retain the previously committed personal email; history was not rewritten. Removing a value from current files does not erase public forks or prior copies.

Final API regression verification: 393 tests passed. The UI has 316 passing tests after the retry-message regression case; build and lint pass with existing warnings. No live Azure research was needed for remediation tests. Rebuild/redeploy the API and frontend to activate these changes in hosted instances.

## Original findings

### 1. P1: installed Python TLS trust bundle has a critical upstream advisory

**Origin:** Existing local dependency; not introduced by the price-refresh diff.

The API virtual environment contains `certifi==2026.7.22`. OSV reports GHSA-6q48-6c7w-9gw2 and PYSEC-2026-4320, which are two identifiers for the same issue. The certifi maintainer rates the issue critical and identifies 2026.10.18 as the patched release. PyPA recommends 2026.10.19 or later.

Affected bundles trust an emSign root with compromised intermediate keys. An attacker with an affected key and a position on the network path could impersonate HTTPS hosts. This could expose authentication headers or modify upstream responses. There is no evidence that this workspace has been attacked.

The installed HTTPX SSL-context implementation uses certifi by default unless an alternate certificate file/directory or SSL context is supplied. The Foundry client at `src/API/app/infrastructure/foundry_web_research.py:184` does not explicitly supply a different SSL context. The deployed container's installed versions and trust configuration were not inspected, so production exposure remains unverified.

**Remediation:** Upgrade the local environment to `certifi>=2026.10.19`, enforce a safe minimum or audited dependency constraints, and check/rebuild deployed images. Repeat the dependency scan afterward. `src/API/pyproject.toml` currently does not constrain this transitive package.

Sources: [certifi maintainer advisory](https://github.com/certifi/python-certifi/security/advisories/GHSA-6q48-6c7w-9gw2), [PyPA advisory via OSV](https://osv.dev/vulnerability/PYSEC-2026-4320).

### 2. P2: repeated price refreshes can spend AI quota without server enforcement

**Origin:** Newly exposed in Foundry mode by restoring the previously disabled endpoint.

Locations: `src/API/app/infrastructure/foundry_security_details.py:89` and `src/API/app/application/use_cases/security_details.py:120`.

Each individual refresh starts fresh research even when a quote has just been saved. The backend has no short cooldown/cache, shared in-flight request guard, per-user rate limit, or AI concurrency limit. Each request permits two model calls and up to six web tool calls, with a 90-second research budget. The existing 48-hour freshness check applies to bulk refresh; disabling a UI button does not constrain direct API clients.

**Verified local reproduction:** Two immediate POSTs for the same holding returned `[200, 200]` and produced four mocked model requests, including two search-enabled requests. No live Azure requests were made for this reproduction.

**Impact/preconditions:** A valid authenticated session with access to a holding can repeatedly or concurrently consume Azure quota and API worker capacity. This is not an anonymous authorization bypass. The deployment's HTTP autoscale concurrency threshold is not a request admission limit.

**Remediation:** Add a short server-side cache/cooldown, deduplicate simultaneous requests by user/listing, and enforce bounded per-user and shared concurrency/rate limits. Return a clear retry time when throttled. Multi-instance deployments need enforcement appropriate to their shared state.

### 3. P2: client-supplied provenance can impersonate AI research and block refresh

**Origin:** Introduced by the new writable metadata fields.

Locations: `src/API/app/presentation/http/schemas.py:284` and `src/API/app/infrastructure/foundry_security_details.py:132`. The display at `src/UI/src/components/SecurityDetailsDialog.tsx:183` labels these fields as AI web research.

`priceAsOf`, `priceSourceUrl`, and `priceBasis` are plain strings on the shared read/write metadata schema. Holding create/update/batch requests accept them as client assertions. The backend does not establish that these values originated from its research provider.

**Verified local reproduction:** An authorized PUT accepted `price=999`, `priceAsOf="9999-12-31"`, `priceBasis="latest_close"`, and an arbitrary HTTPS source URL with HTTP 200. The next refresh returned HTTP 503 because the date-regression guard considers the forged future date newer than a genuine quote. A client can also leave old provenance attached while changing a price through the generic write API.

**Impact/preconditions:** Incorrect research attribution and loss of refresh availability for the affected owner's data. The caller must already have write access to that holding; no cross-user privilege escalation was found.

**Remediation:** Make research provenance server-owned. Ignore incoming assertions on creation; preserve stored provenance on unrelated edits; clear it when a price or listing changes. Enforce valid dates, supported basis values, public HTTPS URLs, and reasonable string lengths. Ensure invalid/future legacy provenance cannot permanently block recovery.

### 4. P2: existing frontend development dependencies have moderate advisories

**Origin:** Existing dependency versions and lockfile; neither manifest nor lockfile changed in the price-refresh diff.

`npm audit` returned 14 moderate affected-package entries across three underlying advisories, with no high or critical npm findings. These are development-tool dependencies. `npm audit --omit=dev` returned zero findings.

- `vitest` / `@vitest/mocker` 4.1.11: code injection through unauthenticated manual mock registration and a Windows redirect-allowlist path traversal bypass. Both advisories identify 4.1.12 as patched. Exploitation depends on running the affected mocker plugin/dev server and an attacker reaching that interface; the production static app does not execute the test server. This audit did not establish that those development-server attack conditions are active here.
- `minimatch` 3.1.5 and 10.2.6 occur in the lint/type tooling tree. npm flags these under its affected range for glob-pattern amplification. The maintainer specifically describes the 10.2.6 issue with optimization level 2 or higher, attacker-controlled patterns, and CPU/memory exhaustion. Actual reachability through this project's lint configuration was not demonstrated.

**Remediation:** Upgrade Vitest to at least 4.1.12; update the lint tooling and compatible minimatch versions, then regenerate and audit the lockfile. Assess the actual affected minimatch call sites before treating every propagated npm entry as a separate exploitable issue. Avoid an automatic forced downgrade: npm's suggested fix includes an older major tooling combination and needs compatibility review.

Sources: [Vitest code injection advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-qxg6-89mg-rqv8), [Vitest Windows traversal advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-xp26-3454-mjgp), [minimatch maintainer advisory](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249).

## Controls verified

- Isolated HTTP checks returned 401 for no session, 404 for a different user's holding, and 403 for an untrusted Origin. None triggered a model call.
- Refresh looks up the holding within the session user's repository before contacting the provider.
- Foundry credentials stay in HTTP headers. Model input contains security identity and the research date, not account quantities, cost bases, session tokens, or application secrets.
- Configured inference endpoints are restricted to supported Azure HTTPS addresses; redirects are disabled.
- Citation source URLs are validated and saved, not fetched by the API. No new server-side arbitrary URL fetch, command execution, or database query-construction sink was found.
- Model output passes strict schema, listing, citation, numeric-range, and date checks before saving a price. Upstream errors are replaced with fixed messages rather than leaking response bodies or credentials.
- React escapes source-derived text; the source-link helper permits HTTP(S), rejecting `javascript:`. External links use `noreferrer`. The security details component's focused suite passed all 29 tests.
- Distribution records and source/manual payout metadata remain outside the new provider's write scope.

## Checks and limits

- Independent backend and UI/persistence review passes, followed by local mocked HTTP reproductions.
- npm full and production-only advisory checks; OSV batch query for 48 installed Python packages, with explicit user approval to disclose package/version inventory.
- Advisory matches checked against maintainer/PyPA sources. The two certifi identifiers were deduplicated.
- Previous functional verification reported 358 backend and 315 UI tests passing. This audit used focused tests/proofs; it did not rerun all functional suites or spend live Azure research credits.
- No production penetration test, deployed-image inventory, cloud-role audit, or real adversarial model/web-search campaign was performed.
- Citation presence establishes that the AI answer references a source; it does not independently prove that the publisher stated the numeric fact. Model hallucination and hostile web content remain data-integrity risks. The application labels the result as AI research, not an independently verified real-time feed.

The original remediation sequence is complete in the workspace. Hosted rollout and any separate public-history sanitization remain outside this code change; Alpha Vantage cleanup has not started.
