# Local Development Scaffolding: Implementation Plan

> **Purpose:** Build a reliable, self-hosted local environment for Finance Companion that supports short UI/API iteration loops, deterministic Playwright testing, and production-shaped verification.
>
> **Audience:** Coding agents and developers implementing this plan incrementally.
>
> **Progress rule:** This is a living spec. Update the status ledger and the relevant task checkboxes in the same change as implementation. A checked item means its acceptance checks passed; it does not mean merely that code was written.

## Progress at a glance

**Overall status:** Not started  
**Current phase:** Phase 0 — Baseline and decisions  
**Last updated:** 2026-10-21  
**Current blocker:** None recorded

| Phase | Status | Exit evidence |
|---|---|---|
| 0. Baseline and decisions | Not started | Current commands and modes documented; decisions recorded below |
| 1. One clear lifecycle interface | Not started | CLI help, status, start/stop, and port-conflict checks pass |
| 2. Containerized fast-development mode | Not started | UI HMR and API reload verified from mounted source |
| 3. Deterministic Playwright E2E | Not started | E2E suite runs in Compose and produces retained artifacts |
| 4. Production-shaped verification mode | Not started | Built UI/API stack passes smoke and browser checks |
| 5. Agent workflow and operational hardening | Not started | Agent instructions and end-to-end developer workflow validated |

### How to maintain progress

1. Before starting work, read this document and inspect the current implementation; do not assume a checked item is still valid if its code has changed.
2. Work on one phase at a time unless a dependency requires a small preparatory change in a later phase.
3. Change a phase to **In progress** when work starts. Check individual tasks only after their stated checks pass.
4. Record exact commands run, pass/fail results, and any known limitation in that phase's **Verification record**. Do not record secrets or personal machine details.
5. Mark a phase **Complete** only after every task is checked and its exit criteria pass. If verification later regresses, uncheck the affected item, change the phase status, and explain why.
6. At each implementation handoff, update **Overall status**, **Current phase**, **Last updated**, and **Current blocker** above. Keep the table synchronized.
7. If implementation intentionally deviates from this plan, document the decision, reason, impact, and updated acceptance criteria before checking the affected task.

**Status vocabulary:** `Not started` · `In progress` · `Blocked` · `Complete`

## 1. Outcome and scope

### Desired outcome

A developer or coding agent can start the whole local application with one documented command, make UI or API changes with a short feedback loop, run focused and full Playwright tests deterministically, inspect useful artifacts, and stop the app without losing persistent developer data. The workflow must make it obvious which runtime mode is active and must not silently use host-native services when the user expects containers.

### In scope

- Containerized local API and UI.
- A hot-reloading development mode for quick work.
- A separate production-shaped mode using built application artifacts.
- A repeatable local start/status/logs/test/E2E/stop/reset workflow.
- Deterministic local auth, seed/test data, and outbound dependency behavior.
- Playwright browser tests and retained failure artifacts.
- Actionable agent instructions that use the same verified commands as developers.
- Safe local persistence and protection from concurrent API writers.

### Not in scope for the first implementation

- Replacing cloud deployment infrastructure or changing production architecture.
- Requiring cloud credentials or live third-party services for normal local development or CI E2E.
- Replacing all existing native scripts before the Docker workflow is proven.
- Building a browser-agent product or remote agent service. First provide deterministic Playwright CLI workflows and clear agent instructions.
- Treating local auth bypass, local JSON persistence, or test fixtures as production security/data patterns.

## 2. Repository baseline (verified when this plan was written)

- `docker-compose.local.yml` builds an API container and a static UI/Nginx container. It publishes ports 8000 and 5173; API JSON data is bind-mounted from `.local-data`.
- `src/API/Dockerfile` packages the API; `src/UI/Dockerfile.local` builds the static UI and serves it with Nginx. `src/UI/nginx.local.conf` proxies `/api/` to the API service.
- `start-local.ps1` starts Python/Uvicorn and Vite as native Windows processes. `stop-local.ps1` stops its tracked processes; it does not stop Compose.
- `scripts/watch-docker-ui.ps1` rebuilds the Docker UI when source changes; it is not HMR.
- `src/UI/package.json` has `@playwright/test`, Vitest, and standard build/lint/test scripts, but no Playwright config or E2E script was found.
- API tests use pytest, with `testpaths = ["tests"]` in `src/API/pyproject.toml`.
- `LOCAL_DEVELOPMENT.md` currently describes the static Compose stack as the canonical credential-free path and native scripts as a separate option. Update it when the canonical development workflow changes.
- Existing local JSON storage is single-writer. Never run two API processes/containers against the same local JSON file.

