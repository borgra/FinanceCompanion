# Passive Income Foundry Update Plan

Status: Phase 1 approved and implemented with the deterministic Foundry stub. Live Azure Foundry connectivity remains deferred.

## Objective

Make Passive Income the first AI-powered Finance Companion feature. The Finance Companion API will invoke a user-configured Azure Foundry agent to retrieve dividend and corporate-action facts for held securities. The application will validate and persist those facts, then use deterministic calculations and each security's persisted dividend growth rate for forecasts.

The completed feature will:

- Remove the Corporate Actions CSV download and upload workflow from Holdings.
- Let the user update dividends from Foundry for each held security.
- Cover the trailing two completed calendar years, the current year, and next year.
- Distinguish completed, announced, and application-forecasted payments.
- Show annual dividend income and average monthly dividend income while retaining the monthly bar chart.
- Replace the vertical monthly accordion with four quarter rows containing three month badges each.
- Add a Future Forecast tab with a target year defaulting to 2040 and a total-income line chart.

## Confirmed Product Decisions

1. Foundry is an agent runtime, not a direct market-data provider. The user will configure the Foundry agent, its tools, and its instructions.
2. Only the Finance Companion API calls Foundry. The browser never receives Foundry credentials or invokes the agent directly.
3. Foundry retrieves and normalizes factual dividend and corporate-action data. Finance Companion owns forecast arithmetic so results remain deterministic and testable.
4. `dividendGrowthRate` remains a persisted decimal on each security. For example, 5% is stored as `0.05`.
5. A missing growth rate is treated as 0% for forecasting and is identified in the UI rather than silently inferred from partial-year totals.
6. The existing per-security manual payment editor remains available for corrections and overrides. Only the Corporate Actions CSV workflow is explicitly removed.
7. Corporate-action data may remain in the security model for payout normalization, but it is populated by Foundry instead of user CSV upload.
8. The Future Forecast tab provides annual totals only; it does not manufacture or display monthly payment schedules.
9. Phase 1 will not call Azure Foundry. It will use a deterministic backend stub that returns a hardcoded response shaped exactly like the planned Foundry response. The UI and domain layers will use the same API and provider interfaces that the live integration will use later.

## Customer Experience

### Holdings

Each security row will have an **Update dividends** action separate from general price/security refresh. Activating it will:

1. Show an in-progress state for only that security.
2. Call the Finance Companion dividend-refresh endpoint.
3. Replace that security's Foundry-managed dividend facts only after the response passes validation.
4. Preserve its persisted growth rate and manual payment overrides.
5. Refresh the row with the retrieval timestamp and a success or actionable error message.

The Corporate Actions entries will be removed from the Holdings Download and Import menus. Existing stored actions can be replaced by the first successful Foundry refresh; they must not be discarded merely because a refresh fails.

### Passive Income — Income Tab

The default Passive Income view becomes an **Income** tab with:

- A year selector supporting current year minus two through next year.
- **Annual Dividend Income**, equal to the selected year's total.
- **Average Monthly Dividend Income**, equal to the selected year's total divided by 12.
- The existing Monthly Income bar chart for the selected year.
- Four quarter groups displayed as rows:
  - Q1: January, February, March
  - Q2: April, May, June
  - Q3: July, August, September
  - Q4: October, November, December
- Three interactive month badges per quarter. Each badge shows the month, amount, and payment count.
- An expanded payment-detail panel when a badge is activated. Existing payment details such as date, security, per-share amount, quantity, income, and estimated status remain available.

The quarter grouping must remain apparent at narrower widths. The layout may stack responsively, but reading and keyboard order must remain January through December.

### Passive Income — Future Forecast Tab

The second tab, **Future Forecast**, will contain:

- A target-year number input defaulting to 2040.
- Validation requiring a whole year no earlier than the current year; the value is not restricted to a predefined list.
- A line chart mapping aggregate forecasted dividend income by calendar year from the current year through the target year.
- A compact accessible annual-value table or equivalent text representation of the chart data.
- An empty state when no held security has positive quantity or current-year dividend income.
- A visible notice listing securities using the 0% fallback because they have no saved growth rate.

## Data and Forecasting Rules

### Retrieval window

For a refresh performed in calendar year `Y`, Foundry is asked for:

- All dividend facts from January 1 of `Y - 2` through the present.
- Any already-announced future payments in year `Y`.
- Relevant corporate actions needed to express historical per-share payouts on the current share basis.
- Source/provenance information and warnings for every result set.

