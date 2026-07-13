# Net Worth Feature Spec

## Objective

Add a new app-level `Net Worth` tab that combines data from the existing Banking and Investing areas into a month-by-month net worth snapshot table.

The first release should let the user:

- Review net worth by month in a tabular layout.
- See account-level columns grouped into Banking, Investing Taxable, Investing Retirement, and Investing HSA.
- See a Total column for each month.
- Define a Beginning Net Worth value in Configuration and use it to calculate variance amount and variance percentage.

## Requested Outcomes

- `Net Worth` appears as a top-level app tab alongside `Banking` and `Investing`.
- The tab reads from the same account data used by Banking and Investing.
- The table is organized by month rows.
- The table shows one column per account plus a Total column.
- Accounts are grouped into the following sections:
  - Banking
  - Investing Taxable
  - Investing Retirement
  - Investing HSA
- The app stores a Beginning Net Worth value in Configuration.
- The Net Worth view shows:
  - Beginning Net Worth
  - Net Worth variance amount
  - Net Worth variance percentage

## Current System Observations

- The current landing page has app-level sections for Configuration, Budget, Banking, and Investing.
- Banking data is managed through `Account` records.
- Investing data is managed through `Account` records plus `Holding` records.
- Investment accounts already carry an `investmentAccountType` with values such as `Taxable`, `401k`, `IRA`, and `HSA`.
- Holdings already aggregate current position value by investment account in the Investing tab.
- Account screens already model monthly records, which gives the app a month-based structure to reuse for net worth reporting.

## Product Scope

### First Release Slice

1. Add a `Net Worth` tab at the app level.
2. Build a month-based table that merges Banking and Investing account values.
3. Group account columns into Banking, Investing Taxable, Investing Retirement, and Investing HSA.
4. Add Beginning Net Worth to Configuration.
5. Compute variance amount and variance percentage from the current total net worth and Beginning Net Worth.
6. Preserve the existing Banking and Investing tabs without changing their core workflows.

### Non-Goals

- Broker synchronization.
- Real-time market feeds.
- Forecasting or scenario modeling beyond the existing month snapshots.
- Manual transaction entry specifically for net worth.
- Separate family or household net worth profiles.

## Definitions

### Net Worth

Net Worth is the total value of all included Banking and Investing accounts for a given month.

### Beginning Net Worth

Beginning Net Worth is the user-defined baseline stored in Configuration. It is used as the comparison value for variance calculations.

### Variance Amount

Variance Amount = `Current Net Worth - Beginning Net Worth`

### Variance Percentage

Variance Percentage = `(Variance Amount / Beginning Net Worth) * 100`

If Beginning Net Worth is zero or missing, the percentage should display as `n/a` rather than dividing by zero.

## Data Model

### Source Data

The Net Worth tab should read from existing data already used elsewhere in the app:

- Banking accounts from the Account area.
- Investment accounts from the Account area.
- Holding positions from the Investing area when needed for current invested value.

### Account Grouping Rules

Use the following grouping rules for display:

- Banking:
  - Non-investment accounts used for checking and savings style balances.
- Investing Taxable:
  - Investment accounts with `investmentAccountType = Taxable`.
- Investing Retirement:
  - Investment accounts with `investmentAccountType = 401k` or `IRA`.
- Investing HSA:
  - Investment accounts with `investmentAccountType = HSA`.

### Month Rows

Each row represents one month.

The table should show:

- Month label.
- One column per account.
- Group subtotal columns or group separators only if they help readability.
- A Total column for the month.

## Calculations

### Per-Account Value

For each month, each account should contribute a single value into the table.

Recommended first-release rule:

- Banking accounts use their month-specific balance value already represented in account records.
- Investing accounts use their month-specific investment value derived from the account and holding data already present in the app.

### Monthly Total

Monthly Total = sum of all included account values for that month.

### Variance Fields

The Net Worth summary should show:

- `Variance Amt = Monthly Total - Beginning Net Worth`
- `Variance % = Variance Amt / Beginning Net Worth`

Format the amount as currency and the percentage as a signed percent with a reasonable precision, such as one or two decimal places.

## UX Plan

### Tab Placement

Add `Net Worth` as a top-level app section in the same place as Banking and Investing.

### Screen Layout

The page should include:

- A clear title, `Net Worth`.
- A short description explaining that it combines Banking and Investing accounts.
- A summary area for Beginning Net Worth, current total net worth, variance amount, and variance percentage.
- A table with month rows and account columns.

### Table Presentation

Recommended structure:

- Group Banking accounts together first.
- Then show Investing Taxable.
- Then Investing Retirement.
- Then Investing HSA.
- Keep the Total column visually distinct.

The table should make it obvious which accounts belong to each group without forcing the user to inspect raw account settings.

### Empty and Partial States

- If no accounts exist yet, show a helpful empty state explaining that Banking and Investing accounts are needed before net worth can be calculated.
- If some accounts are missing values for a month, display a safe placeholder such as `—` while still rendering the rest of the row.
- If the Beginning Net Worth setting is missing, show a callout prompting the user to set it in Configuration.

## Configuration Plan

Add a Beginning Net Worth field to the Configuration area.

Recommended behavior:

- Store the value as a currency amount.
- Allow the user to edit it directly from Configuration.
- Use this value immediately in the Net Worth summary.
- Persist it using the same configuration storage pattern already used by the app.

## Acceptance Criteria

- `Net Worth` is visible as a top-level tab.
- The Net Worth tab renders a month-based table.
- Banking and Investing account data are both represented.
- Account columns are grouped into Banking, Investing Taxable, Investing Retirement, and Investing HSA.
- The table includes a Total column.
- Beginning Net Worth can be set from Configuration.
- Variance amount and variance percentage are calculated from Beginning Net Worth.
- The view handles empty or partially populated data without breaking.

## Open Questions

1. Should the Net Worth table show only currently configured accounts, or should it also preserve deleted accounts in historical months?
2. Should monthly values be based on saved snapshots only, or should current holding prices be reused for each month until historical valuation is added?
3. Should the table include section subtotal rows for Banking and each Investing subtype, or only grouped columns?
