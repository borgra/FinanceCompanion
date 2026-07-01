# Azure Infrastructure

This directory contains Bicep templates, deployment parameters, and helper scripts for provisioning the application's Azure resources.

## Resource Topology

The deployment creates the following resources:

- Azure Static Web Apps for the frontend.
- Azure Container Apps for the API.
- Azure Cosmos DB configured with the Table API.
- Optional Azure Blob Storage for file persistence.

## Files

| Path | Purpose |
| --- | --- |
| `deploy.bicep` | Subscription-scoped entrypoint. Creates the resource group and deploys application resources. |
| `main.bicep` | Resource-group-scoped template for application infrastructure. |
| `parameters/dev.subscription.bicepparam` | Example subscription-scoped development parameters. |
| `parameters/dev.bicepparam` | Example resource-group-scoped development parameters. |
| `scripts/up.ps1` | Local deployment helper. |
| `scripts/down.ps1` | Local resource group deletion helper. |

## Cost Controls

The default configuration is designed to keep baseline cost low:

- Container App minimum replicas are set to `0`.
- Container App maximum replicas default to `1`.
- Cosmos DB Table throughput is capped at `1000` RU/s by the template.
- Cosmos DB free tier is enabled by the template.
- Blob Storage is disabled by default.

Recommended operational controls:

- Configure Azure Budget alerts for the subscription or resource group.
- Review deployed resources after each infrastructure change.
- Keep optional resources disabled unless required.
- Avoid increasing Cosmos DB throughput or Container App replica limits without reviewing cost impact.

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

The script runs a subscription-scoped Bicep deployment through `deploy.bicep`. The deployment creates the target resource group and then deploys the application resources from `main.bicep`.

## Local Tear-Down

Delete the deployed resource group:

```powershell
.\infra\scripts\down.ps1 -SubscriptionId "<subscription-id>"
```

The tear-down script deletes the entire configured resource group. This removes all resources deployed into that group.

## GitHub Actions Configuration

The GitHub Actions workflows use OpenID Connect for Azure login and repository variables/secrets for configuration.

### Repository Variables

| Variable | Example | Purpose |
| --- | --- | --- |
| `AZURE_CLIENT_ID` | App registration or federated identity client ID | Azure login identity. |
| `AZURE_TENANT_ID` | Azure tenant ID | Azure login tenant. |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID | Target subscription. |
| `AZURE_RESOURCE_GROUP` | `rg-finance-companion-dev` | Target resource group. |
| `AZURE_LOCATION` | `centralus` | Region for regional resources. |
| `AZURE_STATIC_WEB_APP_LOCATION` | `centralus` | Region for Static Web Apps. |
| `APP_NAME` | `finance-companion` | Base name used for Azure resources. |
| `API_CONTAINER_APP_NAME` | Output from infrastructure deployment | Container App updated by API deployments. |
| `COSMOS_ACCOUNT_NAME` | Output from infrastructure deployment | Cosmos DB account used by API deployments. |
| `COSMOS_TABLE_NAME` | `finance` | Cosmos DB Table name. |

After the infrastructure workflow runs, copy the `containerAppName` output into `API_CONTAINER_APP_NAME` and the `cosmosAccountName` output into `COSMOS_ACCOUNT_NAME`.

### Repository Secrets

| Secret | Purpose |
| --- | --- |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Deployment token for Azure Static Web Apps. |
| `GHCR_USERNAME` | Account used by Azure Container Apps to pull images from GitHub Container Registry. |
| `GHCR_READ_TOKEN` | Token with `read:packages` permission for private GitHub Container Registry images. |

## Deployment Flow

1. Run the `Infra Up` workflow or `scripts/up.ps1`.
2. Copy generated resource names from the infrastructure deployment outputs into repository variables.
3. Run the frontend deployment workflow to publish the web app.
4. Run the backend deployment workflow after an API Dockerfile exists at the configured API path.

## Notes

The initial infrastructure deployment uses a placeholder container image for the API Container App. The backend deployment workflow replaces it with an application image after the API container image is built and pushed.
