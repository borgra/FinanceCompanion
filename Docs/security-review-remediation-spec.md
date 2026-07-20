# Corporate Actions Defensive Remediation Specification

## 1. Centralized corporate-action validation

Every API mutation that accepts `security.corporateActions`, including holding create, update, and batch update, must reject invalid actions with HTTP 422.

Acceptance criteria:

- `effectiveDate` is a real ISO calendar date and is not in the future.
- `type` is exactly `stock_split` or `reverse_stock_split`.
- Share counts are finite, positive values no greater than 1,000,000,000.
- A forward split increases shares; a reverse split decreases shares; 1:1 is rejected.
- IDs are bounded and use the supported identifier character set.
- One security cannot contain duplicate action identities.

## 2. API import client wiring

The production holding API repository must expose `importCorporateActions` and submit the documented flat API payload to `PUT /holdings/corporate-actions/import`.

Acceptance criteria:

- A UI import invokes the endpoint rather than reporting the capability unavailable.
- Each `{ symbol, action }` input becomes `{ symbol, effectiveDate, type, oldShares, newShares }` in the request.

## 3. Calendar-safe import validation

Corporate-action imports must use parsed calendar dates, not lexical string comparisons.

Acceptance criteria:

- Invalid dates such as `0000-99-99` are rejected before persistence.
- A future date is rejected.
- Valid ISO dates round-trip in `YYYY-MM-DD` form.

## 4. Atomic import persistence

An import must not leave matching holdings with different corporate-action sets.

Acceptance criteria:

- The route calculates every holding update before persistence.
- Matching updates are persisted through the repository batch operation.
- Cosmos persistence uses its single-partition transaction; in-memory persistence replaces the batch as one operation.
- Re-importing an existing identity is a no-op.