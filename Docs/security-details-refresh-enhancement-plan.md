# Security Details Refresh Enhancement Plan

## Objective

Refine the background security details refresh flow for holdings so that securities added to the Holdings grid automatically receive saved market and income attributes, existing securities refresh when the app opens, and the grid updates after refreshed data is persisted.

## Requested Outcomes

- When a security is added to the Holdings grid, the app starts an async call to retrieve security details.
- Security details are saved automatically with the holding/security dataset.
- Existing saved securities refresh when the app opens.
- The grid updates after the async refresh completes and the refreshed data is saved.
- If the security already exists in the dataset, its saved security details are updated automatically.

## Current System Observations

- Holdings are managed in the React page at `src/UI/src/pages/HoldingsPage.tsx`.
- The UI uses a repository interface in `src/UI/src/domain/holdingRepository.ts` and API implementation in `src/UI/src/api/holdingApiRepository.ts`.
- Security metadata is currently embedded inside each `Holding` as `security`.
- The backend domain model is `src/API/app/domain/models/security_metadata.py`.
- The backend persists holdings by serializing `securityJson` in the holding entity.
- Security search exists through `SearchSecurities` and should use the Alpha Vantage symbol search provider.
- The refresh use cases and HTTP endpoints already exist in the backend, and the UI repository already exposes refresh methods.
- The Holdings page already loads holdings on screen open, triggers a background bulk refresh, and refreshes a newly added holding after create.

## Product Scope

### First Release Slice

Harden and finish the saved security detail refresh pipeline for held securities:

1. Keep the backend and frontend security metadata contracts in sync, including typed `detailsStatus` values.
2. Preserve the existing backend provider/use case/route wiring and verify the refresh path still persists merged security data.
3. Ensure the Holdings page surfaces background refresh state without blocking quantity edits or overwriting dirty rows.
4. Show partial, unavailable, or stale values gracefully when a provider cannot return a metric.
5. Add focused tests around provider mapping, refresh persistence, merge behavior, and UI status handling.

### Non-Goals

- Live streaming quotes.
- Broker account sync.
- Charting or historical graph views.
- Manual dividend transaction entry.
- Guaranteed availability for every metric across every asset type.

## Data Contract

Extend `SecurityMetadata` in both backend and frontend with nullable fields.

Recommended fields:

```ts
type SecurityMetadata = {
  symbol: string;
  name: string;
  exchange: string;
  assetType: string;
  currency: string;
  price?: number | null;
  sector?: string | null;
  industry?: string | null;
  peRatio?: number | null;
  thirtyDayYield?: number | null;
  fiftyTwoWeekLow?: number | null;
  fiftyTwoWeekHigh?: number | null;
  dividendPreviousYear?: number | null;
  dividendCurrentYear?: number | null;
  dividendGrowthRate?: number | null;
  estimatedFuturePayout?: number | null;
  sma20?: number | null;
  sma50?: number | null;
  sma200?: number | null;
  detailsUpdatedAt?: string | null;
  detailsStatus?: 'fresh' | 'partial' | 'stale' | 'unavailable' | 'refreshing';
};
```

### Field Notes

- `price`: latest regular market or most recent close from provider.
- `peRatio`: trailing P/E when available.
- `thirtyDayYield`: mainly applicable to ETFs and funds; leave null for unsupported securities.
- `fiftyTwoWeekLow` and `fiftyTwoWeekHigh`: saved as separate numeric fields so the UI can format the range.
- `dividendPreviousYear` and `dividendCurrentYear`: annualized dividend totals by calendar year, based on available dividend history.
- `dividendGrowthRate`: calculate only when both previous and current comparable values exist.
- `estimatedFuturePayout`: projected next-year annual payout. First release can use current indicated annual dividend or trailing twelve-month dividend as a conservative estimate.
- `sma20`, `sma50`, `sma200`: simple moving averages calculated from historical close prices.
- `detailsUpdatedAt`: ISO timestamp from the backend when details were successfully refreshed.
- `detailsStatus`: UI/backend status indicator for freshness and failure states. Current backend values include `fresh`, `partial`, and `unavailable`; `refreshing` is a UI-only transient state.

## Backend Architecture Plan

### New Provider

Add a provider protocol near the security search use case:

```python
class SecurityDetailsProvider(Protocol):
    def get_details(self, security: SecurityMetadata) -> SecurityMetadata: ...
```

