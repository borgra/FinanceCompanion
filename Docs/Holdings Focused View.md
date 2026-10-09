
**Status:** Draft product brief  
**Owner:** Product  
**Last updated:** 2026-10-09

## Summary

When a user selects an account within **Investing → Holdings**, show holdings for that account only. Keep the selected account clear in the view so users can inspect its positions without confusing them with holdings from other accounts. Switching the selected account updates the focused view to show the newly selected account’s holdings.

## Customer problem

When people view holdings across their investments, they need to isolate one account to understand exactly what it contains. If holdings from multiple accounts remain mixed together after choosing an account, users can misattribute positions or values. The focused view should make the selected account the clear context for every displayed holding and metric.

## Target users and need

- **Primary:** Individuals tracking investments across one or more accounts.
- **Need:** “Show me what this account holds, how much each position represents within this account, and what changed, so I can inspect it without mixing in my other accounts.”

## Desired outcomes

- Users can quickly locate and compare holdings.
- Users can distinguish position value, account weight, and performance at a glance.
- Users can open a holding’s details and return to the same portfolio context.
- Users understand when holdings or market data are unavailable or stale.

## Scope

### In scope

- An account selection control within **Investing → Holdings**, following the existing account selection pattern where available.
- A focused holdings view that includes positions from the selected account only.
- A visible selected-account name or other clear account identifier.
- Account-level summary values and data as-of time, when available.
- A scannable holdings list with asset name or ticker, market value, portfolio weight, and a clearly labeled performance value for a defined period.
- Sorting by supported columns, with the active sort communicated accessibly.
- Search or filtering by holding name or ticker when portfolio size warrants it.
- Navigation from a holding to its detail view and back to the originating list state.
- Loading, empty, error, stale-data, and partial-data states.
- Responsive behavior for narrow screens and keyboard and screen-reader access.

### Out of scope for this brief

- Trading, rebalancing, or investment recommendations.
- Adding or editing holdings or account connections.
- Tax-lot analysis, realized gains, or advanced performance attribution.
- Comparing holdings across multiple portfolios in one combined list.

## Core experience

1. The user opens **Investing → Holdings**.
2. The user selects an account from the account selector.
3. The view updates to show the selected account as the active context and lists only holdings belonging to that account.
4. Account-level summary values, position values, weights, and performance reflect that account’s data only.
5. The user can search or sort within the selected account’s holdings.
6. The user selects another account; the view updates to that account’s holdings and summary.
7. The user opens a holding for more detail and returns to the focused view for the same account, preserving list state where practical.

## Functional requirements

1. **Account selection:** Provide account selection within **Investing → Holdings**, reusing the existing account selection pattern when available.
2. **Account isolation:** After an account is selected, include only that account’s holdings in the list, search results, counts, totals, weights, and performance summaries. Do not include positions from other accounts in the focused view.
3. **Active context:** Keep the selected account’s name or identifier visible while its focused view is shown.
4. **Switching accounts:** Selecting a different account updates the displayed holdings and account-level values to that account. Do not retain holdings from the previous account during or after the update.
5. **Position rows:** Show instrument identity and available position metrics with labels, units, currency, and performance period. Never rely on color alone to communicate gains or losses.
6. **Sorting:** Support sorting on displayed sortable metrics. Provide a visible and programmatically announced direction and column; use a predictable initial order, recommended as account weight descending.
7. **Search:** Match the supported instrument name and ticker within the selected account only. Show a recoverable no-results state and a clear way to remove the query.
8. **Detail navigation:** Selecting a row opens its detail view. Back navigation restores the same selected account and prior list state.
9. **Data freshness:** Show an as-of time when supplied. If values are stale or only some fields are available, explain that status near the affected content.
10. **Currency and precision:** Follow established product formatting and the account’s relevant currency context. Do not imply precision beyond the source data.
11. **Large lists:** Keep scrolling and list updates responsive for the largest supported account. Confirm the expected maximum row count before choosing pagination or virtualization.

## States and edge cases

- **Loading:** Preserve the page structure with an announced loading state; avoid presenting placeholder values as real values.
- **No holdings:** Explain that no holdings are available and offer the existing path to connect or select an account if one exists.
- **No search results:** State that no holdings match and let the user clear the search.
- **Load failure:** Explain that holdings could not be loaded and provide a retry action.
- **Stale data:** Keep the last available data identifiable as stale and show its timestamp when possible.
- **Partial data:** Render known values and label unavailable fields; do not substitute zero for unknown data.
- **Single holding:** Keep the same layout and metrics; do not imply a diversified account.
- **Long names or tickers:** Preserve readable identity and provide an accessible full label when visual truncation is needed.
- **Negative, zero, or fractional values:** Format according to the data contract and currency rules; distinguish zero from missing.
- **Responsive layout:** Preserve instrument identity and the most decision-useful metrics on small screens; provide access to remaining metrics without forcing page-wide horizontal scrolling where feasible.

## Acceptance criteria

- A user can identify the selected account and the timestamp or freshness of its data.
- After selecting an account, every listed holding and account-derived summary value belongs to that account alone.
- Switching accounts updates the list and account-derived values so no data from the prior account is shown as belonging to the newly selected account.
- Search results and holding counts are limited to the selected account.
- Each holding’s identity, market value, portfolio weight, and labeled-period performance are understandable without relying on color.
- Sorting produces the expected order and exposes its current direction to assistive technology.
- Search returns matching holdings and provides a clear no-results recovery path.
- Opening a holding and returning preserves the selected portfolio and list state.
- Loading, empty, failed, stale, and partial-data states are distinguishable and actionable where appropriate.
- The view is usable with keyboard navigation and screen readers, and remains readable at narrow viewport sizes.

## Success measures

Instrument these after a baseline is established:

- Time to locate and open a holding.
- Successful holding-detail opens per holdings-view session.
- Search usage and no-result rate.
- Sort usage by column.
- Holdings-view load failure and abandonment rates.
- User-reported ease of understanding position size and performance.

## Dependencies and decisions to validate

- Which account selection pattern and holdings detail route already exist within **Investing → Holdings**?
- What should be selected by default when the user opens the tab: no account, a remembered account, or a specific account based on current product behavior?
- Which performance measure and period are available and consistent (for example, daily change versus total return)?
- Is account weight calculated by this product or supplied by the data service? How are cash, liabilities, and unpriced assets treated?
- What currencies, valuation timestamps, and stale-data thresholds does the current data contract support?
- What is the largest expected holdings list, and does the product already have table, search, and sorting patterns?
- Should this view be a new route, a tab, or a focused mode within the current portfolio page?

## Risks

- Ambiguous performance labels can lead users to misread daily change as total return. Name the measure and period explicitly.
- Missing prices can make totals or weights incomplete. Surface partial data and follow the source-of-truth calculation rules.
- A dense table can be difficult on small screens. Prioritize essential fields and reuse responsive product patterns.
- This view could be mistaken for investment advice. Keep the experience descriptive and avoid recommendations or implied action prompts.
