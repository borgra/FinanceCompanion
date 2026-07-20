# Passive Income Payment Estimation and Corporate Actions Specification

## Objective

Enhance **Investing → Passive Income** so current-year and future-year payment estimates remain comparable after ordinary stock splits and reverse splits. A user records each corporate action once; the application normalizes affected per-share payment amounts to the current share basis before calculating estimated income.

The feature is designed for planning income with today's holdings, not for reconstructing historical brokerage cash flows or transaction-level performance.

## Product Brief

- **Customer:** An investor who maintains current holding quantities and imports dividend or distribution payments by ticker.
- **Problem:** A stock split changes the number of shares and the per-share payment amount. When imported payment history spans the action, using current shares against unadjusted historic per-share amounts can materially overstate or understate current and future income.
- **Desired outcome:** Current-year and next-year income estimates remain internally consistent with the current share quantity, whether the holding has undergone a simple split or reverse split.
- **First-release slice:** Dated forward/reverse split events, split-adjusted per-share payment normalization, current-year and next-year estimate display, imports, transparency, and validation.

## Scope

### In scope

1. Store dated corporate actions for a held security.
2. Support only ordinary forward stock splits and reverse stock splits.
3. Normalize imported and source payment amounts to the current share basis.
4. Calculate current-year and next-year projected gross income using current holding quantities.
5. Show the original payment amount, normalized amount, and an adjusted indicator in payment detail.
6. Provide a separate CSV import for corporate actions.
7. Preserve existing behavior when a security has no corporate actions.

### Out of scope

- Historical cash-income reporting based on shares owned at each payment date.
- Transaction, lot, broker, or position history.
- Automatic broker synchronization.
- Mergers, acquisitions, spinoffs, ticker changes, rights issues, stock dividends, special dividends, option adjustments, cash-in-lieu, or currency conversion.
- Tax withholding, reinvestment, or total-return calculations.
- Forecasts beyond next calendar year.
- Automatic application of a split to current account quantities in the first release.

## Product Definitions

### Current share basis

The unit basis represented by the holding quantities currently entered in Holdings. This is the only share quantity used for Passive Income estimates.

### Raw payment amount

The issuer or user-provided payment amount per share on the basis in effect on the payment's ex-dividend date. This is stored unchanged.

### Normalized payment amount

The raw payment amount restated into the current share basis. It is the value used for current- and future-year payment estimation.

### Corporate action

A dated conversion from old shares to new shares for one security. Example: a 4-for-1 forward split is represented by `oldShares = 1`, `newShares = 4`.

## Data Model

Add corporate actions to the security data embedded in each holding. The same symbol must have the same action set across all matching holdings for a user.

```ts
type CorporateActionType = 'stock_split' | 'reverse_stock_split';

type CorporateAction = {
  id: string;
  effectiveDate: string; // ISO YYYY-MM-DD
  type: CorporateActionType;
  oldShares: number;     // > 0
  newShares: number;     // > 0
  source: 'user';
  createdAt: string;
};

type SecurityPayoutDetails = {
  exDividendDate: string;
  paymentDate?: string | null;
  amount: number; // raw amount per share; never overwritten by normalization
  // existing fields unchanged
};

type SecurityMetadata = {
  // existing fields
  corporateActions?: CorporateAction[];
};
```

Persist `corporateActions` with the existing holding security data. The backend remains the source of truth; the UI must not calculate or persist normalized amounts as replacements for raw payments.

### Validation

- `effectiveDate` must be a real ISO date and must not be in the future for this first release.
- `oldShares` and `newShares` must be finite positive values up to a documented safe limit.
- A forward split requires `newShares > oldShares`; a reverse split requires `newShares < oldShares`.
- The same ticker, effective date, old-share count, and new-share count may appear only once.
- Reject a ratio of 1:1.
- All matching holdings for the symbol receive the same saved action set.

## Normalization Rules

For a payment with ex-dividend date `P`, define each corporate action multiplier as:

```text
actionMultiplier = newShares / oldShares
```

Include every saved action where:

```text
effectiveDate > P
```

A payment dated on an action's effective date is treated as already being on the post-action basis. This deterministic boundary rule avoids applying a split twice.