Foundry-provided future values are treated as announced facts only when the response includes the required dates and source evidence. Unannounced values are calculated by Finance Companion.

### Current-year schedule

For each security:

1. Use completed payments in year `Y` as actuals.
2. Use valid announced payments later in year `Y` as announced values.
3. For a cadence slot not yet announced, project the corresponding prior-year current-basis payment as:

   `priorComparablePayment × (1 + dividendGrowthRate)`

4. Do not create a projected payment where an actual or announced payment already occupies the same expected cadence slot.

### Next-year schedule

For each security, take its completed current-year schedule—actual, announced, and projected—and apply its growth rate once:

`nextYearPayment = currentYearComparablePayment × (1 + dividendGrowthRate)`

The selected-year annual and monthly totals use current held quantities. Securities with total quantity less than or equal to zero contribute no income.

### Future annual calculator

Let:

- `Y` be the current calendar year.
- `B(s)` be security `s`'s current-year annual income using current quantities and the completed current-year schedule.
- `g(s)` be its persisted decimal growth rate, or 0 when missing.

For each year `T >= Y`:

`securityIncome(s, T) = B(s) × (1 + g(s))^(T - Y)`

`portfolioIncome(T) = sum(securityIncome(s, T))`

Growth rates below `-1` are invalid because they produce economically invalid negative compounding factors. A rate of `-1` produces zero income after the base year. Calculations must remain finite before values are rendered or persisted.

## Foundry Integration Contract

### Application boundary

Introduce a backend `DividendResearchProvider` protocol. Its Foundry implementation will depend on a reusable `FoundryAgentClient`, keeping agent transport, authentication, retries, and response extraction separate from dividend-domain validation.

### Phase 1 stub

Implement `StubDividendResearchProvider` first. It will:

- Make no external network or Azure authentication calls.
- Return a deterministic, hardcoded `schemaVersion: 1` result containing representative completed dividends across the trailing two calendar years, current-year completed and announced payments, optional corporate actions, provenance, and warnings.
- Echo or validate the requested security symbol so the response cannot be persisted against the wrong holding.
- Pass through the same parsing, validation, merge, and persistence path planned for live Foundry data.
- Be selected through server-side dependency injection/configuration, never through browser logic.
- Mark its provenance as stub data so it cannot be mistaken for researched production data.

The hardcoded fixture becomes the canonical contract fixture for the later live adapter. Replacing the stub must require changing only provider composition and transport-specific tests—not the Holdings UI, refresh endpoint, domain result types, persistence merge, or Passive Income calculations.

Suggested backend flow:

`POST /api/v1/holdings/{holdingId}/dividends/refresh`

1. Authenticate the Finance Companion user and load the user-owned holding.
2. Send structured inputs to the configured dividend research provider: symbol, exchange, currency, retrieval start/end dates, and the required output contract version.
3. In Phase 1, receive the deterministic hardcoded result from `StubDividendResearchProvider` without a network call.
4. In the live phase, have `FoundryDividendResearchProvider` authenticate with Microsoft Entra ID/managed identity, invoke the agent, apply timeout/retry rules, and extract its structured response.
5. Validate symbols, dates, finite non-negative per-share amounts, allowed statuses, duplicate identities, corporate-action ratios, adjustment basis, and provenance.
6. Merge valid Foundry-managed facts with protected manual fields.
7. Persist atomically and return the updated holding.

### Versioned structured result

The agent response should conform to an application-owned, versioned schema equivalent to:

```json
{
  "schemaVersion": 1,
  "symbol": "MSFT",
  "retrievedAt": "2026-09-04T15:00:00Z",
  "adjustmentBasis": "raw",
  "payments": [
    {
      "exDividendDate": "2026-08-20",
      "paymentDate": "2026-09-10",
      "amountPerShare": 0.83,
      "status": "completed",
      "sourceUrl": "https://example.test/source"
    }
  ],
  "corporateActions": [],
  "warnings": []
}
```

`adjustmentBasis` is required to prevent double-adjusting provider values that are already split-adjusted. The final field names may follow existing API conventions, but the schema must remain owned and validated by Finance Companion rather than accepting arbitrary agent prose.

### Configuration

Phase 1 adds a server-side provider-mode setting with the stub selected by default for development and automated tests. A deployed environment must opt in explicitly to stub mode, and responses/UI status must identify stub provenance to prevent fixture data from appearing authoritative.

