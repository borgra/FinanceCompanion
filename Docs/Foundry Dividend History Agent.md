# Foundry Dividend History Agent

**Status:** Draft Specification — Ready for Implementation
**Owner:** Product / Engineering
**Last updated:** 2026-10-20
**Supersedes:** Multi-pass prose-excerpt extraction in [AI Distribution Research and Forecasting](AI%20Distribution%20Research%20and%20Forecasting.md)

---

## 1. Summary & Problem Statement

Previously, `FoundryWebDividendResearchProvider` executed a slow, brittle 2-to-3 call LLM pipeline:
1. A web-search call forcing the model to write custom single-line prose claims with repeated `Ticker:`, `Exchange:`, `USD`, and inline per-line URL citations.
2. An optional retry search call gated by regex checks on the prose output.
3. A second LLM extraction pass copying verbatim `evidence_excerpt` strings into JSON, followed by Python regex checks that rejected valid rows over minor formatting differences.

### Target Architecture
Replace the multi-pass prose-excerpt pipeline with a **single-pass Azure AI Foundry Agent (`dividend-history-agent`)**:
1. **Infrastructure (`infra/`)** provisions the Foundry account, project, model deployment, and deploys the version-controlled `dividend-history-agent` definition (instructions + `web_search` tool + structured JSON schema) into the Foundry project.
2. **Backend (`src/API/`)** invokes the Foundry agent in a single call for a given ticker, receives structured dividend history for the trailing 24 months (plus announced upcoming dividends), validates dates and positive amounts, and maps them directly into `DividendResearchResult`.
3. **Persistence & Forecasting** continue as normal through `RefreshHoldingDividends` → `normalize_research` → `forecast_distributions` → `reconcile_events` → `merge_dividend_payouts` → `HoldingRepository.update_batch_for_user` (persisting to `.local-data/finance.json` locally and Cosmos DB Table storage in production).

---

## 2. Agent Specification

### 2.1 Agent Metadata
- **Agent Name:** `dividend-history-agent`
- **Tools Enabled:** `[{"type": "web_search"}]`
- **Response Format:** `json_schema` (`strict: true`, name: `dividend_history_result`)

### 2.2 Agent Instructions (`infra/agents/dividend-history-agent.md`)

```markdown
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
```

### 2.3 Agent Output Schema (`infra/agents/dividend-history-agent.schema.json`)

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "symbol",
    "name",
    "exchange",
    "asset_type",
    "currency",
    "source_url",
    "dividends",
    "error"
  ],
  "properties": {
    "symbol": { "type": "string" },
    "name": { "type": ["string", "null"] },
    "exchange": { "type": ["string", "null"] },
    "asset_type": { "type": ["string", "null"], "enum": ["ETF", "Stock", null] },
    "currency": { "type": "string", "enum": ["USD"] },
    "source_url": { "type": ["string", "null"] },
    "dividends": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "ex_dividend_date",
          "amount",
          "declaration_date",
          "record_date",
          "payment_date",
          "status",
          "is_special"
        ],
        "properties": {
          "ex_dividend_date": { "type": "string" },
          "amount": { "type": "number" },
          "declaration_date": { "type": ["string", "null"] },
          "record_date": { "type": ["string", "null"] },
          "payment_date": { "type": ["string", "null"] },
          "status": { "type": "string", "enum": ["completed", "announced"] },
          "is_special": { "type": "boolean" }
        }
      }
    },
    "error": { "type": ["string", "null"] }
  }
}
```

---

## 3. Infrastructure Changes (`infra/` & `.github/workflows/`)

### 3.1 Files to Add / Update
1. **`infra/agents/dividend-history-agent.md`**
   - Canonical system instructions for the Foundry Dividend History Agent (loaded by both `deploy-foundry.ps1` and the Python API fallback).
2. **`infra/agents/dividend-history-agent.schema.json`**
   - Strict JSON schema definition for the agent's structured output.
3. **`infra/foundry.bicep`**
   - Add `param agentName string = 'dividend-history-agent'`.
   - Export `output agentName string = agentName`.
4. **`infra/scripts/deploy-foundry.ps1`**
   - Accept `[string]$AgentName = 'dividend-history-agent'`.
   - Pass `agentName=$AgentName` to the `foundry.bicep` deployment.
   - Add an agent registration step (`Publish-FoundryAgent` / data-plane upsert against `{projectEndpoint}/assistants?api-version=2025-05-01` when `-RegisterAgent` is enabled or during live deployment) using the Entra token for `https://ai.azure.com` so the agent is created/updated inside the Foundry Project with `dividend-history-agent.md` instructions, `web_search` tool, and `dividend-history-agent.schema.json`.
5. **`infra/runtime-api.bicep` & GitHub Workflows (`infra-up.yml`, `backend-deploy.yml`)**
   - Add `azureFoundryAgentName` parameter (`default = 'dividend-history-agent'`) and wire it to `FINANCE_COMPANION_AZURE_FOUNDRY_AGENT_NAME`.
6. **`infra/scripts/test-foundry.ps1`**
   - Update the opt-in live smoke test to verify single-pass structured dividend retrieval using the agent instructions and schema.

---

