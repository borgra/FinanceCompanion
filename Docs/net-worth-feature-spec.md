# Net Worth Feature Spec

## Objective

Add an app-level `Net Worth` tab that provides a trustworthy, month-by-month personal balance sheet. It combines included assets and liabilities from the existing Banking and Investing areas and any supported manual accounts.

Net Worth is a point-in-time measure, not investment performance:

`Net Worth = Total Assets - Total Liabilities`

The first release should let the user:

- Review a dated net worth snapshot by month.
- See assets and liabilities separately, with clear category subtotals and a net worth total.
- See account-level values without double counting investment accounts and their holdings.
- Define a dated Beginning Net Worth baseline and see the dollar change since that date.
- Recognize incomplete, stale, or unavailable data before relying on a total.

## Product Brief

- **Customer:** An individual tracking their personal financial position over time.
- **Problem:** Banking and investment balances are fragmented, and an asset-only total can overstate a customer’s financial position when debts are omitted.
- **Desired outcome:** The customer can see a transparent, date-specific measure of their included net worth and understand what data is included.
- **First-release slice:** Included financial assets and liabilities, dated monthly snapshots, baseline comparison, and transparent data-quality states.
- **Non-goals:** Tax-adjusted net worth, investment-return reporting, broker synchronization, real-time feeds, forecasting, transactions entered solely for net worth, and household profiles.

## Definitions

### Net Worth

Net Worth is the value of all included assets less the balances of all included liabilities at the same point in time.

### Asset

An account or item with positive economic value to the customer, including supported banking balances, investment balances, and manually tracked assets.

### Liability

An amount the customer owes, including supported credit-card balances, loans, mortgages, student loans, auto loans, and investment margin debt. A liability reduces net worth; it is not stored as a negative asset.

### Snapshot

An immutable recorded value for an account at an `asOfDate`. A monthly snapshot represents the balance or fair value at the selected month-end. It includes its source, recorded-at time, and data-quality status.

### Beginning Net Worth

A user-defined baseline amount with an effective `asOfDate`. It is used only to show the change from that date; editing a baseline creates or replaces that dated comparison, not past snapshots.

### Net Worth Change

`Net Worth Change = Current Net Worth - Beginning Net Worth`

Net Worth Change includes contributions, withdrawals, debt repayment, spending, income, and market movement. It must not be labeled investment return or performance.

### Net Worth Change Percentage

`Net Worth Change Percentage = Net Worth Change / Beginning Net Worth`

Display `n/a` when Beginning Net Worth is zero or negative because percentage change is not meaningful in those cases. The dollar change remains available.

## Product Scope

### First Release Slice

1. Add `Net Worth` as an app-level tab.
2. Include supported banking and investment accounts as assets.
3. Include supported liability accounts, including credit cards and loans, as liabilities.
4. Allow a user to include or exclude each account from net worth and set their ownership percentage.
5. Store and display immutable monthly account snapshots with an as-of date and quality status.
6. Show asset subtotals, liability subtotals, and net worth for each complete month.
7. Add a dated Beginning Net Worth baseline in Configuration and show net worth change from that date.
8. Preserve historical snapshots for closed or deleted accounts.

### Non-Goals

- Broker synchronization or real-time market feeds.
- Reconstructing historical values from current market prices.
- Investment performance, return, or attribution calculations.
- Tax-adjusted net worth or tax advice.
- Automatic valuation of real estate, vehicles, private businesses, or collectibles.
- Separate household profiles or automatic joint-account splitting.

## Account Coverage and Inclusion Rules

### Supported Asset Groups

- **Banking:** Checking, savings, cash-management, and other cash accounts.
- **Investing Taxable:** Investment accounts with `investmentAccountType = Taxable`.
- **Investing Retirement:** Investment accounts with `investmentAccountType = 401k` or `IRA`.
- **Investing HSA:** Investment accounts with `investmentAccountType = HSA`.
- **Other Assets:** Manually entered assets, only when the product supports a dated value.

### Supported Liability Groups

- **Revolving Debt:** Credit cards and lines of credit.
- **Loans:** Mortgage, student, auto, personal, and other loans.
- **Investment Debt:** Margin or other borrowing secured by investments.

### Inclusion, Ownership, and Currency

- Every account has a user-controlled `includeInNetWorth` setting, defaulting to included for supported accounts.
- Every account has an ownership percentage from 0% through 100%, defaulting to 100%. Its contribution equals its snapshot value multiplied by that percentage.
- The first release supports one configured reporting currency. Accounts in another currency are not included until a dated exchange-rate policy exists; the UI must explain this clearly.
- Transferred or rolled-over accounts must not appear twice in the same snapshot. The user can exclude one side of a transfer until it is reconciled.

## Data Model and Valuation Rules

### Snapshot Requirements

Each included account snapshot must record:

- Account identifier and account status at the snapshot date.
- `asOfDate` (month-end for monthly reporting) and timezone.
- Raw balance or fair-value amount, reporting currency, and ownership-adjusted contribution.
- Value source: user entered, imported account balance, or holdings valuation.
- Quality status: `complete`, `stale`, `missing`, or `excluded`.
- Recorded-at timestamp.

Snapshots are append-only for reporting. A correction creates a visibly revised snapshot with an audit reason; it must not silently rewrite a previously displayed historical month.

### Banking Valuation

Banking accounts use their recorded balance at the as-of date. A current balance may appear only in the current, explicitly dated view; it must not be used as a historical month-end value.

### Investment Valuation and Double-Counting Prevention