**Recheck this inventory at Phase 0.** If repository behavior has changed, update this section and the design decisions before implementation.

## 3. Architecture and behavior decisions

These are the default decisions for implementation. Change them only with a written rationale in the relevant phase record.

1. **Docker Compose is the canonical local runtime.** Native scripts may remain temporarily for workflows that require host credentials, but must be labeled native and must not be presented as the default container workflow.
2. **Use two Compose modes, not one compromised mode.**
   - **Development mode:** API runs with reload and source mounts; UI runs Vite with source mounts and HMR. This is the default for UI/API work and agent iteration.
   - **Production-shaped mode:** use built API/UI artifacts and the Nginx reverse proxy, matching the existing static UI pattern. This mode verifies packaging and runtime integration; it is not the main edit/refresh loop.
3. **Keep one browser origin where practical.** Configure the dev proxy and production Nginx routing so browser requests use the app origin and `/api/` follows the expected API path. Avoid making browser tests depend on developer-specific CORS settings.
4. **Playwright runs in a container on the Compose network.** Pin its browser image to the same Playwright version resolved by the UI lockfile. Tests address services by Compose DNS internally, not `localhost` from inside the runner.
5. **E2E data is isolated from developer data.** Use a dedicated test stack/project and test-only data path/volume. Test reset may delete only that isolated test data. Never use `docker compose down -v` as the normal stop command.
6. **Local defaults are deterministic and offline-safe.** Mock/stub cloud and external data providers in ordinary E2E. Live integrations are separate, explicitly opted-in workflows.
7. **Persist useful developer data across normal shutdown.** `down` preserves the developer data path. Provide a clearly named, explicit reset command with a confirmation or narrow, testable target.
8. **Do not run multiple API writers on a shared JSON file.** Separate dev, production-shaped, and E2E data. Detect or prevent conflicting modes before startup.
9. **Host port exposure is local-only.** Bind published development ports to loopback unless a documented use case requires LAN access.
10. **Progress is part of the deliverable.** Update this file as implementation proceeds; agents must not leave the ledger stale after a handoff.

## 4. Target user workflow

Exact command spelling may be adjusted in Phase 0, but the interface must cover these operations from the repository root and print clear usage for each:

```powershell
./dev.ps1 doctor
./dev.ps1 up
./dev.ps1 status
./dev.ps1 logs
./dev.ps1 test
./dev.ps1 e2e --grep "holdings"
./dev.ps1 verify-prod
./dev.ps1 down
./dev.ps1 reset-test-data
```

Expected semantics:

- `doctor`: report required Docker/Compose capabilities, configuration validity, and relevant port availability. Do not print secret values.
- `up`: start the development Compose mode, wait for healthy services, then print URLs, active mode/project, and stop command. Fail clearly on Docker unavailable, unhealthy services, or conflicting listeners.
- `status`: report Compose project/services/health and host port ownership where possible. Clearly distinguish Docker services from legacy native processes.
- `logs`: follow useful app logs; allow selecting a service if supported.
- `test`: run deterministic fast checks (API tests, UI lint/build/unit checks as agreed in Phase 0) and return nonzero on failure.
- `e2e`: run focused or full Playwright tests with isolated E2E state. Keep reports/traces/screenshots on the host even on failure.
- `verify-prod`: build and start the production-shaped mode, run smoke/browser checks against that mode, then stop only resources it started. Preserve developer data and test artifacts.
- `down`: stop the selected project without deleting volumes/data. Do not kill unrelated host processes.
- `reset-test-data`: explicitly reset only E2E data. Developer-data reset, if retained, must be a separate, clearly destructive command.

