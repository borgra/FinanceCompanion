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

Add `-EnableFoundry` to create and wire the dedicated Foundry deployment. Its default model is `gpt-6-luna`, version `2026-09-22`, on Global Standard with 100 quota units (100k TPM for this model). Quota allocation does not reserve paid provisioned throughput; model/search calls incur usage charges. The operator also needs `Microsoft.Authorization/roleAssignments/write` at the relevant Foundry scopes. `-FoundryCapacity` changes quota allocation.

To provision only Foundry against the existing application, without replacing its running image:

```powershell
./infra/scripts/deploy-foundry.ps1 -SubscriptionId '<subscription-id>' -ContainerAppName '<api-container-app-name>' -GrantCurrentUser
./infra/scripts/test-foundry.ps1 -SubscriptionId '<subscription-id>' -Endpoint '<returned-project-endpoint>'
```

The first command creates the account/project/model, assigns scoped inference roles and registers `dividend-history-agent`. Registration uses the canonical instructions and schema in `infra/agents`; the API image bundles those same files for its single-call Responses fallback. Use `-AgentName` to override the registered name, or `-RegisterAgent:$false` for ARM-only provisioning. The second command makes one live, billable call combining web search and strict dividend JSON output, using those same files and an explicit reference date (`-AsOf`) when supplied. Use `-WhatIf` on the first command for a local preview; use `az deployment group what-if --template-file infra/foundry.bicep --parameters appName=finance-companion` for an Azure resource preview. No Azure/model keys are created or needed.

Registration requires Foundry User on the target project (or an inherited resource-group grant) for the signed-in operator or Infra Up OIDC principal. Resource Contributor alone does not include this data-plane access; have an administrator assign it before registering. After new role assignments, allow RBAC propagation and rerun `register-foundry-agent.ps1` if Azure reports access denied.

The implementation uses the documented [Foundry v1 prompt-agent API](https://learn.microsoft.com/en-us/rest/api/microsoft-foundry/aiproject), which supports `tools: web_search` and `text.format: json_schema`. The guide's legacy `/assistants?api-version=2025-05-01` route uses a different agent/tool contract. Registration looks up the exact name, creates it on 404 and updates it otherwise; unchanged definitions reuse the existing version. The backend's one-call Responses request uses the named definition's local instructions/schema, so refreshing a holding does not require a registration lookup or another model call.

To update an existing project's agent without provisioning resources:

```powershell
./infra/scripts/register-foundry-agent.ps1 -SubscriptionId '<subscription-id>' -Endpoint '<project-endpoint>' -Deployment '<model-deployment>'
```

Offline checks (no Azure access):

```powershell
./infra/tests/deploy-foundry.test.ps1
./infra/tests/foundry-agent.test.ps1
```

The script now runs staged deployments in observable tranches:

1. `resource-group`
2. `frontend`
3. `data`
4. `runtime-base`
5. `foundry` if enabled
6. `runtime-api`, followed by Foundry API identity authorization when a new project was provisioned
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
[Foundry Entra RBAC](../Docs/Foundry%20Entra%20RBAC.md). Set `DIVIDEND_RESEARCH_PROVIDER`
to `stub` (default) or `azure_foundry` as a repository variable, or configure it
consistently in both GitHub Environments: `deployment` for Backend Deploy and
`infrastructure` for Infra Up. Environment values override repository values. When `azure_foundry` is selected and no endpoint is configured, Infra Up creates the dedicated Foundry tranche and authorizes the API identity. Backend Deploy discovers its endpoint/deployment from the persisted `${APP_NAME}-foundry` ARM deployment outputs. Supplying an existing endpoint/deployment bypasses creation; use `scripts/configure-foundry-access.ps1` to grant access to that existing project.

The Infra Up identity needs resource creation, scoped role-assignment permissions for the Foundry tranche, and Foundry User to register the project agent. Infra Up registers the agent for project endpoints; direct Azure OpenAI resource endpoints use the bundled single-pass definition without project registration. Backend Deploy still needs no permission to grant inference roles. `AZURE_FOUNDRY_CAPACITY` defaults to `100` in Infra Up. Model availability, quota and tool policy are validated by Azure; unsupported regions or exhausted quota fail explicitly.

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
| `AZURE_FOUNDRY_STOCK_DETAILS_AGENT_NAME` | Optional variable | Existing stock-details agent to invoke; defaults to `stock-details-agent`. Its Azure definition owns its model and tools. Deployment does not create or update it. |
| `ALPHA_VANTAGE_API_KEY` | Optional secret | Legacy market-data adapter only; not needed for Foundry web research or security search. |

### Workflow Defaults

Stock price/details refresh requires `AZURE_FOUNDRY_ENDPOINT` to identify the project containing the existing stock-details agent, with Entra inference access for the API managed identity. The runtime sends only the ticker to that agent. The generic `AZURE_FOUNDRY_DEPLOYMENT` setting remains the model selection for the separate search/distribution workflows; it does not override the model saved on the stock-details agent. If Infra Up provisions a new Foundry project, configure the stock-details agent there before using stock refresh, or supply the endpoint of the project where it already exists.

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
