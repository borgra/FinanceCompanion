# Azure Deployment Security

This deployment uses GitHub OpenID Connect (OIDC) for Azure authentication. OIDC avoids storing Azure client secrets in GitHub and allows Azure to issue short-lived tokens only to matching workflow runs.

## Recommended Setup

Use two Azure identities:

| Identity | GitHub variable | Scope | Purpose |
| --- | --- | --- | --- |
| Infrastructure identity | `AZURE_INFRA_CLIENT_ID` | Subscription or target management group | Creates and updates the resource group and Azure resources. |
| Deployment identity | `AZURE_DEPLOY_CLIENT_ID` | Application resource group | Deploys frontend/backend application updates. |

Both identities share:

| Variable | Purpose |
| --- | --- |
| `AZURE_TENANT_ID` | Azure tenant containing the identities. |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription containing the resources. |

For a simpler setup, `AZURE_CLIENT_ID` can be used instead of the two split identity variables. The split identity model is preferred for least privilege.

## GitHub Environments

The workflows use these GitHub environments:

| Environment | Workflows |
| --- | --- |
| `infrastructure` | `Infra Up`, `Infra Down` |
| `deployment` | `Frontend Deploy`, `Backend Deploy` |

Configure environment protection rules in GitHub for both environments, especially `infrastructure` for resource creation and deletion. Required reviewers are recommended.

## Federated Credential Subjects

When creating Azure federated credentials, scope them to the GitHub environments instead of the entire repository.

Use this subject pattern for the infrastructure identity:

```text
repo:<owner>/<repo>:environment:infrastructure
```

Use this subject pattern for the deployment identity:

```text
repo:<owner>/<repo>:environment:deployment
```

This limits each Azure identity to workflow jobs that run inside the matching GitHub environment.

## Permissions

Recommended Azure RBAC:

| Identity | Recommended role |
| --- | --- |
| Infrastructure identity | `Contributor` at subscription scope, or a custom role that can create resource groups and deploy the required resource types. |
| Deployment identity | `Contributor` on the application resource group only. |

Creating the optional Foundry tranche also creates scoped role assignments for the project's service identity and API caller. Its infrastructure operator needs `Microsoft.Authorization/roleAssignments/write` at those Foundry scopes (for example, appropriately scoped Role Based Access Control Administrator in addition to resource creation permissions). Contributor alone cannot grant these roles. Keep this additional permission off the normal Backend Deploy identity. For an existing account, scope the grant to that account; initial account creation requires an administrator able to assign roles beneath the target resource group.

The deployment identity needs enough permission to:

- Read Static Web App deployment secrets.
- Update the Static Web App deployment.
- Update Container Apps.
- Read Cosmos DB connection strings if backend deployment is enabled.

Foundry inference uses the API Container App's managed identity, separately from
the GitHub OIDC deployment principal and the application's Entra sign-in client.
An administrator grants project-scoped Foundry User access (or resource-scoped
Cognitive Services OpenAI User for direct OpenAI inference). See
[Foundry Entra RBAC](../Docs/Foundry%20Entra%20RBAC.md) for the idempotent setup
script, exact role GUIDs, local developer access, optional user-assigned identity,
and endpoint/scope troubleshooting. Do not grant the runtime identity Contributor
or expand the deployment principal's permissions just to make inference work.

## Secrets

Do not store Azure client secrets for these workflows. Store only the non-secret identifiers required for OIDC:

- Client ID
- Tenant ID
- Subscription ID

GitHub Container Registry credentials are only required when Azure Container Apps must pull a private backend image from GHCR.