The backend already follows this shape in `src/API/app/infrastructure/alpha_vantage_security_details.py`.

Provider behavior should remain isolated from search. If the implementation needs to change, keep it separate from the symbol search provider, for example:

`src/API/app/infrastructure/alpha_vantage_security_details.py`

The provider should:

- Fetch quote summary/detail data for P/E, price, 30-day yield, and 52-week range.
- Fetch dividend history for previous/current year dividend totals.
- Fetch historical close prices to calculate SMA20, SMA50, and SMA200.
- Return null for unavailable fields instead of failing the whole refresh.
- Mark the result as `partial` when some source calls fail but enough data exists to save a useful refresh.
- Raise a provider-specific unavailable error only when the refresh cannot be served at all.

### New Use Cases

Add use cases under `src/API/app/application/use_cases/security_details.py`:

- `RefreshHoldingSecurityDetails`
- `RefreshHeldSecurityDetails`

These use cases already exist; the remaining work is to confirm they keep the merged security contract stable and to add coverage for the failure modes.

Single holding refresh:

1. Load the user's holdings.
2. Find the requested holding.
3. Fetch details by `holding.security.symbol`.
4. Merge provider details into `holding.security`.
5. Save the holding through the existing holding repository.
6. Return the updated holding.

Bulk refresh:

1. Load all user holdings.
2. Deduplicate symbols.
3. Fetch details for each symbol with a bounded concurrency or simple sequential loop for first release.
4. Merge refreshed details into every matching holding.
5. Persist updated holdings.
6. Return all updated holdings plus enough status to diagnose partial failures.

### Persistence

First release can continue storing details in the existing `securityJson` embedded in each holding. That is the smallest change because the current holding repository already serializes security metadata.

If duplicate symbols become common or security details need independent lifecycle management, introduce a separate `security:{symbol}` entity later and let holdings reference it.

No schema split is needed for this slice.

### API Endpoints

Add to `src/API/app/presentation/http/routers.py`:

```text
POST /holdings/{holding_id}/security-details/refresh
POST /holdings/security-details/refresh
```

These endpoints already exist in the API.

Return `HoldingPayload` for single refresh.

For bulk refresh, return either:

- `list[HoldingPayload]` for the first release, or
- a richer response with `holdings` and `failures` if partial failure visibility is needed immediately.

Recommended first release response:

```ts
type SecurityDetailsRefreshResult = {
  holdings: Holding[];
  failedSymbols: string[];
};
```

## Frontend Architecture Plan

### Repository Contract

Extend `HoldingRepository`:

```ts
type HoldingRepository = {
  searchSecurities: (query: string) => Promise<SecurityMetadata[]>;
  listHoldings: () => Promise<Holding[]>;
  createHolding: (draft: HoldingDraft) => Promise<Holding>;
  updateHolding: (id: string, draft: HoldingDraft) => Promise<Holding>;
  refreshHoldingSecurityDetails: (id: string) => Promise<Holding>;
  refreshHeldSecurityDetails: () => Promise<SecurityDetailsRefreshResult>;
};
```

Update both:

- `src/UI/src/api/holdingApiRepository.ts`
- `src/UI/src/domain/holdingRepository.ts`

These files already expose the refresh methods; keep the contract aligned with the backend response shape.

### Holdings Page Behavior

On initial Holdings load:

1. Load accounts and holdings as it does today.
2. Render saved holdings immediately.
3. Start `refreshHeldSecurityDetails()` in the background.
4. When the refresh resolves, merge returned security fields into the current holdings state.
5. Preserve unsaved quantity edits for dirty rows.

After a refresh failure, keep the saved row visible and mark the row as unavailable or partial rather than blocking the page.

After adding a holding:

1. Call `createHolding()`.
2. Add the created row to the grid immediately.
3. Mark that row as refreshing.
4. Call `refreshHoldingSecurityDetails(created.id)`.
5. Replace only the security details on that row after the refreshed holding is returned.
6. If refresh fails, keep the row and show a non-blocking warning/status.

### Merge Rule

When refreshed holdings return, merge only `security` and timestamp/status fields into local state. Do not blindly replace `accountPositions` for rows with unsaved quantity edits.

Current UI merge behavior already avoids overwriting local quantity edits because it only replaces the security block and `updatedAt` field.

Suggested helper:

