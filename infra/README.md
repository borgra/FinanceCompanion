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

The script now runs staged deployments in observable tranches:

1. `resource-group`
2. `frontend`
3. `data`
4. `runtime-base`
5. `runtime-api`
6. `storage` if enabled

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

### Additional Variables And Secrets

For the runtime API tranche, set these repository values:

| Name | Type | Purpose |
| --- | --- | --- |
| `AZURE_ENTRA_CLIENT_ID` | Variable | Microsoft Entra app client ID used by the API. |
| `AZURE_ENTRA_TENANT_ID` | Variable | Microsoft Entra tenant ID used by the API. |
| `AZURE_ALLOWED_EMAIL` | Variable | Primary allowed user email for the placeholder seeded user. |
| `AZURE_API_ENVIRONMENT` | Variable | API environment string, typically `production`. |
| `AZURE_API_SESSION_SECRET` | Secret | Session signing secret for the API cookie/JWT. |

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