The live phase will add server-only configuration for:

- Foundry project or published Agent Application endpoint.
- Agent/application identifier when it is not already part of the endpoint.
- API version or protocol version.
- Credential mode and token audience/scope.
- Request timeout and retry limits.
- Dividend result schema version.

No Foundry endpoint credentials or access tokens may be included in client bundles, browser storage, logs, or API responses.

## React and Domain Architecture

Extract the calculation logic currently embedded in `PassiveIncomePage` into pure domain utilities so the Income and Future Forecast tabs share one authoritative implementation. Suggested boundaries:

- `dividendSchedule.ts`: payout identity, current-basis normalization, cadence matching, actual/announced/projected classification, and selected-year schedule construction.
- `dividendForecast.ts`: annual per-security and portfolio compounding.
- `PassiveIncomePage.tsx`: data loading and tab selection.
- `PassiveIncomeView.tsx`: selected-year summaries, monthly chart, and quarter badge grid.
- `FutureDividendForecast.tsx`: target-year state, line chart, missing-rate notice, and accessible annual values.
- `DividendMonthBadge.tsx`: reusable badge/accordion trigger contract.

Remote holdings remain repository-owned state loaded by `PassiveIncomePage`. Selected tab, selected year, expanded months, and target year remain local UI state. Derived schedules and totals are calculated rather than duplicated in state.

## Persistence and Migration

- Continue storing dividend facts with the security data already embedded in holdings unless a separate security aggregate is introduced deliberately.
- Preserve `dividendGrowthRate` during Foundry refreshes.
- Keep Foundry-managed payouts separate from manual overrides so subsequent refreshes do not erase user corrections.
- Tag saved Foundry data with retrieval time, provider/agent provenance, and schema version.
- Remove Corporate Actions CSV parser/types, hidden file input, template generation, repository method, API endpoint, schemas, and related tests.
- Do not erase legacy corporate actions until a valid Foundry result for that security is ready to replace them.
- If the same symbol can appear in multiple persisted holdings, update its dividend facts consistently across all matching user-owned holdings or first establish a single security-data owner.

## Failure, Loading, and Empty States

- Foundry unavailable, timeout, authorization failure, malformed response, symbol mismatch, and incomplete provenance must all preserve the last valid data.
- A per-security refresh disables only that security's conflicting actions.
- Partial batch success must identify failed symbols without reverting successful updates.
- Passive Income remains usable with saved data while refresh is unavailable.
- A security without dividend history contributes zero and is identified as having no dividend data.
- A security without a growth rate uses 0% only for forecast calculations and is disclosed in the forecast UI.

## Accessibility Requirements

- Income and Future Forecast use proper tab, tabpanel, selected, and keyboard semantics.
- Month badges are buttons with month, amount, payment count, estimate status, `aria-expanded`, and `aria-controls` in their accessible names/state.
- Expanded payment panels remain reachable without pointer input.
- Quarter grouping uses semantic headings or accessible group labels.
- Charts include meaningful accessible labels and a non-visual equivalent containing exact values.
- Actual, announced, and projected values are not distinguished by color alone.
- Loading, success, and error feedback uses appropriate live-region semantics without moving focus unexpectedly.

## Delivery Sequence

### Phase 1 — Stubbed vertical slice

1. Define the versioned Foundry result schema and `DividendResearchProvider` protocol.
2. Add the representative hardcoded response as a reusable contract fixture and implement `StubDividendResearchProvider`.
3. Implement the server-side per-security dividend refresh endpoint, validation, persistence merge, and provenance using the stub.
4. Replace Corporate Actions CSV controls/contracts with the per-security Update dividends action wired through the real application API.
5. Extract and correct shared dividend schedule/forecast domain utilities.
6. Rebuild the Income tab summaries and 4-by-3 quarter badge accordion while retaining the monthly bar chart.
7. Add the Future Forecast tab, target-year input, annual compounding, line chart, and accessible value representation.
8. Remove retired code and documentation after migration behavior is covered.
9. Run full UI/API verification and focused accessibility and independent quality reviews.

### Later phase — Live Foundry adapter

1. Implement `FoundryAgentClient` and `FoundryDividendResearchProvider` against the finalized agent endpoint and structured contract.
2. Add Entra identity, RBAC, timeout, retry, telemetry, and redacted logging behavior.
3. Run the hardcoded contract fixture against both provider implementations and add recorded/sandbox Foundry contract tests.
4. Switch provider composition by server configuration after live verification; no UI or calculation rewrite should be required.

