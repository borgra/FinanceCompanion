# Azure Infrastructure

This directory contains Bicep templates, deployment parameters, and helper scripts for provisioning the Azure infrastructure used by the web UI, API runtime, and supporting data services.

## Resource Topology

The active deployment creates:

- An Azure resource group.
- An Azure Static Web App for the frontend.
- A Cosmos DB Table API account and table.
- An Azure Container Registry.
- An Azure Container Apps environment.
- An Azure Container App for the API.
- A dedicated Foundry account, project, GPT-6 Luna deployment and version-controlled dividend history prompt agent when Foundry provisioning is enabled.
- Optional blob storage when explicitly enabled.

## Files

| Path | Purpose |
| --- | --- |
| `deploy.bicep` | Subscription-scoped entrypoint. Creates the resource group. |
| `main.bicep` | Legacy all-in-one resource-group template retained as a reference and fallback. |
| `ui.bicep` | Frontend tranche for Azure Static Web Apps. |
| `data.bicep` | Data tranche for Cosmos Table API resources. |
| `runtime-base.bicep` | Runtime base tranche for ACR and Container Apps environment. |
| `runtime-api.bicep` | Runtime API tranche for the Container App and app configuration. |
| `foundry.bicep` | Entra-only Foundry account, research project, pinned GPT-6 Luna model and project service identity access. |
| `scripts/deploy-foundry.ps1` | Deploy only Foundry; optionally authorize the API identity and signed-in developer. Supports `-WhatIf`. |
| `agents/dividend-history-agent.md` / `.schema.json` | Canonical dividend retrieval instructions and strict JSON response contract. |
| `scripts/register-foundry-agent.ps1` | Create/update the named prompt agent using Entra authentication and the Foundry v1 API. Supports `-WhatIf`. |
| `scripts/test-foundry.ps1` | Opt-in single-call live dividend history, web-search and structured-output capability check. |
| `storage.bicep` | Optional storage tranche. |
| `parameters/dev.subscription.bicepparam` | Example subscription-scoped development parameters. |
| `scripts/up.ps1` | Local deployment helper. |
| `scripts/down.ps1` | Local resource group deletion helper. |
| `SECURITY.md` | OIDC, identity, and least-privilege guidance for GitHub Actions. |

## Cost Controls

The default configuration uses the Azure Static Web Apps Free tier. Recommended operational controls:

- Configure Azure Budget alerts for the subscription or resource group.
- Review deployed resources after each infrastructure change.
- Keep additional resources out of this resource group unless intentionally added to Bicep.

## Offline Workflow Checks

With the API development environment activated and Bash installed (Git Bash on Windows), run from `src/API`:

```shell
python -m pytest tests/test_deployment_workflows.py
```

These checks execute the workflow Bash with mocked Azure and JSON commands. They cover unset and empty optional configuration, Foundry discovery, explicit overrides, required-setting errors, and propagation of Azure CLI failures. They do not contact Azure or deploy resources.

## Local Deployment

Prerequisites:

- Azure CLI
- Azure Bicep support through Azure CLI
- Authenticated Azure CLI session
- Permission to create subscription deployments and resource groups

Deploy:

```powershell
.\infra\scripts\up.ps1 -SubscriptionId "<subscription-id>"
```

Live research requires an Entra-only Foundry project, a verified `gpt-6-luna` deployment, a blocking RAI policy, and separately approved immutable versions for both research agents. Provision/register before enabling the runtime:

```powershell
./infra/scripts/deploy-foundry.ps1 -SubscriptionId '<subscription-id>' -GrantCurrentUser
```