```text
shareFactorToCurrent(P) = product(actionMultiplier for included actions)
normalizedPerShare(P) = rawPerShareAmount(P) / shareFactorToCurrent(P)
projectedGrossPayment(P) = normalizedPerShare(P) × currentHoldingQuantity
```

Examples:

| Scenario | Raw payout | Action after payout | Normalized payout | Current quantity | Projected gross payment |
| --- | ---: | --- | ---: | ---: | ---: |
| 4-for-1 split | $0.80 | 1 → 4 | $0.20 | 400 | $80 |
| 1-for-10 reverse split | $0.80 | 10 → 1 | $8.00 | 10 | $80 |

Apply multiple actions chronologically by multiplying their ratios. Recalculation must be idempotent: raw payments and action records are immutable inputs, so refreshing or reopening the page cannot compound an adjustment.

## Estimate Behavior

### Current year

The current-year view represents income on the current share basis.

1. Load all current holdings and their raw payout records.
2. Normalize each payout using corporate actions after its ex-dividend date.
3. For defined current-year payments, show the normalized payment multiplied by current quantity.
4. For upcoming months without a defined current-year payout, use the existing prior-year schedule logic, but normalize the source payment before applying the existing growth-rate rule.
5. A defined payment for the same ticker and month suppresses the generated estimate for that month, as it does today.
6. Mark future-dated or generated payments as `Estimated`.

### Next year

1. Use known next-year payouts when present.
2. Otherwise project from the normalized current-year payment schedule using the existing bounded growth-rate rule.
3. Multiply every projected per-share amount by the current holding quantity.
4. Do not forecast a corporate action that has not yet occurred; future-dated actions are outside this release.

### Important disclosure

The totals are **estimated income on the current share basis**, not a statement of actual historical cash received. A user who bought, sold, or reinvested shares during the year may have received a different historical cash amount even when split normalization is correct.

## Corporate Action Import

Add a separate import control in Passive Income labeled **Import corporate actions**. Do not add action fields to the payment CSV.

### Corporate-action CSV

```csv
Ticker,Effective Date,Action,Old Shares,New Shares
MSFT,2024-06-15,Stock Split,1,4
ABC,2024-09-30,Reverse Stock Split,10,1
```

Accepted action values:

- `Stock Split`
- `Reverse Stock Split`

### Import behavior

- Parse and validate all rows before persisting any changes.
- Group by ticker and apply the complete validated action set atomically per ticker.
- Upsert the exact action identity; re-importing the same action must be a no-op, not create a duplicate.
- Report unmatched tickers without changing any other ticker.
- Updating an existing action requires an explicit edit/delete action in the first release; import must not silently replace a saved action with a different ratio.
- On success, refresh only the affected holdings and recompute the Passive Income view.

### Template download

Offer a downloadable corporate-actions template with the header and no sample rows. Keep the existing payment import template unchanged.

## UX Plan

### Passive Income header

Add a compact `Corporate actions` secondary action near payment import controls. It opens an action-management panel with:

- Download template
- Import actions
- A table of saved actions grouped by ticker
- Effective date, action type, ratio, and delete control
- Clear empty state: “No corporate actions recorded. Add a split only when a payment history spans it.”

### Payment detail

For an adjusted payment, display:

```text
$0.20/share normalized from $0.80/share after 1:4 split on Jun 15, 2024
```

Keep the existing payment date and source visible. Unadjusted payments should remain visually simple.

### Summary disclosure

Show a concise, non-alarming caption whenever at least one visible payment is adjusted:

> Estimates use current share quantities and normalize prior payouts for recorded stock splits.

Add a help affordance explaining that this does not recreate historical cash received after purchases or sales.

### Error states

- Invalid CSV: show row-specific validation error; persist nothing.
- Unknown ticker: report it as unmatched; retain successful matches.
- Duplicate action: report that it is already recorded and do not duplicate it.
- No holdings: disable action import with a clear explanation.
- Invalid/missing saved action data: leave the affected payment unadjusted, flag a non-blocking data-quality state, and never invent a ratio.

## API and Architecture Plan

### Domain and persistence

- Add `CorporateAction` to backend domain models.
- Add `corporate_actions` to `SecurityMetadata` and serialization/mapping contracts.
- Persist under the existing embedded security-details structure.
- Add a repository operation that updates corporate actions for matched holdings by ticker.

### Use cases