The final documented command names must be consistent in scripts, `LOCAL_DEVELOPMENT.md`, agent instructions, and CI.

## 5. Phase plan

### Phase 0 — Baseline and implementation decisions

**Status:** Not started

**Goal:** Resolve actual repository/runtime constraints before restructuring Compose or scripts.

#### Tasks

- [ ] Recheck all baseline items in Section 2 and inspect current Docker contexts, ignore files, environment loading, API settings, and local auth behavior.
- [ ] Record minimum supported Windows/PowerShell, Docker Desktop, Docker Compose, Node, and Python requirements. Prefer Docker-only app/test dependencies; state host requirements for control scripts explicitly.
- [ ] Decide concrete Compose file organization and project names for dev, production-shaped verification, and E2E. Reuse/evolve `docker-compose.local.yml` rather than duplicating service definitions unnecessarily.
- [ ] Confirm the dev UI proxy path and API's reload command/configuration.
- [ ] Confirm how deterministic fixtures and external-provider stubs are selected, and how test data is isolated from `.local-data`.
- [ ] Specify the E2E entry point and artifact location. Pick a Playwright container image version aligned with the lockfile and pin it.
- [ ] Record exact supported CLI command syntax and expected semantics in Section 4.
- [ ] Update the status ledger, baseline, decisions, and this phase's verification record.

#### Exit criteria

- The architecture decisions and CLI contract are implementable without unresolved questions about ports, data ownership, auth mode, or test target URLs.
- No code changes in this phase weaken production security or make live credentials a prerequisite for local E2E.

#### Verification record

- Commands run: Not run
- Result: Not run
- Notes/blockers: None

### Phase 1 — One clear lifecycle interface

**Status:** Not started

**Goal:** Make start, stop, status, and errors understandable before adding more services.

#### Tasks

- [ ] Implement the root lifecycle command (recommended: `dev.ps1`) with help and the agreed command syntax.
- [ ] Route commands to explicit Compose project/mode names; never infer Docker vs native from whether a URL responds.
- [ ] Add `doctor`, `up`, `status`, `logs`, and `down` operations.
- [ ] Add startup readiness checks for every app service. A running container is not healthy/readiness success.
- [ ] Bind published ports to loopback and check/report collisions before startup. Do not terminate a process the script did not start.
- [ ] Ensure `down` removes/stops only the selected Compose project and does not remove named volumes or bind-mounted data.
- [ ] Make failures actionable: Docker unavailable, daemon stopped, port conflict, build failure, unhealthy API/UI, and wrong active mode must be distinguishable.
- [ ] Reconcile or clearly label `start-local.ps1`, `stop-local.ps1`, and `scripts/watch-docker-ui.ps1`. Preserve any still-supported native workflow, but make its native nature explicit.
- [ ] Update `LOCAL_DEVELOPMENT.md` to present one canonical workflow and clearly document any alternative.

#### Acceptance checks

- [ ] From a clean checkout with Docker running, `doctor`, `up`, `status`, `logs`, and `down` produce the documented behavior.
- [ ] `up` waits until app health endpoints respond; it fails nonzero if a required service does not become healthy.
- [ ] Stopping the stack and starting it again preserves developer data.
- [ ] A deliberate port conflict produces a useful error and leaves the unrelated listener running.
- [ ] With Docker unavailable, the command reports the issue without silently launching native API/UI processes.
- [ ] A second `up` is safe/idempotent or reports clearly that the same project is already running.

#### Verification record

- Commands run: Not run
- Result: Not run
- Notes/blockers: None

### Phase 2 — Containerized fast-development mode

**Status:** Not started

**Goal:** Achieve fast UI/API changes without host-side app runtimes or per-edit image rebuilds.

#### Tasks

- [ ] Add or evolve a development Compose configuration with an API service using reload and a source bind mount.
- [ ] Add a UI development service using Vite, source bind mounts, and HMR. Avoid mounting over required container dependencies in a way that hides `node_modules`.
- [ ] Configure same-origin API proxying for the Vite development server.
- [ ] Keep persistent local API data in a clearly named developer-only path/volume and configure exactly one API writer.
- [ ] Configure local auth and provider behavior explicitly for development. Do not depend on ambient credentials for the standard offline loop.
- [ ] Add service health checks and `depends_on` readiness behavior where supported.
- [ ] Support source file watching on Docker Desktop/Windows; document any polling setting and keep it narrowly scoped to avoid high CPU use.
- [ ] Ensure configuration can be provided via ignored local env files with committed safe examples and validation for required values.
- [ ] Print dev URLs and explain where data/logs live.