The template pins model version `2026-09-22` with `NoAutoUpgrade`, shares its deployment between both agents, and attaches `research-injection-blocking-v1`. The policy uses `Microsoft.DefaultV2`, blocking Medium-or-higher baseline categories on prompts/completions, and blocking `Jailbreak` / `Indirect Attack` prompt filters. These names and ARM attachment follow [Azure's filter examples](https://learn.microsoft.com/en-us/azure/foundry-classic/foundry-models/how-to/configure-content-filters) and the [RAI resource schema](https://learn.microsoft.com/en-us/azure/templates/microsoft.cognitiveservices/2025-06-01/accounts/raipolicies).

The helper registers independent dividend and stock definitions with the full policy ARM ID in `rai_config.rai_policy_name`. It verifies policy existence, the baseline/attack filters, deployment attachment and underlying model before mutation. Registration reports immutable version identifiers; it never approves the latest version automatically. `-AgentName` / `-StockDetailsAgentName` customize distinct names, `-RegisterAgent:$false` provisions resources only, and `-WhatIf` makes no Azure calls. Existing deployments require an explicitly configured matching policy; registration does not silently alter their model or filters.

Review each returned version and run configuration checks, a benign capability smoke, and an adversarial probe for **both** kinds:

```powershell
./infra/scripts/test-foundry.ps1 -SubscriptionId '<subscription-id>' -Endpoint '<project-endpoint>' -Deployment '<deployment>' -RaiPolicyId '<full-policy-arm-id>' -AgentKind stock-details -AgentVersion '<reviewed-numeric-version>' -VerifyConfigurationOnly
./infra/scripts/test-foundry.ps1 -SubscriptionId '<subscription-id>' -Endpoint '<project-endpoint>' -Deployment '<deployment>' -RaiPolicyId '<full-policy-arm-id>' -AgentKind stock-details -AgentVersion '<reviewed-numeric-version>' -Symbol MSFT -SecurityName 'Microsoft Corporation' -Exchange NASDAQ -AssetType Equity
./infra/scripts/test-foundry.ps1 -SubscriptionId '<subscription-id>' -Endpoint '<project-endpoint>' -Deployment '<deployment>' -RaiPolicyId '<full-policy-arm-id>' -AgentKind stock-details -AgentVersion '<reviewed-numeric-version>' -VerifyInjectionBlocking
```

Repeat with `-AgentKind dividend-history` and its separately approved version. Configuration-only mode reads management metadata and the exact registered version without inference. Other modes are opt-in, billable calls. The injection probe requires Azure injection-filter evidence; a model refusal, unrelated HTTP 400, or successful unblocked answer fails the probe. This synthetic input test does not prove external web-document isolation or universal attack resistance. Region/model/tool support and actual filter enforcement still require live verification; none is claimed by offline tests.

Stock capability checks validate schema, dated price/NAV basis, field evidence and tool-returned source URLs, using 8,000 output tokens and six tool calls. Supply `-Symbol`, `-SecurityName`, `-Exchange` and `-AssetType` for a stock, ETF and identifiable USD mutual fund. Both smoke modes and runtime reference the explicit agent version and inherit its instructions/tools/schema; they do not supply direct-model overrides or fall back to another endpoint. The [v1 reference](https://learn.microsoft.com/en-us/rest/api/microsoft-foundry/aiproject) documents version references and agent RAI configuration. [Azure cautions](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/add-hosted-agent-guardrails) that a nonexistent policy reference may fail open, so merely setting the ID is insufficient.

Set `AZURE_FOUNDRY_RAI_POLICY_ID`, `AZURE_FOUNDRY_AGENT_VERSION` and `AZURE_FOUNDRY_STOCK_DETAILS_AGENT_VERSION` explicitly in the deployment environment after review/smoke. Neither workflow substitutes a latest version or a sample policy ID. Both workflows register definitions for project endpoints and preflight the approved versions without inference before runtime deployment. Live resource-only/key-auth configurations are rejected. `up.ps1` requires the corresponding `-AzureFoundryRaiPolicyId`, `-AzureFoundryAgentVersion` and `-AzureFoundryStockDetailsAgentVersion` values.

The Foundry project's own platform service identity retains Microsoft's documented parent-account Foundry User prerequisite; it is separate from the API caller identity. The API runtime receives custom project-scoped read/invocation permissions plus account-scoped model/policy metadata reads through `foundry-runtime-access.bicep`; it cannot create/edit agents, policies, deployments or role assignments. The exact allowlist lives in `infra/roles/foundry-research-permissions.json`. `configure-foundry-access.ps1` defaults to `-AccessProfile Runtime`, audits inherited/group grants, and refuses broader effective roles. Azure grants are additive: an administrator must remove old broad grants before least privilege can hold. Human registration operators use explicit `-AccessProfile Developer`; keep their identity separate from the production API. See [Foundry RBAC](https://learn.microsoft.com/en-us/azure/foundry/concepts/rbac-foundry) and [permission definitions](https://learn.microsoft.com/en-us/azure/role-based-access-control/permissions/ai-machine-learning).

The retired market-data key/parameters are removed. Backend deployment explicitly removes the old `FINANCE_COMPANION_ALPHA_VANTAGE_API_KEY` environment reference as a migration step. Account-level secret revocation remains an operator task after checking external consumers; no saved finance data is removed. See [Research Agent Security](../Docs/Research%20Agent%20Security.md) for the application boundary and operational verification.

Offline checks (every Azure/HTTP operation is mocked):

```powershell
./infra/tests/deploy-foundry.test.ps1
./infra/tests/foundry-agent.test.ps1
./infra/tests/configure-foundry-access.test.ps1
```

The script now runs staged deployments in observable tranches:

1. `resource-group`
2. `frontend`
3. `data`
4. `runtime-base`
5. `foundry` if enabled
6. `runtime-api`, followed by restricted Foundry API identity authorization in live mode
7. `storage` if enabled

Each tranche prints its own elapsed time so you can see where Azure provisioning is spending time.

## Local Tear-Down

Delete the deployed resource group:

```powershell
.\infra\scripts\down.ps1 -SubscriptionId "<subscription-id>"
```

The tear-down script deletes the entire configured resource group. This removes all resources deployed into that group.

## GitHub Actions Configuration

The GitHub Actions workflows use OpenID Connect for Azure login. Resource names and locations are defined as workflow defaults, and deployed resources are discovered by resource group and tags during later jobs.

### Required Repository Variables

| Variable | Example | Purpose |
| --- | --- | --- |
| `AZURE_TENANT_ID` | Azure tenant ID | Azure login tenant. |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID | Target subscription. |

Use either a single client ID:

| Variable | Example | Purpose |
| --- | --- | --- |
| `AZURE_CLIENT_ID` | App registration or federated identity client ID | Azure login identity for all workflows. |

Or split client IDs for stronger least-privilege separation:

| Variable | Example | Purpose |
| --- | --- | --- |
| `AZURE_INFRA_CLIENT_ID` | Infrastructure identity client ID | Used by infrastructure workflows. |
| `AZURE_DEPLOY_CLIENT_ID` | Deployment identity client ID | Used by frontend deployment workflows. |

See [SECURITY.md](SECURITY.md) for the recommended OIDC and RBAC setup.

For live distribution retrieval and API-to-Foundry managed identity access, see
[Foundry Entra RBAC](../Docs/Foundry%20Entra%20RBAC.md). `DIVIDEND_RESEARCH_PROVIDER`
in the GitHub Environment `deployment` selects `stub` (default) or
`azure_foundry` in both Backend Deploy and Infra Up. When `azure_foundry` is selected and no endpoint is configured, Infra Up creates the dedicated Foundry tranche and authorizes the API identity. Backend Deploy discovers its endpoint/deployment from the persisted `${APP_NAME}-foundry` ARM deployment outputs. Supplying an existing endpoint/deployment bypasses creation; use `scripts/configure-foundry-access.ps1` to grant access to that existing project.

Infrastructure automation needs resource creation, scoped custom-role/assignment permissions, policy/model metadata reads, and operator data-plane access to register both agents. Backend Deploy preflights the approved versions and applies restricted runtime access using its deployment identity. The runtime identity is separate and cannot register or edit agents. Direct resource endpoints are unsupported for live research. `AZURE_FOUNDRY_CAPACITY` defaults to `100` in Infra Up. Model availability, quota and tool policy are validated by Azure; unsupported regions or exhausted quota fail explicitly.

### Additional Variables And Secrets

For the runtime API tranche, set these repository values:

| Name | Type | Purpose |
| --- | --- | --- |
| `AZURE_ENTRA_CLIENT_ID` | Variable | Microsoft Entra app client ID used by the API. |
| `AZURE_ENTRA_TENANT_ID` | Variable | Microsoft Entra tenant ID used by the API. |
| `AZURE_ALLOWED_EMAIL` | Variable | Primary allowed user email for the placeholder seeded user. |
| `AZURE_API_ENVIRONMENT` | Variable | API environment string, typically `production`. |
| `AZURE_API_SESSION_SECRET` | Secret | Session signing secret for the API cookie/JWT. |
| `AZURE_FOUNDRY_AGENT_NAME` | Optional variable | Named dividend history agent; defaults to `dividend-history-agent` in both workflows. |
| `AZURE_FOUNDRY_STOCK_DETAILS_AGENT_NAME` | Optional variable | Independent stock details agent; defaults to `stock-details-agent` in both workflows. |
| `AZURE_FOUNDRY_AGENT_VERSION` | Required in live mode | Explicitly reviewed immutable dividend-agent version; no default. |
| `AZURE_FOUNDRY_STOCK_DETAILS_AGENT_VERSION` | Required in live mode | Explicitly reviewed immutable stock-agent version; no default. |
| `AZURE_FOUNDRY_RAI_POLICY_ID` | Required in live mode | Full existing policy ARM ID; must match both agents and the model deployment. |

### Workflow Defaults

These values are set inside the workflow files:

| Setting | Default |
| --- | --- |
| Application name | `finance-companion` |
| Resource group | `rg-finance-companion` |
| Azure location | `centralus` |
| Static Web Apps location | `centralus` |

Change these defaults in the workflow files if a different environment name, resource group, or region is required.

## Deployment Flow

1. Run the `Infra Up` workflow or `scripts/up.ps1`.
2. Review per-tranche timing in the script output or GitHub Actions step timings.
3. Run the `Frontend Deploy` workflow to publish the web app.

The infrastructure deployment is idempotent. Re-running `Infra Up` updates each tranche independently to match the Bicep templates.
