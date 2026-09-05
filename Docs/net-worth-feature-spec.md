# Net Worth Feature Spec

## Objective

Provide one month-by-month Net Worth table whose account values can be refreshed from the Banking and Investing areas. The table is the only historical value store; there is no separate snapshot record, editor, or history.

## Data Model

`monthlyAccountValues` is an account-first map of saved table values:

```text
account id -> month label (Mon-YY) -> numeric value
```

The map applies to Banking, Taxable, Retirement, HSA, and Pension accounts. Home equity remains derived from the mortgage schedule and is not copied into this map.

Legacy `investmentSnapshots` data has the same shape and is read once as a fallback when `monthlyAccountValues` is absent. Subsequent replacement writes store only `monthlyAccountValues`. The former `monthlySnapshots` records are retired and are not migrated because they never drove the table and included different data such as capture dates, account names, and home equity.

## Table Values

For any account and month, a finite saved `monthlyAccountValues` entry takes precedence. Without a saved value, the table displays its calculated fallback:

- Banking: projected month-end balance from the Banking account ledger.
- Taxable, 401k, IRA, and HSA: holdings market value when positions exist; otherwise the account starting balance.
- Pension: its compounded account projection.
- Home value: mortgage-schedule equity.

Investment cells other than Pension remain manually editable. Manual edits update local table state and are persisted by **Save changes**.

## Snapshot Action

**Snapshot** is a bulk table edit for the user's current local month. It does not create another record or open another editor.

For every configured account, use this replacement order:

1. Current source value from Banking or Investing details.
2. Existing saved value for that account and current month.
3. `$0` when neither exists.

Source rules:

- Banking uses the current-month balance calculated from its ledger and assigned income.
- Non-pension Investing uses the sum of current holding positions. A position set totaling zero is a valid `$0` source.
- Pension uses the current-month compounded pension value.
- An investment account with no positions has no current source; its existing table value is preserved, or `$0` is used if no saved value exists.

Snapshot changes only the current month, immediately recalculates the summary and charts, announces that values were updated, and marks the table dirty. **Save changes** is the sole persistence action.

## Persistence API

- `GET /api/v1/net-worth` returns `monthlyAccountValues` with baseline, goal, and mortgage configuration.
- `PUT /api/v1/net-worth/monthly-account-values` atomically replaces the table-value map.
- `PUT /api/v1/net-worth/configuration` persists a nonnegative whole-number `netWorthGoal`; `0` disables the goal card.
- The former investment-snapshot and monthly-snapshot endpoints are removed.
- Values must be finite numbers and requests require authentication.

## Current-Year Forecast and Visuals

The table remains the source of truth for saved historical values. In the current local calendar year, months after the current month are display-only: their saved values remain in the data model and are retained when the table is saved, but users cannot edit or view them in the grid.

The **Net Worth by Month** chart uses green points and a solid line for actual months through the current local month. Future months through December are orange, dashed forecasts only; they are not persisted. The forecast is recursive compounding from the latest actual total using the arithmetic average of the valid month-over-month percentage gains in the existing current-year actuals. Pairs whose prior total is zero or non-finite are skipped; with no valid pairs, the rate is `0%`.

The current-month account-type visualization uses four reusable progress bars: Banking Checking, Banking Savings, Taxable Investing, and Retirement Investing (401k, IRA, HSA, and Pension). Empty categories remain visible as `$0`.

Summary shows Beginning Net Worth, Current Net Worth, and a single Variance card containing both amount and percentage. When `netWorthGoal > 0`, a Goal card shows the goal, `goal - current net worth` difference, and percentage complete.

## Error Behavior

- If Save changes fails, local edits remain visible and dirty so the user can retry.
- Snapshot does not erase a saved value when a source cannot be found.
- Snapshot does not overwrite other months.
- Loading failure continues to show the Net Worth load error rather than an incomplete table.

## Acceptance Criteria

- Clicking Snapshot updates the current month from Banking and Investing details without opening a secondary editor.
- All account groups use the same saved table-value collection.
- A missing source preserves the existing current-month value; no source and no saved value becomes `$0`.
- A legitimate zero holdings total remains `$0` rather than falling back to starting balance.
- Previous and future months are unchanged by Snapshot.
- Summary cards, the monthly actual/forecast chart, goal progress, and current account-type progress bars immediately reflect new current-month values.
- Save changes persists manual edits and Snapshot replacements together; a failed save remains retryable.
- There is no separate snapshot UI, history, domain type, API route, response field, or storage property.
- Mortgage configuration, table keyboard navigation, and the Beginning Net Worth comparison continue to work.
- Future-month table values remain durable but are not editable; forecast values never overwrite them.

## Non-Goals

- Broker or bank synchronization beyond the app's currently loaded account and holdings data.
- Separate dated capture history or audit records.
- Copying current values into past months.
- Including mortgage equity in `monthlyAccountValues`.
- Investment-performance or return calculations.
