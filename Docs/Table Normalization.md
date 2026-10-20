# Table Normalization

**Status:** Draft specification  
**Owner:** Product / Engineering  
**Last updated:** 2026-10-20

## Summary

Normalize all tables across the Finance Companion UI so every table shares the same keyboard navigation, single-press input entry, full-value selection, and row-stability behavior while editing.

1. **Keyboard navigation:** Users can navigate any table using `Tab`, `Shift+Tab`, `Return` (`Enter`), and Arrow keys (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`).
2. **Full-value highlighting:** Selecting a cell (via mouse/pointer or keyboard) highlights the entire value of its input.
3. **Row stability during edits:** Removing or zeroing a value in a cell never causes rows to disappear while the cell remains focused; row removal or filtering occurs only after blurring away from the cell.
4. **Single-press input entry:** Pressing `Return` (`Enter`), `Tab`, or `Shift+Tab` (as well as Arrow keys into editable cells) enters directly into the cell's input and highlights its value on **1 button press**—eliminating the two-step "highlight cell, then press Return again" behavior seen in the Holdings table.

---

## Customer problem

Tables across Banking, Investing, and Net Worth currently behave inconsistently:

- **Double-Return friction:** `useTableBodyCellTabNavigation` places focus on the outer `<td>` when moving between cells via `Tab`, `Shift+Tab`, or `Enter`. Users must press `Enter` a second time to enter the `<input>` inside the cell (most noticeable when editing quantities or prices down a column in **Investing → Holdings**).
- **Lost text selection on focus:** `FinanceMoneyCellInput` switches its DOM `value` from a formatted currency/number string (`$510.25`) to an unformatted `draftValue` (`510.25`) on focus. Because `event.currentTarget.select()` runs synchronously before React commits the state change, the browser collapses the selection when the unformatted value renders, or mouse-up clears the selection on click.
- **Disappearing rows mid-edit:** In **Investing → Holdings** (when filtered to a single account) and **Net Worth → Mortgage Schedule**, backspacing a cell value to empty (`''`) or `0` immediately updates parent state and filters out the row while the user is still typing in the cell.
- **Unnormalized tables:** Read-only tables in **Investing → Passive Income** (`DistributionPaymentsTable` and `future-dividend-table`) use raw `<table>` elements instead of the shared keyboard-navigable table primitives.

---

## Scope

### Tables in scope

Every data and ledger table in the UI must use the shared `FinanceTable` component (`variant="spreadsheet"` or `variant="plain"`) and its companion cell/retention primitives (`FinanceTableHeaderCell`, `FinanceMoneyCellInput`, `FinanceCellInput`, `FinanceMoneyCellValue`, `useFinanceTableRowRetention`):

| Area | Page / Component | Table | Current primitive | Target primitive |
| --- | --- | --- | --- | --- |
| Banking | `src/UI/src/pages/AccountPage.tsx` | Monthly account ledger | `FinanceTable` | `FinanceTable` |
| Investing → Funding Schedule | `src/UI/src/pages/FundingSchedulePage.tsx` | Monthly contribution & allocation table | `FinanceTable` | `FinanceTable` |
| Investing → Funding Schedule | `src/UI/src/pages/FundingSchedulePage.tsx` | Pension projection table | `FinanceTable` | `FinanceTable` |
| Investing → Holdings | `src/UI/src/pages/HoldingsPage.tsx` | Holdings positions & prices table | `FinanceTable` | `FinanceTable` + `useFinanceTableRowRetention` |
| Investing → Passive Income | `src/UI/src/features/passiveIncome/DistributionPaymentsTable.tsx` | Monthly distribution payments table | Raw `<table>` | `FinanceTable` (`variant="plain"`) |
| Investing → Passive Income | `src/UI/src/pages/PassiveIncomePage.tsx` | Annual dividend forecast table (`future-dividend-table`) | Raw `<table>` | `FinanceTable` (`variant="plain"`) |
| Investing → Retirement Planning | `src/UI/src/features/retirementPlanning/RetirementPlanningPage.tsx` | Contribution years, Bridge years, Standard retirement years tables | `KeyboardNavigableTable` | `FinanceTable` (`variant="plain"`) |
| Net Worth | `src/UI/src/pages/NetWorthPage.tsx` | Monthly net worth table | `FinanceTable` | `FinanceTable` |
| Net Worth → Mortgage Schedule | `src/UI/src/pages/MortgageSchedulePanel.tsx` | Mortgage amortization & override table | `FinanceTable` | `FinanceTable` + `useFinanceTableRowRetention` |

### Out of scope

- Converting card/accordion lists (such as Income Sources or Budget category accordions) into HTML tables unless they already render tabular grids.
- Spreadsheet formula evaluation, multi-cell range selection, or drag-fill handles beyond existing fill-down buttons.

---

## Functional requirements

### 1. Keyboard navigation (`Tab`, `Shift+Tab`, `Return`, Arrow keys)

All visible `<tbody>` cells (`<td>` and `<th scope="row">`) participate in a unified 2D visual grid that accounts for `rowSpan`, `colSpan`, and dynamically shown/hidden columns or rows:

| Key | Behavior |
| --- | --- |
| `Tab` | Moves forward in reading order (left-to-right across the row, wrapping to the first cell of the next row). If a cell has multiple interactive controls (such as an `Actions` cell), traverses enabled controls in order before advancing to the next cell. At the last cell of the table, `Tab` exits the table into the page's natural focus order. |
| `Shift+Tab` | Moves backward in reverse reading order, wrapping to the last cell of the previous row. At the first cell of the table, `Shift+Tab` exits the table backward into the page's natural focus order. |
| `Return` (`Enter`) | Moves vertically down to the **same column in the next visible row**. If on the last row, keeps focus in the current cell/input and commits the draft value. When focus is on a non-input action control (e.g., a button or link), `Enter` activates that control natively. |
| `ArrowUp` / `ArrowDown` | Moves vertically to the adjacent visible cell in the same visual column without wrapping at the top or bottom row. Inside numeric inputs, prevents native spinbutton increment/decrement so vertical arrows always navigate rows. |
| `ArrowLeft` / `ArrowRight` | Moves horizontally to the adjacent visible cell in the same row without wrapping at row edges. When inside a text/number input whose full value is currently selected (the default upon cell entry), `ArrowLeft` / `ArrowRight` navigates to the neighboring cell; if the user has placed a collapsed text caret inside the input (or pressed `F2`), `ArrowLeft` / `ArrowRight` moves the caret within the text until reaching the input boundary or pressing `Escape`. |
| `Escape` | When inside a cell control, returns focus to the parent `<td>`/`<th>` cell wrapper without discarding committed values. |

### 2. Single-press input entry (No double Return)

Navigating to an editable cell must never require a second key press to begin typing:

1. **Direct input focus on 1 key press:** When `Tab`, `Shift+Tab`, `Return` (`Enter`), or an Arrow key moves to a cell that contains a primary editable control (`<input>`, `<textarea>`, `<select>`, or `contenteditable`), focus moves **directly into that editable control** and highlights its entire value in a single key press.
2. **Read-only cells remain navigable:** When the destination cell contains only static/formatted text (such as `Month`, `Ticker`, `Total`, or read-only `Passive Income` and `Retirement Planning` cells), focus lands on the cell itself (`tabIndex={0}`) so the user can continue pressing `Tab`, `Shift+Tab`, `Return`, or Arrow keys seamlessly across mixed read-only and editable columns.
3. **Action cells:** When the destination cell contains only buttons or links (such as the security details button or row action buttons), `Tab` / `Shift+Tab` focuses the first enabled control directly on 1 key press.
4. **Auxiliary cell buttons do not block direct input focus:** Auxiliary controls rendered alongside an input (such as the "Auto-populate / Fill down" button inside `FinanceMoneyCellInput`) must not intercept initial cell entry or require an extra `Tab` stop during normal cell-to-cell navigation unless explicitly tabbed while inside the cell.

### 3. Selecting a cell highlights the whole value

Whenever an editable cell becomes active—whether by clicking the input, clicking the cell padding around the input, or arriving via `Tab`, `Shift+Tab`, `Return`, or Arrow keys—the **entire current value** in the input must be selected/highlighted so typing immediately replaces the value:

1. **Post-render selection guarantee:** In `FinanceMoneyCellInput`, switching from formatted display (`formatValue(value)`) to raw edit mode (`draftValue`) happens on focus. Calling `input.select()` must occur **after** React commits the focused `draftValue` to the DOM (for example, in a `useLayoutEffect` triggered when `isFocused` transitions to `true`) so the browser does not collapse the selection when the input value changes from `$123.45` to `123.45`.
2. **Pointer mouse-up protection:** Clicking into an unfocused input must preserve the full-value selection across the subsequent `mouseup` event (e.g., preventing default caret collapse on the initial pointer-up that focused the input), while still allowing a second click inside an already-focused input to place the caret at a specific character.
3. **Cell-padding click forwarding:** Clicking anywhere within an editable `<td>` (such as `.excel-editable-cell` or the containing `<td>`) focuses its editable `<input>` and highlights the whole value.
4. **Consistent draft representation:** When focusing an input that has a numeric value, `draftValue` reflects the editable value and selects it in full so the user sees immediate visual selection feedback.

### 4. Rows do not disappear when removing a cell value until blur

Clearing a cell's value (`Backspace` / `Delete` to `''`) or typing `0` must never unmount or hide the row while the user is still focused inside the cell:

1. **Deferred row filtering on blur:** Any table that filters, hides, or truncates rows based on cell values must keep the active row (and table structure) mounted in place while a cell within that row has focus, deferring row removal until `blur` leaves the cell.
2. **Holdings table (`HoldingsPage.tsx`):**
   - When filtered to a specific account (`selectedAccountFilterId`), `orderedHoldings` filters rows to holdings where `position.quantity > 0`.
   - If a user clears the quantity cell or enters `0` while focused in that cell, the holding row **must remain visible** in `orderedHoldings` at its current row position until the user blurs away from the cell (e.g., by pressing `Return`, `Tab`, Arrow keys to another row/cell, or clicking outside).
   - Once the cell blurs with a committed quantity of `0` (or empty, which normalizes to `0`), `orderedHoldings` may remove the row from the account-filtered view and move focus predictably to the intended next cell.
   - Clearing the `Price` input while typing (e.g., backspacing before entering a new price) must keep the local draft empty without rejecting the keystroke or jumping focus; price validation and state commit apply on valid input or blur.
3. **Mortgage Schedule table (`MortgageSchedulePanel.tsx`):**
   - Editing `Principal`, `Extra Principal`, `Starting balance`, or `Schedule start month` must not cause the active row or subsequent schedule rows to disappear on intermediate keystrokes when the draft is temporarily empty or `0`.
   - Schedule row truncation (when balance reaches `0` or falls outside the 6-month window) must wait until the user blurs away from the edited cell.

---

## Existing-code integration and migration

| File | Required changes |
| --- | --- |
| `src/UI/src/components/useTableBodyCellTabNavigation.ts` | Update `focusCell` / navigation target resolution so `Tab`, `Shift+Tab`, `Enter`, and Arrow keys focus the cell's primary editable control directly and select its full value on 1 key press; handle `Enter` and Arrow keys when focus is already inside an editable control; report active editable cell row (`data-row-key`) and edit state on focus/blur. |
| `src/UI/src/components/FinanceTable.tsx` | Provide the single shared `FinanceTable` component (`variant="spreadsheet" | "plain"`), `useFinanceTableRowRetention` hook for deferring row removal until blur, `FinanceMoneyCellInput`, `FinanceCellInput`, `FinanceMoneyCellValue`, and `FinanceTableHeaderCell`. |
| `src/UI/src/pages/HoldingsPage.tsx` | Use `useFinanceTableRowRetention` and `data-row-key={holding.id}` on `FinanceTable` rows so `orderedHoldings` retains a holding row while its cell is focused even if `quantity` is cleared or set to `0`, without repeating per-cell `onFocus`/`onBlur` handlers. |
| `src/UI/src/pages/MortgageSchedulePanel.tsx` | Use `useFinanceTableRowRetention` and `FinanceCellInput` on `FinanceTable` to defer schedule row removal/collapsing until `onBlur`. |
| `src/UI/src/features/passiveIncome/DistributionPaymentsTable.tsx`, `src/UI/src/pages/PassiveIncomePage.tsx`, `src/UI/src/features/retirementPlanning/RetirementPlanningPage.tsx` | Use `FinanceTable` (`variant="plain"`) so all tables in the UI share a single common component. |
| `src/UI/src/components/FinanceTable.test.tsx` & page test suites | Update and expand unit/integration tests for single-press focus, full-value selection, arrow/Enter/Tab navigation from inside inputs, and row retention until blur. |

---

## States and accessibility

- **Focus visibility:** Focused editable inputs and focused read-only cells (`td:focus-visible`, `th:focus-visible`, `input:focus-visible`) must display a clear, high-contrast focus indicator.
- **Screen-reader labels:** Every editable cell input must have an explicit accessible name (`aria-label` or associated header label) identifying both the row context (e.g., month or ticker) and column context (e.g., account name, price, contribution).
- **No keyboard traps:** `Tab` from the last cell and `Shift+Tab` from the first cell must exit the table cleanly. `Escape` always provides a predictable exit from in-cell editing to the cell container.
- **Empty, loading, and colspan states:** Single-cell empty states (`colSpan`) and hidden cells (`hidden` or `aria-hidden="true"`) must be skipped or handled gracefully without throwing or trapping focus.

---

## Acceptance criteria and tests

1. **Arrow, Tab, and Return navigation across all tables:** In every table in Banking, Investing (Funding Schedule, Holdings, Passive Income, Retirement Planning), and Net Worth (Net Worth, Mortgage Schedule), users can move across cells using `Tab`, `Shift+Tab`, `Enter`, `ArrowUp`, `ArrowDown`, `ArrowLeft`, and `ArrowRight`.
2. **Single-press input entry (`Tab` / `Shift+Tab` / `Return`):** Pressing `Tab`, `Shift+Tab`, or `Enter` to move from one editable cell to another focuses the destination `<input>` directly and selects its entire value on **1 key press** (no second `Enter` required).
3. **Full-value selection on click and keyboard focus:** Clicking an editable cell (or navigating to it via keyboard) transitions `FinanceMoneyCellInput` to its editable `draftValue` and leaves the entire value selected (`selectionStart === 0` and `selectionEnd === value.length`).
4. **Holdings row retention until blur:** In **Investing → Holdings** with an account filter selected, clearing a holding's quantity cell (`Backspace` to `''` or typing `0`) keeps the row rendered and focused while editing; the row is removed from the filtered view only after blurring away from the cell.
5. **Mortgage Schedule row retention until blur:** In **Net Worth → Mortgage Schedule**, clearing `Starting balance` or editing `Principal` / `Extra Principal` does not collapse or unmount rows while the input remains focused; rows update their visibility only after `blur`.
6. **Passive Income tables normalized:** `DistributionPaymentsTable` and `future-dividend-table` use the shared keyboard-navigable table component and support arrow, `Tab`, and `Shift+Tab` navigation.