#### Acceptance checks

- [ ] A developer can start the dev mode using only the documented host prerequisites and without host-installed Node/Python app dependencies.
- [ ] Editing a UI source file updates the browser without rebuilding the image.
- [ ] Editing an API source file reloads the API container and health returns to ready.
- [ ] The UI can make a representative API request through the local proxy.
- [ ] Restarting the dev stack preserves developer data; a missing data file initializes deterministically.
- [ ] No second API writer can start against the same JSON data location through the supported workflow.
- [ ] Local dev mode works without cloud credentials and makes no unintended live calls.

#### Verification record

- Commands run: Not run
- Result: Not run
- Notes/blockers: None

### Phase 3 — Deterministic Playwright E2E

**Status:** Not started

**Goal:** Give developers and agents a repeatable browser feedback loop, including actionable failure artifacts.

#### Tasks

- [ ] Add `playwright.config.ts` and `test:e2e` scripts. Keep unit/component tests separate from browser E2E.
- [ ] Pin Playwright package/browser versions compatibly; use `npm ci` and a matching pinned browser container image.
- [ ] Add a Compose Playwright runner on the app network. Use service DNS names as the test `baseURL`; do not use `localhost` from inside the test container to reach another container.
- [ ] Add an E2E-specific Compose project/data store/fixtures, separate from `.local-data` and the developer stack.
- [ ] Ensure the E2E setup waits for API and UI readiness and fails with useful diagnostics on timeout.
- [ ] Configure artifacts (HTML report, traces, screenshots, video only if useful) to persist in a host-visible ignored directory such as `artifacts/playwright/`.
- [ ] Configure traces/screenshots on failure and keep artifact output from being deleted by normal cleanup.
- [ ] Add an initial browser smoke test and at least one high-value user journey. Select flows based on current app behavior; avoid speculative selectors and brittle implementation-detail assertions.
- [ ] Use stable accessible roles/names and test IDs only where semantic locators are insufficient.
- [ ] Add deterministic test setup/teardown. Reset only E2E data, and make cleanup safe after interruption.
- [ ] Add `e2e` CLI support for full suite, file, and grep/tag selection, preserving exit status.
- [ ] Add a small documented browser-debug workflow for opening traces/reports locally.

#### Acceptance checks

- [ ] A clean `e2e` run starts or targets the intended app mode without host browser installation and exits nonzero when an assertion fails.
- [ ] Repeated runs against unchanged code and fixtures produce the same pass/fail result; no external service or cloud credential is needed.
- [ ] A failing test leaves a report and trace/screenshot on the host, with enough information to diagnose the failure.
- [ ] The selected E2E flow passes against the development mode through the browser-visible UI.
- [ ] E2E setup, reset, and teardown never read, reset, or write developer `.local-data`.
- [ ] Parallel or repeated E2E runs cannot corrupt one another's test data; if parallelism is not supported initially, fail/document that constraint explicitly.

#### Verification record

- Commands run: Not run
- Result: Not run
- Notes/blockers: None

### Phase 4 — Production-shaped verification mode

**Status:** Not started

**Goal:** Validate built UI/API images and production-shaped routing locally without replacing the fast HMR loop.

#### Tasks

- [ ] Preserve or refactor the existing static UI/Nginx and API image workflow into an explicit production-shaped Compose mode.
- [ ] Reuse service definitions/configuration where possible; avoid drift between development, verification, and deployment settings.
- [ ] Keep local-only auth/data behavior explicit and isolated from real production identity/secrets.
- [ ] Add a `verify-prod` command that builds, starts, waits for health, runs smoke/E2E checks against the built UI, and only tears down resources it started.
- [ ] Keep production-shaped test data separate from developer data and E2E data.
- [ ] Verify static asset paths, SPA fallback, API reverse proxy, and UI/API compatibility.
- [ ] Document the difference between this mode and actual production (local auth, local storage, mocked providers, no cloud identity).

