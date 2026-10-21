# Agent Instructions: Dividend History Retrieval

**Objective:** Given a US-listed stock or ETF ticker (e.g., `VO`, `SCHD`), retrieve all announced or paid cash dividends and distributions from the preceding 24 months.

### Instructions

1. **Identify Security**
   - Accept a ticker symbol (and optional exchange or reference date) as input.
   - Confirm the security's full name, listing exchange (e.g., `NYSE ARCA`, `NASDAQ`, `NYSE`), asset type (`ETF` or `Stock`), and currency (`USD`).

2. **Locate Dividend History**
   - Prioritize complete tabular dividend history sources (such as the issuer's official dividend table, Nasdaq Dividend History, Seeking Alpha, or StockAnalysis).
   - If an issuer page requires JavaScript to render its table or only displays yield/dates without per-share dollar amounts, immediately use a reputable financial data table instead of retrying the issuer page.
   - Retrieve all announced cash dividend distributions within the previous 24 months, including special dividends and recently declared upcoming distributions.

3. **Extract Data**
   For each dividend, capture:
   - `ex_dividend_date`: ISO date (`YYYY-MM-DD`)
   - `amount`: Exact cash dividend amount per share in USD (preserve all source decimals, e.g., `0.2899`)
   - `declaration_date`: ISO date (`YYYY-MM-DD`) or `null`
   - `record_date`: ISO date (`YYYY-MM-DD`) or `null`
   - `payment_date`: ISO date (`YYYY-MM-DD`) or `null`
   - `status`: `"completed"` if paid on or before the reference date, or `"announced"` if declared for a future payment date
   - `is_special`: `true` only if explicitly labeled a special/supplemental dividend; otherwise `false`

4. **Validate Results**
   - Ensure distributions belong to the exact requested security.
   - Remove duplicate records for the same `ex_dividend_date`.
   - Cross-check questionable values against another source when needed.
   - Never fabricate or estimate missing values.
   - Exclude future projected or estimated dividends that have not been officially announced.

5. **Return Results**
   - Return a structured JSON object with `dividends` sorted by `ex_dividend_date` descending (newest first).
   - Use `null` for unavailable optional fields.
   - Populate `error` with a clear message (and return `"dividends": []`) if no reliable dividend history can be found.

### Guardrails
- Use actual announced/paid dividends, not estimated yields or annualized projections.
- Use the supplied `as_of` execution date to calculate the rolling 24-month window (`history_start` through `as_of`, plus any declared distributions with `ex_dividend_date > as_of`).
- Include dividends announced within that window even if their payment date is in the future (`status: "announced"`).
- Do not confuse ETF capital gains distributions with ordinary cash dividends.
- Preserve original source precision for monetary amounts.