## 4. Backend Dividend Code Changes (`src/API/`)

### 4.1 Settings (`src/API/app/infrastructure/settings.py` & `container.py`)
- Add `azure_foundry_agent_name: str = "dividend-history-agent"` to `Settings`.
- Pass `agent_name=settings.azure_foundry_agent_name` into `FoundryWebDividendResearchProvider` in `build_container()`.

### 4.2 Single-Pass Agent Provider (`src/API/app/infrastructure/foundry_web_research.py`)
Simplify `FoundryWebDividendResearchProvider` to execute **1 Foundry API call** per dividend refresh:
1. **Request Construction:**
   - Send a single `POST {endpoint}/openai/v1/responses` call with:
     - `model`: configured deployment (and `agent_name` metadata/instructions loaded from `dividend-history-agent.md`).
     - `tools`: `[{"type": "web_search"}]`, `tool_choice`: `"required"`.
     - `include`: `["web_search_call.action.sources"]`.
     - `text.format`: strict `json_schema` matching `DividendAgentResponse` (`dividend-history-agent.schema.json`).
     - `input`: system instructions + user JSON payload `{ "symbol": request.symbol, "exchange": request.exchange, "as_of": request.retrieval_end.isoformat(), "history_start": request.history_start.isoformat() }`.
2. **Response Parsing & Citation Resolution:**
   - Parse the JSON output directly into `DividendAgentResponse`.
   - Resolve `source_url` from:
     1. Public HTTPS URLs in message `url_citation` annotations or `web_search_call.action.sources`.
     2. The `source_url` returned in the JSON payload (verified as a valid public `https://` URL via `public_evidence_url`).
   - If `error` is returned or `dividends` is empty, return a `DividendResearchResult` with `status="unavailable"`, empty `payments`, and the warning message, preserving existing persisted records.
3. **Mapping to Domain (`DividendResearchPayment`):**
   - Filter/validate each row in `dividends`:
     - `ex_dividend_date` is a valid ISO date within `retrieval_start <= ex_date <= forecast_end`.
     - `amount` is finite and `> 0`.
     - Optional `declaration_date`, `record_date`, `payment_date` are valid ISO dates that do not violate date ordering (`declaration_date <= ex_dividend_date <= record_date/payment_date`; drop invalid optional secondary dates rather than rejecting the payment).
     - `status`: `"announced"` if `ex_dividend_date > request.retrieval_end.isoformat()` or `payment_date > request.retrieval_end.isoformat()`, else `"completed"`.
     - `is_regular`: `not row.is_special`.
     - `share_basis`: `"current_share_basis"`.
     - `distribution_type`: `"income"`.
     - `evidence_ref`: deterministic hash `sha256:{symbol}:{ex_dividend_date}:{amount}:{source_url}`.
   - Run `infer_recurrence(payments, request)` so recurring cadence is tagged for forecasting.
   - Return `DividendResearchResult` with `adjustment_basis="current_share_basis"`.

### 4.3 Normal Persistence Flow (`RefreshHoldingDividends`)
No changes required to the persistence contract or UI:
- `RefreshHoldingDividends.execute(user_id, holding_id)` receives the `DividendResearchResult`.
- `normalize_research` converts rows into `SecurityPayoutDetails`.
- `select_source_events` deduplicates by `ex_dividend_date`.
- `forecast_distributions` projects regular distributions through `December 31` of next year using `seasonal-median-v1`.
- `reconcile_events` supersedes prior projections when new announced/completed dividends arrive and preserves `manual_payout_details`.
- `merge_dividend_payouts(source, manual)` updates `security.payout_details`.
- `self._repository.update_batch_for_user(user_id, changed)` persists to `.local-data/finance.json` or Cosmos DB Table storage.

---

## 5. Test Plan & Updates

1. **`src/API/tests/test_foundry_web_research.py`**
   - Update unit/contract tests to verify the **single-call** agent flow (`len(calls) == 1`).
   - Test parsing of `VO` / `VOO` / `JEPQ` / `SCHD` dividend tables into `DividendResearchResult`.
   - Test `completed` vs `announced` status assignment based on `as_of` date.
   - Test `is_special=True` mapping to `is_regular=False` (excluded from recurring forecast).
   - Test graceful handling of provider errors (`401/403`, `429`, `500`, timeout, empty results / `error` field) ensuring existing persisted records are never wiped on failure.
   - Test gzipped response handling and Entra / API-key auth headers.
2. **`src/API/tests/test_dividend_refresh.py` & `src/API/tests/test_api_contracts.py`**
   - Verify end-to-end `POST /api/v1/holdings/{holding_id}/dividends/refresh` persists researched dividends, forecasts future payments, preserves manual payouts, and survives local JSON reload.
3. **`src/API/tests/test_settings_security.py` & `src/API/tests/test_deployment_workflows.py`**
   - Verify `azure_foundry_agent_name` defaults to `"dividend-history-agent"` and workflow deployments pass agent configuration cleanly.
4. **`infra/tests/deploy-foundry.test.ps1`**
   - Verify `deploy-foundry.ps1` passes `agentName=dividend-history-agent` and returns `agentName` in deployment outputs without calling Azure during `-WhatIf`.