#### Acceptance checks

- [ ] A clean build of the production-shaped mode succeeds using the pinned/locked dependencies.
- [ ] The built UI loads and SPA routes refresh successfully through Nginx.
- [ ] Browser API calls traverse the configured reverse proxy and return expected responses.
- [ ] Health and smoke checks fail the command on unhealthy services or broken routing.
- [ ] `verify-prod` does not stop a pre-existing dev stack or delete any data/artifacts.
- [ ] The E2E smoke journey passes against the production-shaped UI.

#### Verification record

- Commands run: Not run
- Result: Not run
- Notes/blockers: None

### Phase 5 — Agent workflow and operational hardening

**Status:** Not started

**Goal:** Make the system self-explanatory for people and coding agents, and close common operational gaps.

#### Tasks

- [ ] Add a focused Playwright/browser-testing agent card or workflow under `.agents/`, following repository agent conventions.
- [ ] Update relevant UX, accessibility, React quality, and DX guidance to reference the canonical lifecycle and test commands where useful.
- [ ] Make the browser agent workflow explicit: start/identify mode, select flow, run focused test, inspect artifacts, report severity/repro/expected-vs-actual, and avoid changing unrelated data.
- [ ] Add accessibility smoke coverage for critical journeys (keyboard-visible behavior and a suitable automated accessibility check where it adds reliable signal).
- [ ] Add API test execution to the canonical `test` command using the containerized toolchain or otherwise document the host requirement. Keep unit/API/E2E results distinguishable.
- [ ] Add a CI job that builds the same Compose/test images and runs deterministic tests where practical. Avoid a CI-only divergent test setup.
- [ ] Add generated reports, local data, logs, and transient files to `.gitignore` without ignoring source fixtures or intentional screenshots.
- [ ] Add a clean-machine walkthrough and record tested Docker Desktop/Compose versions.
- [ ] Verify stop/reset/error behavior, including interrupted startup and interrupted E2E cleanup.
- [ ] Update this plan's progress ledger and final verification summary.

#### Acceptance checks

- [ ] A coding agent with repository access can follow only this plan plus the agent guide to start, edit, test, inspect artifacts, and stop the app.
- [ ] A person can determine current implementation progress by reading the progress table and phase records, without inferring from commit history.
- [ ] All documented commands match actual scripts and return useful exit codes.
- [ ] Fast checks, API tests, E2E, and production-shaped verification can be run independently and have clear result output.
- [ ] Routine startup/shutdown never deletes developer data; destructive resets are separate, scoped, and documented.
- [ ] CI and local E2E use the same deterministic fixtures and compatible browser versions.

#### Verification record

- Commands run: Not run
- Result: Not run
- Notes/blockers: None

## 6. Target repository layout (proposal)

Adapt names to the current repository after Phase 0; do not create redundant wrappers/config files when an existing equivalent can be evolved.

```text
dev.ps1                              # One documented local lifecycle/test entry point
compose.yaml                         # Shared service definitions, if useful
compose.dev.yaml                     # Reload/HMR development mode
compose.verify.yaml                  # Built/static production-shaped mode
compose.e2e.yaml                     # Isolated Playwright runner/test data
LOCAL_DEVELOPMENT.md                 # Quickstart and canonical commands
Docs/Local Development Scaffolding Plan.md  # This progress-tracked implementation spec
src/UI/playwright.config.ts          # Browser test configuration
src/UI/e2e/                          # User-visible Playwright tests and fixtures
src/UI/package.json                  # E2E scripts; locked Playwright dependency
.agents/testing/playwright-agent.md # Browser testing agent workflow
artifacts/playwright/                # Host-visible reports/traces (ignored)
```

Compose file organization is intentionally a Phase 0 decision. The desired outcome is clear mode separation, shared configuration where safe, and no accidental data/port collision—not a required number of YAML files.

## 7. Test strategy and deterministic outcome rules

### Test layers

