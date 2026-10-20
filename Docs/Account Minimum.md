# Account Minimum

**Status:** Draft specification  
**Last updated:** 2026-10-20

## Outcome and scope

Users configure an optional minimum balance for each banking account. **Single Account View** shows the selected account’s minimum, current-month amount, and percentage of minimum. **Bank Dashboard** replaces the editable **Emergency fund minimum** with the sum of configured account minimums.

- Initial scope: checking and savings accounts shown in Banking.
- A minimum is a user-defined target, not a bank-imposed restriction or automatic transfer rule.
- No notifications, fund movement, monthly minimum schedules, or investment-account minimums in this release.

## Configure an account minimum

- Add **Account Minimum (optional)** to existing account create/edit forms.
- Help text: “The minimum amount you want to keep in this account. Leave blank for no minimum.”
- Accept a positive USD amount with up to two decimal places, within the existing account amount limit (`999,999,999.99`).
- Blank means no minimum; entering zero clears the minimum. Negative, non-finite, malformed, or over-limit values are invalid.
- Save through the existing account persistence flow; retain entered values after validation or save failure.
- A successful save updates both views. Cancel leaves the persisted minimum unchanged.
- Editing other account fields or monthly records must preserve the minimum.

## Single Account View

For a selected account with a configured positive minimum, add an **Account Minimum** card beside existing account-detail summary cards:

| Label | Value |
| --- | --- |
| Minimum Amount | Saved account minimum |
| Current Amount | Current calendar month’s computed ending balance (`net`) |
| % of Minimum | `Current Amount / Minimum Amount × 100` |

- Display the month/year beside **Current Amount**.
- “Current Amount” uses the existing monthly projection calculation, not starting balance, year-end balance, a hovered month, or a live bank balance. Identify it as the current-month projected ending balance.
- Do not clamp percentage to 100% or clamp negative balances to zero.
- Format money using existing USD conventions; format percentages to at most one decimal place. Calculate before display rounding.
- Switching accounts updates the entire card to the selected account; no values from another account remain.
- Hide the card when no positive minimum is configured.
- Monthly draft edits may preview the current amount and percentage; label the preview as unsaved. Minimum values remain saved values until the account edit is successfully saved.

### Examples

| Minimum Amount | Current Amount | % of Minimum |
| ---: | ---: | ---: |
| $100.00 | $150.00 | 150% |
| $100.00 | $75.00 | 75% |
| $100.00 | $100.00 | 100% |
| $100.00 | $0.00 | 0% |
| $100.00 | −$25.00 | −25% |

### Current-month availability

- Resolve the actual current calendar month (`YYYY-MM`) using the app’s existing local-date convention.
- If no matching monthly record exists, or the account starts after the current month, show **Unavailable** for Current Amount and % of Minimum; still show Minimum Amount.
- Do not fall back to January, a different year, or zero for unavailable data.
- Refresh the month when the page is opened/revisited and across month rollover while the page remains open.

## Bank Dashboard

- Replace **Emergency fund minimum** and its editable input with a read-only **Total Account Minimum** value.
- Formula: `sum(saved positive minimums for the current user’s checking and savings accounts)`.
- Include each eligible account once, including accounts without current-month balance data. Accounts with no configured minimum contribute zero. Investment accounts are excluded.
- Show help text: “Combined minimums for your checking and savings accounts. Edit minimums in account settings.”
- When no minimums are configured, display **$0.00** and **No account minimums configured**.
- Reuse this aggregate as the Bank Monthly Projections threshold: balances at or above the total meet the aggregate minimum; balances below do not.
- If no positive aggregate exists, use neutral chart styling and no below-minimum warning rather than implying a configured target was met.
- Update threshold-related chart text, legends, and accessible descriptions to refer to **Total Account Minimum**, not the former emergency-fund setting.
- Keep Income Coverage and Budget Coverage calculations unchanged.
- Do not imply aggregate coverage means every individual account meets its minimum.
- Recalculate from saved accounts after create, edit, clear, or delete. Unsaved minimum edits do not change the dashboard total.

## Data and API

- Add optional `minimumAmount` to account API payloads and TypeScript models; `minimum_amount` to the Python domain model.
- Canonical persisted value: positive amount or `null` for no minimum. Missing fields in legacy records deserialize as no minimum; zero input normalizes to `null`.
- Use existing account create/update/batch endpoints, repositories, and mapper conventions; no dedicated endpoint is required.
- Apply identical validation on the client and server. Use decimal-safe money arithmetic for persistence, aggregation, and ratio inputs.
- Preserve ownership/authentication checks and prevent cross-user aggregation.
- Round-trip the field through local JSON, memory, and production persistence. Preserve it in unrelated account updates, including transfer/funding synchronization.
- The aggregate and percentage are derived values; do not store duplicate copies.

## Existing-code integration and migration

| Area | Required change |
| --- | --- |
| `src/UI/src/domain/account.ts` | Account/draft field, empty draft, round-trip mapping |
| `src/UI/src/pages/AccountPage.tsx` | Form, conditional summary card, current-month selection, derived dashboard minimum/threshold |
| `src/UI/src/pages/SettingsConfigurationPanel.tsx` | Replace guidance about the emergency-fund minimum with account-minimum guidance |
| `src/API/app/domain/models/account.py` | Optional minimum field |
| API schemas, mappers, account use cases, repositories | Validation, defaults, persistence and preservation |

- Stop reading/writing `finance-companion-emergency-threshold`; do not automatically distribute its previous value across accounts.
- Existing accounts begin with no configured minimum. The former hard-coded $20,000 default must not become an account minimum or dashboard fallback.
- If the old local setting exists, show a one-time explanation that minimums are now configured per account; do not change account values without user action.
- Current projection data is fixed to 2026. The new card must explicitly show unavailable outside supported months rather than reusing the existing first-month fallback. A broader projection-calendar redesign is outside scope.

## States and accessibility

- Loading: show loading state, not a fabricated $0 aggregate.
- Load failure: show an error/retry; do not present incomplete account loading as a complete total.
- Save failure: preserve form input and show an actionable error; keep saved dashboard values unchanged.
- Unknown current amount: show **Unavailable**, never zero or infinite percentage.
- Use visible field labels, associated validation messages, semantic card labels, keyboard-accessible editing, and responsive layout.
- Any below-minimum status must use text as well as color; percentages remain readable above 100% and below 0%.

## Acceptance criteria and tests

1. Users can create, edit, and clear a minimum; values survive reload in every supported data backend.
2. Minimum $100 and current-month amount $150/$75 produce 150%/75%, respectively.
3. Only the selected account’s positive minimum triggers its card; switching accounts cannot mix values.
4. Current Amount uses only the actual current month’s computed `net`; missing months and future-start accounts show unavailable.
5. Zero and negative current balances produce 0% and negative percentages; no division-by-zero or 100% cap occurs.
6. Minimums $100 + $200 + unset produce a read-only $300 dashboard minimum; investment-account values are excluded.
7. Saving, clearing, or deleting an eligible account updates the total and chart threshold; cancelled/failed saves do not.
8. No minimums means a $0.00 total, explanatory empty state, and neutral threshold styling.
9. Legacy records and unrelated account updates retain correct defaults/values; old localStorage settings cannot override account minimums.
10. Tests cover validation, rounding, current-month/year boundaries, month rollover, account ownership, persistence round-trip, form failures, and keyboard/screen-reader labels.