## Acceptance Criteria

- Given Phase 1 is running, when the user selects Update dividends, then the browser calls the real Finance Companion refresh endpoint, the endpoint invokes `StubDividendResearchProvider`, and no external Foundry request is made.
- Given the Phase 1 stub is invoked repeatedly for the same request, then it returns the same contract-valid hardcoded result and clearly identifies stub provenance.
- Given a held security, when the configured provider returns a valid result, then the API persists it without exposing provider configuration or credentials to the browser.
- Given Foundry returns invalid, unverified, unauthorized, or timed-out data, when refresh ends, then the prior saved security data remains intact and the user receives a useful error.
- Given a valid refresh, then dividend facts cover the trailing two calendar years and announced current-year payments, and relevant corporate actions are available without CSV upload.
- Given a saved manual payment override or saved dividend growth rate, when Foundry refresh succeeds, then those user-managed values are preserved.
- Given missing current-year announcements, then the application projects only the missing cadence slots using that security's persisted decimal growth rate.
- Given next year is selected, then each current-year comparable payment is grown once and no actual/announced payment is duplicated.
- Given no saved growth rate, then forecasts use 0% and the UI identifies the affected security.
- Given a selected income year, then Annual Dividend Income equals the sum of its payments and Average Monthly Dividend Income equals that total divided by 12.
- Given the Income tab is displayed, then all 12 month badges appear as three months within each of four visibly and semantically grouped quarters.
- Given a month badge, then it shows month, amount, and payment count and can expand its payment details with keyboard or pointer input.
- Given a valid target year, then Future Forecast shows one aggregate annual value for every year from the current year through the target using per-security compound growth.
- Given the target year defaults on first entry, then it is 2040 unless 2040 is earlier than the current year.
- Given the Future Forecast chart, then the same exact annual values are available to assistive technology without requiring interpretation of the graphic.
- Corporate Actions CSV download/import UI, repository contracts, and API endpoints no longer exist.

## Verification Plan

### Backend

- Phase 1 stub tests proving deterministic output, no network dependency, requested-symbol validation, representative year/status coverage, and explicit stub provenance.
- Provider contract tests that run the same hardcoded fixture through schema validation and persistence merging.
- Live-phase Foundry authentication/configuration and transport tests using mocked HTTP responses.
- Strict response-schema tests for malformed JSON, symbol mismatch, dates, duplicates, non-finite values, missing provenance, and adjustment basis.
- Refresh merge tests proving manual payouts and dividend growth rates survive.
- Repository tests proving valid replacement and failure atomicity.
- Authorization, timeout, retry, and partial batch behavior tests.

### Domain calculations

- Current year minus two through current year plus one coverage.
- Completed versus announced versus projected classification.
- Missing-cadence fill without duplication.
- Split-adjustment behavior for raw and already-adjusted Foundry results.
- Zero, missing, `-1`, positive, and invalid growth rates.
- Per-security compounding and portfolio aggregation through arbitrary selected years.
- Leap-day and invalid-date handling.

### UI

- Per-security refresh progress, success, and failure behavior.
- Removal of Corporate Actions import/download controls.
- Annual and monthly-average summary accuracy.
- Monthly bar chart regression coverage.
- Quarter ordering and 4-by-3 badge layout.
- Badge contents, expansion, focus, and responsive behavior.
- Tab semantics and keyboard navigation.
- Target-year validation, default 2040 behavior, line-chart values, accessible fallback, and empty states.

### Release gates

- Full API test suite.
- Full UI unit/integration test suite.
- Lint and production build.
- No obsolete Corporate Actions import references outside intentional migration documentation/tests.
- Focused accessibility review of tabs, month badges, dialogs, status messages, and charts.
- Independent requirement-by-requirement quality audit before completion.

## Implementation Prerequisites Supplied by the User

These are not blockers for the Phase 1 stub. Before live Foundry integration can be implemented and verified, the application will need:

- The Foundry project or published Agent Application endpoint.
- The configured agent/application identifier and supported protocol/API version.
- The agent's finalized instructions and tool setup.
- The Azure identity that Finance Companion will run as and its required RBAC assignment.
- Agreement on the versioned structured response schema, including provenance and payout adjustment basis.