```ts
function mergeRefreshedSecurityDetails(
  current: Holding[],
  refreshed: Holding[],
): Holding[] {
  const refreshedById = new Map(refreshed.map((holding) => [holding.id, holding]));

  return current.map((holding) => {
    const next = refreshedById.get(holding.id);
    if (!next) {
      return holding;
    }

    return {
      ...holding,
      security: next.security,
      updatedAt: next.updatedAt,
    };
  });
}
```

## Grid UX Plan

Keep the current high-value columns:

- Security
- Total Qty
- Price
- Value
- Account quantity columns

Add advanced detail display without making the grid too wide:

- First release desktop columns: P/E, 30-day yield, 52-week range, dividend growth, estimated payout.
- Put SMA20/SMA50/SMA200 in a compact detail popover or expandable row if width becomes too tight.
- On mobile, avoid adding all columns. Use an expandable details area per holding.

Status behavior:

- While refreshing: show saved values and a subtle "Refreshing" status for the row.
- On success: update values in place and clear refreshing status.
- On partial success: keep the updated values and indicate that some metrics may still be missing.
- On partial unavailable metrics: show blank/dash for that metric only.
- On provider failure: keep saved values and show "Details unavailable" without blocking quantity editing.

## Acceptance Criteria

- Given I add a security, when the row is created, then the app starts a security details refresh without requiring a manual save.
- Given the refresh succeeds, when details are saved, then the grid updates the matching row with the saved refreshed values.
- Given the refresh fails, when the row has already been added, then the holding remains in the grid and the app shows a non-blocking failure state.
- Given I open the Holdings experience, when saved holdings load, then the app starts a background refresh for held securities.
- Given a security already exists in the dataset, when it is part of the refresh set, then its saved details are updated automatically.
- Given I am editing quantities while a refresh completes, then my unsaved quantity edits are not overwritten.
- Given a detail field is unavailable for an asset type, then the UI shows an empty/dash state and does not fail the whole row.
- Given the provider returns partial data, then the UI keeps the refreshed metrics and labels the row accordingly.
- Given multiple holdings use the same symbol, when the symbol refreshes, then all matching saved holdings receive the refreshed details.

## Test Plan

### Backend

- Unit test security detail provider mapping with complete and partial provider payloads.
- Unit test dividend previous/current year calculations.
- Unit test SMA calculations for 20, 50, and 200 day windows.
- Unit test single holding refresh persists merged security details.
- Unit test bulk refresh deduplicates symbols and updates matching holdings.
- Unit test provider failure keeps existing saved data and reports failed symbols.
- Unit test partial provider responses persist `partial` status without discarding available metrics.

### Frontend

- Test Holdings page calls bulk refresh after initial holdings load.
- Test add security flow creates a row, then calls single holding refresh.
- Test refreshed details update price/value in the grid.
- Test dirty quantity edits survive a refresh response.
- Test unavailable metrics render as dash/empty values.
- Test partial status is surfaced without blocking the row.
- Test refresh failure keeps the holding visible and reports a non-blocking status.

## Implementation Order

1. Extend backend and frontend security metadata schemas.
2. Harden backend provider mapping and calculation helpers for dividends and SMAs.
3. Verify refresh use cases and routes preserve holdings data correctly on save.
4. Keep API repository methods aligned with the backend response shape.
5. Verify Holdings page background refresh on load.
6. Verify after-create refresh behavior.
7. Tighten grid status display for `fresh`, `partial`, `unavailable`, and refresh states.
8. Add focused backend and frontend tests.
9. Run backend tests, UI tests, lint, and build.

## Risks

- Alpha Vantage endpoints may not consistently expose all requested fields for every asset type. Keep provider code isolated so another market-data provider can replace it later.
- Alpha Vantage can return some metrics while failing others. Treat those cases as partial success so the row still gets useful saved data.
- 30-day yield is not applicable to every security type and may be missing for common stocks.
- Dividend growth rate can be misleading if calculated from partial current-year data. Label or compute it carefully.
- Refreshing every app open can hit provider rate limits. Add a freshness threshold, such as skip refresh when `detailsUpdatedAt` is less than 12 hours old.
- Embedded security details duplicate data when the same symbol appears in multiple holdings. This is acceptable for the first release but should be revisited if shared symbol data becomes a broader feature.

## Handoff

Next agent: React Component Engineer after backend contract is approved.

Why: the plan has enough product, data, API, and UI behavior detail to begin implementation in small slices while preserving existing holdings behavior.