- `ImportCorporateActions`: validate, deduplicate, apply actions to matching holdings, and return updated holdings plus unmatched symbols.
- `DeleteCorporateAction`: remove one saved action by holding/action identifier and return the updated holding(s).
- `NormalizePayoutForCurrentBasis`: pure calculation helper shared by current-year and next-year passive-income calculations.

### HTTP endpoints

```text
PUT    /holdings/corporate-actions/import
DELETE /holdings/{holding_id}/corporate-actions/{action_id}
```

Use a response shape consistent with manual payout import:

```ts
type CorporateActionImportResult = {
  holdings: Holding[];
  unmatchedSymbols: string[];
  duplicateActions: Array<{ symbol: string; effectiveDate: string }>;
};
```

### Frontend changes

- Extend `Holding`, `SecurityMetadata`, and repository contracts with corporate action types/methods.
- Create CSV parsing and validation helpers alongside `parsePassiveIncomeImport`.
- Add pure normalization helpers; do not embed calculation rules directly in JSX.
- Update `buildPaymentsForYear` and `toDividendPayment` to use normalized per-share amounts.
- Retain raw payout amounts in state and API payloads.

## Acceptance Criteria

- Given a 1-for-4 split after a $0.80 payout, when the user holds 400 shares, then Passive Income uses $0.20 per current share and shows a gross $80 estimate.
- Given a 10-for-1 reverse split after a $0.80 payout, when the user holds 10 shares, then Passive Income uses $8.00 per current share and shows the same gross amount.
- Given multiple actions after a payout, when estimates are recalculated, then all action multipliers compose correctly and no adjustment is applied twice.
- Given a payment on an action effective date, when estimates are calculated, then that action is not applied to the payment.
- Given no corporate actions for a ticker, when estimates are calculated, then all existing calculations remain unchanged.
- Given a payment import spanning a split, when the action is imported, then affected current-year and next-year totals change only by basis normalization and do not become artificially multiplied or divided.
- Given a split event, when the user views an affected payment, then the UI identifies the normalized amount, raw amount, ratio, and action date.
- Given an invalid, duplicate, or unmatched action row, when the file is imported, then valid unrelated rows are handled according to the documented atomicity rule and no existing action is silently changed.
- Given a user changes current holding quantity, when the page recomputes, then estimates use the new current quantity without needing historical holdings data.
- Given actual historical cash is not tracked, when the user views estimates, then the UI does not label them as historical cash received.

## Test Plan

### Backend

- Validate forward and reverse split ratios, date format, duplicate identity, and future-date rejection.
- Test import upsert/no-op behavior and unmatched tickers.
- Test action persistence and round-trip serialization in in-memory and Cosmos repositories.
- Test one and multiple action factor calculations.
- Test the effective-date boundary rule.
- Test that raw payout amounts are never mutated by normalization.
- Test matching multiple holdings with the same symbol.

### Frontend

- Test corporate-action CSV parsing and error messages.
- Test 1-for-4 and 10-for-1 normalization examples.
- Test current-year defined payments, generated current-year estimates, and next-year estimates use normalized values.
- Test a payment with no action retains existing amount and total.
- Test adjusted payment disclosure and summary caption.
- Test disabled/empty/error/importing states for the corporate-action panel.
- Test a current quantity edit recomputes estimates without altering saved corporate actions or raw payments.

## Implementation Order

1. Add shared corporate-action types and persistence/mapping support.
2. Add backend validation, import, delete, and repository behavior with tests.
3. Add frontend repository methods and CSV parse/template helpers.
4. Add pure payout normalization helpers and unit tests.
5. Integrate normalized values into current-year and next-year payment estimation.
6. Add corporate-action management UI, states, and disclosure.
7. Run backend tests, focused UI tests, lint, and production build.

## Risks and Assumptions

- The action import is user-entered, so incorrect ratios can still produce incorrect estimates. Show the ratio and source clearly before/after import.
- Data providers may return already split-adjusted dividend history. The user must not add an action when all imported source payouts are already on the current share basis. The UI should explain this and make action records easy to remove.
- Current share quantities remain manual inputs. The feature must not automatically alter them in v1, avoiding accidental double-adjustment.
- The first release supports only simple share-ratio actions. Cash-in-lieu and securities that cease to exist require a later model.