Each investment account has exactly one valuation method per snapshot:

- **Account-balance method:** Use the recorded total investment-account balance, including cash.
- **Holdings method:** Sum dated holding market values plus dated account cash.

The system must never add an account balance to its underlying holdings. Holding price, quantity, and cash values must be dated on or before the snapshot’s as-of date. Current prices must never populate a past month.

### Liability Valuation

Liabilities use the outstanding balance owed at the as-of date. They are displayed as positive balances in the liability section and subtracted once in the net worth calculation.

### Closed and Deleted Accounts

Closing or deleting an account only changes its status after its last valid snapshot. Historical months continue to show its snapshot and label the account closed where helpful. An account must not disappear from history merely because it is no longer configured.

## Calculations

For month `M`:

```text
Included Asset Total(M) = sum(ownership-adjusted, complete included asset snapshots for M)
Included Liability Total(M) = sum(ownership-adjusted, complete included liability snapshots for M)
Net Worth(M) = Included Asset Total(M) - Included Liability Total(M)
```

The table may also show gross account balances, but all subtotals and totals use ownership-adjusted contributions.

### Completeness and Staleness

- A month is **complete** only when every included, active account has a complete value for that month.
- A month is **incomplete** when one or more included accounts are missing, stale, or unresolved. Show the affected accounts and do not present the net worth total as authoritative.
- Display `—` only for the individual missing value. Do not silently exclude it from a total.
- A product may offer a carry-forward estimate in a later release, but it must be opt-in, labeled `estimated`, show the source date, and remain separate from the complete total.

## UX Plan

### Tab Placement and Summary

Add `Net Worth` as a top-level app section alongside Banking and Investing. The page includes:

- Title and concise scope disclosure: “Included assets minus included liabilities.”
- A current snapshot with a prominent as-of date and completeness status.
- Total Assets, Total Liabilities, and Net Worth.
- Beginning Net Worth, its effective date, Net Worth Change, and applicable percentage.
- A clear explanation that change is not investment performance.

### Month-Based Table

Each row represents one month-end and includes:

- Month label and snapshot status.
- Asset groups: Banking, Investing Taxable, Investing Retirement, Investing HSA, and Other Assets when supported.
- Liability groups: Revolving Debt, Loans, and Investment Debt when supported.
- Group subtotals, Total Assets, Total Liabilities, and Net Worth.

Account columns may be expanded from group subtotals. On narrow screens, show group subtotals first and allow horizontal scrolling or progressive disclosure for account-level details. Keep Net Worth visually distinct.

### Empty, Partial, and Error States

- **No eligible accounts:** Explain which assets and liabilities can be added, and link to the relevant setup flow.
- **Assets but no liabilities:** Explain that the figure represents included assets until liabilities are added; do not claim the profile is complete.
- **Missing or stale account values:** Identify the affected account, its last available value/date where available, and the action needed to restore completeness.
- **Missing baseline:** Show a neutral prompt to set a dated Beginning Net Worth; still show the current Net Worth.
- **Invalid baseline percentage:** Show dollar change and `n/a` percentage with an explanatory tooltip.

## Configuration Plan

Configuration provides:

- Reporting currency.
- Beginning Net Worth currency amount and effective date.
- Account inclusion and ownership percentage controls.
- Clear disclosure that changing inclusion, ownership, currency, or baseline affects comparison outputs but does not overwrite historical snapshots.

Validate currency values, prohibit ownership outside 0–100%, and require an effective date for a baseline. Do not use a global mutable baseline with no date.

## Acceptance Criteria

- Given included asset and liability accounts with complete month-end values, when the user views a month, then Net Worth equals Total Assets minus Total Liabilities.
- Given an included liability, when the user views the table, then it appears as a positive balance in a liability group and reduces Net Worth exactly once.
- Given an investment account valued from holdings, when the user views a snapshot, then neither its recorded account balance nor its holdings are double counted.
- Given a historical snapshot, when current market prices or balances change, then the historical month’s reported value does not change.
- Given an included active account without a complete snapshot, when the user views that month, then the month is labeled incomplete and the UI identifies the affected account instead of silently presenting a partial Net Worth total.
- Given a closed or deleted account with a historical snapshot, when the user views that historical month, then the account remains represented.
- Given a baseline amount and effective date, when the user views a complete current snapshot, then the UI shows the dollar change and states the comparison date.
- Given a zero or negative baseline, when the user views Net Worth Change Percentage, then the UI displays `n/a` with a concise explanation and still displays dollar change.
- Given a jointly owned account with an ownership percentage, when the user views the total, then only the ownership-adjusted contribution is included.
- Given no liabilities have been added, when the user views the feature, then the UI clearly says the figure is based on included assets and is not a complete net-worth statement.

## Risks and Assumptions

- **Risk:** Existing account records may not distinguish asset from liability or capture a reliable as-of date. **Mitigation:** Do not mark a month complete until these fields exist.
- **Risk:** Current holdings data may lack historical prices. **Mitigation:** Show only dated saved snapshots; do not backfill history with current values.
- **Risk:** Broad account coverage creates support burden. **Mitigation:** Start with explicit supported categories and allow exclusion.
- **Assumption:** The product is a personal-finance tracker, not a source of investment, lending, tax, or legal advice.

## Deferred Decisions

1. When manual other assets and liabilities are introduced, which categories require valuation guidance or review cadence?
2. What audit history is appropriate when a user corrects a previously saved snapshot?
3. Which currency-conversion provider and month-end exchange-rate convention should be used when multi-currency reporting is introduced?