1. **Fast UI checks:** existing ESLint, TypeScript/build, and Vitest scripts.
2. **API checks:** existing pytest suite and API contract/security tests.
3. **Browser E2E:** Playwright against the actual running UI and API, with seeded local-only state.
4. **Production-shaped smoke/E2E:** browser against built UI served by Nginx, exercising same-origin API proxying.

The CLI should report each layer separately and return nonzero if any requested layer fails. Do not make a fast focused test silently run the entire suite unless that is clearly documented.

### Determinism requirements

- Fixtures have explicit initial state and reset behavior.
- Tests do not depend on current time, random data, a developer's existing records, cloud identity, or live market/provider services unless a test explicitly targets that integration.
- Network errors and service startup timeouts fail with diagnostics; do not convert test setup failures into skipped/passing tests.
- Browser selectors reflect user-visible semantics. Avoid fixed sleeps; use Playwright auto-waiting and explicit response/state assertions.
- Test execution has an explicit browser version and lockfile-controlled package version.
- Preserve Playwright artifacts on failure and publish the exact command/selection in the result summary.
- E2E state is isolated by Compose project and data path. Cleanup must be scoped to the project/data created by that invocation.

### Initial quality bar

Start with a small number of meaningful tests: application loads, a representative read path, and one important user mutation/flow that can be safely repeated against reset fixtures. Expand coverage around customer-critical behavior and error/empty/loading states rather than maximizing test count.

## 8. Risks and mitigations

| Risk | Mitigation / required evidence |
|---|---|
| Docker Desktop file watching is slow or misses changes | Verify HMR/reload on Windows during Phase 2; use polling only if needed and measure CPU/latency |
| Two modes bind the same ports or write the same JSON file | Distinct Compose project/mode identity, preflight checks, separate test state, one-writer rule |
| E2E changes developer data | Dedicated E2E project/data and tests proving developer data survives E2E and cleanup |
| Playwright package and browser image drift | Pin browser image to lockfile-resolved Playwright version and verify in CI |
| Local test accidentally calls a live service | Stub providers in default local config; add a test/assertion or network guard for the default E2E path |
| Native and Docker app instances are confused | Single canonical CLI, explicit mode in `status`, native scripts labeled and checked for port conflicts |
| Production-shaped mode appears more production-equivalent than it is | Document local auth/data/provider differences; do not pass production secrets to local Compose |
| Cleanup deletes data or unrelated containers | Avoid broad prune/down-volume operations; target named Compose project and explicit data reset only |
| Agent adds brittle UI tests | Agent guide requires user-visible locators, no fixed sleeps, reproducible fixtures, and artifact-backed reports |

## 9. Final completion checklist

Do not mark the overall plan complete until all are true:

- [ ] Canonical containerized start/stop/status workflow is documented and tested on a clean setup.
- [ ] Development mode supports UI HMR and API reload.
- [ ] Production-shaped mode builds and passes routing/health/browser smoke checks.
- [ ] Playwright runs in the supported local workflow without relying on a host-installed browser.
- [ ] Test state is isolated, repeatable, and cannot destroy developer state.
- [ ] Reports/traces/screenshots are retained and discoverable after failures.
- [ ] Fast UI/API checks, E2E, and production-shaped verification have clear commands and exit codes.
- [ ] Local auth/secrets/external-provider behavior is safe and explicit.
- [ ] Agent documentation supports short, evidence-based iterations.
- [ ] `LOCAL_DEVELOPMENT.md`, scripts, Compose configuration, agent docs, and this plan agree.
- [ ] Every phase has a verification record with commands and outcomes; no unresolved blocker is hidden.

## 10. Overall verification summary

Fill this in as phases complete; keep it concise and reproducible.

| Check | Command | Result | Evidence/notes |
|---|---|---|---|
| Clean local startup | Not run | Not run | |
| UI HMR | Not run | Not run | |
| API reload/health | Not run | Not run | |
| Fast UI checks | Not run | Not run | |
| API tests | Not run | Not run | |
| Focused Playwright E2E | Not run | Not run | |
| Full Playwright E2E | Not run | Not run | |
| Production-shaped build/smoke | Not run | Not run | |
| Data isolation and safe stop/reset | Not run | Not run | |
