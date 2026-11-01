# Foundry access from Finance Companion

Use the API Container App's managed identity to call a dedicated or existing Foundry project. GitHub Actions uses its own OIDC identity to deploy the API. Local development uses your Azure CLI login through `DefaultAzureCredential`. These are three separate principals; giving the deployment identity permission does not authorize either the API or your local user.

Stock price/details refresh invokes the existing `stock-details-agent` in that project, sending only the ticker as task input. Select a different existing name with server setting `FINANCE_COMPANION_AZURE_FOUNDRY_STOCK_DETAILS_AGENT_NAME` or deployment variable `AZURE_FOUNDRY_STOCK_DETAILS_AGENT_NAME`. The API uses the agent's saved model, instructions, tools, and output schema, and does not register or overwrite it. This requires a project endpoint with Entra access; direct resource endpoints remain available only to the separate search/distribution paths. The agent must exist in the selected project and return sourced, structured stock-details facts expected by the API.

The default deployment remains `stub`. Select `azure_foundry` for AI web research: the model searches public issuer/regulatory sources, imports cited distribution facts, and the application validates and forecasts them. Only a supported Foundry endpoint/deployment and Entra access are needed. No Alpha Vantage account, market-data key, separate search account/key, Bing resource, source manifest, or per-security configuration is required.

## Create a new Foundry project and GPT-6 Luna deployment

`infra/foundry.bicep` now provisions an Entra-only Foundry account, the `distribution-research` project, and `gpt-6-luna` version `2026-09-22`. It grants the project's own service identity access to its parent account. Caller access is then assigned by the deployment helper:

```powershell
./infra/scripts/deploy-foundry.ps1 -SubscriptionId '<subscription-id>' -ContainerAppName '<api-container-app-name>' -GrantCurrentUser
```

Use `-WhatIf` to preview. The existing resource group must exist. The operator needs resource creation and role-assignment permissions; `-GrantCurrentUser` is for an interactive Azure CLI user. The script creates or reuses the Container App's system identity and grants only the caller roles described below. It does not replace the app image or enable AI in the running production revision.

Full infrastructure startup supports `-EnableFoundry`. In GitHub Infra Up, select `DIVIDEND_RESEARCH_PROVIDER=azure_foundry` and leave the endpoint unset to create the new tranche automatically; Backend Deploy resolves its endpoint/deployment from the stored ARM deployment outputs. Infrastructure automation needs role-assignment permission on the Foundry scopes; normal application deployment does not.

Run `infra/scripts/test-foundry.ps1 -SubscriptionId '<subscription-id>' -Endpoint '<project-endpoint>'` to check actual web search and strict JSON output. Both this check and application refreshes incur Azure model/search usage. Default Global Standard capacity is 100 quota units; verify available regional quota before deployment. See [the model catalog](https://ai.azure.com/catalog/models/gpt-6-luna) for the model and [Azure's Bicep examples](https://learn.microsoft.com/en-us/azure/templates/microsoft.cognitiveservices/2025-06-01/accounts/projects) for account/project provisioning.

## Choose the endpoint before assigning access

| API endpoint configured in `FINANCE_COMPANION_AZURE_FOUNDRY_ENDPOINT` | Setup-script option | Role and scope |
| --- | --- | --- |
| `https://<account>.services.ai.azure.com/api/projects/<project>` | `-EndpointKind Project -FoundryProjectName <project>` | **Foundry User**, `53ca6127-db72-4b80-b1b0-d745d6d5456d`, at the project ARM resource; **Reader**, `acdd72a7-3385-48ef-bd42-f606fba81ae7`, at its parent Foundry resource for metadata access. |
| `https://<account>.openai.azure.com` or its `/openai/v1` URL | `-EndpointKind Resource` | **Cognitive Services OpenAI User**, `5e0bd9bd-7b93-4f28-af87-19fc36ad61bd`, at the Azure OpenAI resource. |
| Foundry resource's direct OpenAI-compatible endpoint, `https://<account>.services.ai.azure.com/openai/v1` | `-EndpointKind Resource` for an OpenAI deployment | The same OpenAI inference role at the parent resource; a project-only assignment does not grant access to its parent. |

Foundry User was formerly named **Azure AI User**. The role GUID did not change; the script uses GUIDs to avoid rename rollout differences. Project scope has this form:

```text
/subscriptions/<subscription>/resourceGroups/<group>/providers/Microsoft.CognitiveServices/accounts/<account>/projects/<project>
```

The parent ends at `/accounts/<account>`. An endpoint URL is not an ARM role-assignment scope. Project scope limits access to that project; assigning Foundry User at the parent instead authorizes a broader set of account capabilities and child projects. The supplied script uses the narrower project assignment. See [Microsoft's Foundry RBAC guidance](https://learn.microsoft.com/en-us/azure/foundry/concepts/rbac-foundry).

Keep the **Foundry project's own managed identity** separate too. Microsoft also documents Foundry User on the parent Foundry resource for that project identity so project services can access their account resources; portal provisioning can establish it automatically. If an existing project was provisioned by CLI/IaC, its administrator should verify that prerequisite. The supplied script configures the **calling API/user** only; it does not grant parent-wide permissions to the API or alter the project's service identity.

This integration requires a deployment supporting **Responses, built-in `web_search`, and strict JSON schema output**. Both project and resource web-research paths use the **Responses API**: a search pass collects cited evidence and an extraction pass uses `text.format` to produce validated facts. A deployment name is the name you chose in Azure, which can differ from the model family name. RBAC does not create a deployment or enable an unavailable tool/model feature. Use a supported GPT deployment in your Azure region and check the exact model/version's tool support; a deployment supporting Chat Completions alone is insufficient. See [Azure OpenAI inference roles](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/role-based-access-control) and [supported Foundry SDKs and endpoints](https://learn.microsoft.com/en-us/azure/foundry/how-to/develop/sdk-overview).

For AI web research on either endpoint, the token audience is `https://ai.azure.com`, requested as `https://ai.azure.com/.default`. Do not request an ARM management token or a token for the literal project URL. [Microsoft's authentication guidance](https://learn.microsoft.com/en-us/azure/foundry/concepts/authentication-authorization-foundry) explains the difference between obtaining a token and authorizing a data-plane operation.

Built-in web search uses Azure's hosted search service and is billed through Azure in addition to model inference. Subscription policy can disable the tool even when inference RBAC succeeds. Have the subscription administrator check web-search availability if the service reports it disabled; the setup script does not change policy, networking, or billing settings. Public web queries are subject to Microsoft's grounding terms and data-boundary behavior, so the API sends public security identity/research questions rather than private portfolio holdings. See [Microsoft's web-search documentation](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/web-search).

## Local development

Sign in from the same host that runs the native API:

```powershell
az login --tenant '<tenant-id>'
az account set --subscription '<subscription-id>'
az ad signed-in-user show --query id --output tsv
```

An administrator grants that **user object ID** access. For a project:

```powershell
./infra/scripts/configure-foundry-access.ps1 `
  -FoundryResourceId '/subscriptions/<subscription-id>/resourceGroups/<foundry-group>/providers/Microsoft.CognitiveServices/accounts/<account>' `
  -FoundryProjectName '<project>' `
  -EndpointKind Project `
  -PrincipalObjectId '<your-user-object-id>' `
  -PrincipalType User `
  -WhatIf
```

Review the plan, then the administrator runs the same command without `-WhatIf`. For a direct Azure OpenAI resource use `-EndpointKind Resource` and omit the project name. Reader or Contributor alone is not a substitute for the inference data role.

Put the following settings in your ignored local environment file using the local startup instructions:

```dotenv
FINANCE_COMPANION_DIVIDEND_RESEARCH_PROVIDER=azure_foundry
FINANCE_COMPANION_AZURE_FOUNDRY_ENDPOINT=https://<account>.services.ai.azure.com/api/projects/<project>
FINANCE_COMPANION_AZURE_FOUNDRY_DEPLOYMENT=<deployment-name>
FINANCE_COMPANION_AZURE_FOUNDRY_REASONING_EFFORT=low
FINANCE_COMPANION_AZURE_FOUNDRY_AUTH_MODE=entra
FINANCE_COMPANION_AZURE_FOUNDRY_MANAGED_IDENTITY_CLIENT_ID=
```

Leave the managed identity client ID empty locally: your host has an Azure CLI user login, not a Container Apps identity endpoint. Do not set `AZURE_CLIENT_SECRET` or copy the production application-sign-in client ID into the managed identity setting. The supported local Entra path uses the Azure CLI credential through a constrained `DefaultAzureCredential`; inherited service-principal/workload/managed-identity credentials do not silently replace your CLI login. Production uses `ManagedIdentityCredential` for the runtime identity.

The new Luna deployment uses `low` reasoning effort to keep both research passes within the application's time budget. For another model, leave this setting empty unless it supports the selected effort.

Save those values in the repository root's ignored `.env.local`, run `./start-local.ps1`, then refresh from **Passive Income → Refresh distribution data**. Host CLI credentials are available to the native API; the credential-free Docker stack keeps its default stub behavior. Signing in on the host does not automatically sign in inside a container. No Foundry or search API key is needed for Entra mode. Existing local configuration is not overwritten.

Unknown split basis or insufficient cited history still produces explicit partial/unavailable results rather than fabricated data.

## Configure the production API identity

The Bicep API templates enable a system-assigned identity. For an existing Container App, the setup script also enables it if necessary. The operator needs permission to update that app and `Microsoft.Authorization/roleAssignments/write` on the target Foundry scopes, for example a suitably scoped RBAC administrator. Contributor cannot grant role assignments by itself. Use an administrator for this setup instead of expanding the normal deployment identity's permissions.

Preview the exact app, principal, role and scope:

```powershell
./infra/scripts/configure-foundry-access.ps1 `
  -SubscriptionId '<app-subscription-id>' `
  -ResourceGroupName 'rg-finance-companion' `
  -ContainerAppName '<api-container-app-name>' `
  -FoundryResourceId '/subscriptions/<foundry-subscription-id>/resourceGroups/<foundry-group>/providers/Microsoft.CognitiveServices/accounts/<account>' `
  -FoundryProjectName '<project>' `
  -EndpointKind Project `
  -WhatIf
```

Run without `-WhatIf` after review. It preserves attached identities, reuses existing inherited authorization, and uses a stable name for any new assignment. Repeated runs converge on the same grants. It does not create Foundry resources/models, change network rules, alter GitHub settings, or start a model request. If the system identity does not exist yet, preview explains that the principal will be created; the actual run resolves it before granting access. Deleting/recreating the Container App produces a new system principal, requiring another setup run.

For an existing **user-assigned** identity, add:

```powershell
-UserAssignedIdentityResourceId '/subscriptions/<subscription-id>/resourceGroups/<identity-group>/providers/Microsoft.ManagedIdentity/userAssignedIdentities/<identity-name>'
```

The script attaches that identity and grants roles to its **principal object ID**. It prints its **client ID** for the runtime selector. They are different identifiers. Attaching an existing identity also requires `Microsoft.ManagedIdentity/userAssignedIdentities/assign/action` on that identity. Both system- and user-assigned identities can remain attached. The runtime must explicitly select the user-assigned client ID; otherwise it uses system identity. See [managed identities in Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity).

## GitHub Environment `deployment`

Set these non-secret environment variables before running Backend Deploy:

| Variable | Value |
| --- | --- |
| `DIVIDEND_RESEARCH_PROVIDER` | `azure_foundry`, or explicit/default `stub` |
| `AZURE_FOUNDRY_ENDPOINT` | Project endpoint or direct Azure OpenAI endpoint; leave empty to discover the project created by Infra Up or the deployment helper |
| `AZURE_FOUNDRY_DEPLOYMENT` | Compatible deployment name; leave empty to discover the provisioned Luna deployment |
| `AZURE_FOUNDRY_REASONING_EFFORT` | `low` for Luna; automatically discovered for the new project, optional for other models |
| `AZURE_FOUNDRY_CAPACITY` | Infra Up only: Global Standard quota units, default `100` |
| `AZURE_FOUNDRY_AUTH_MODE` | `entra` (default and required for the production workflow) |
| `AZURE_FOUNDRY_MANAGED_IDENTITY_RESOURCE_ID` | Optional existing user-assigned identity ARM ID; empty selects system identity |

No market-data secret, Foundry key, separate search key, new Entra application secret, or browser Vite variable is required for AI web research. Backend Deploy only configures the optional legacy Alpha Vantage secret when one is supplied, so its absence does not block deployment. It attaches/enables the runtime identity and resolves a user-assigned identity's client ID automatically. It intentionally does **not** grant Foundry roles; run the administrator setup first.

Infra Up uses the same environment variables. With `azure_foundry` and no endpoint, it provisions the Foundry template and authorizes the API identity using the setup script. With an explicit existing endpoint, configure its access separately. For direct Bicep use, supply `dividendResearchProvider`, `azureFoundryEndpoint`, `azureFoundryDeployment`, `azureFoundryReasoningEffort`, and, for a user-assigned identity, both `azureFoundryManagedIdentityResourceId` and `azureFoundryManagedIdentityClientId`. `infra/scripts/up.ps1` resolves the optional client ID itself. RBAC assignments can live outside the app's resource group when Foundry does. Keep that resource ID and scope in the deployment runbook.

The Backend Deploy OIDC principal needs its existing deployment permissions, plus identity-attachment permissions if a user-assigned identity is selected. Infra Up additionally needs role-assignment permission when provisioning Foundry. Set `AZURE_INFRA_CLIENT_ID` to a separate infrastructure principal if the regular deployment principal lacks that permission. The API managed identity receives only the chosen inference grants. `ENV_PROD_ENTRA_CLIENT_ID` remains the application's user-login configuration and is unrelated to either identity above.

## Verify and diagnose

1. Verify the deployment exists and has provisioning state `Succeeded`:

   ```powershell
   az cognitiveservices account deployment show `
     --resource-group '<foundry-group>' --name '<account>' `
     --deployment-name '<deployment-name>' `
     --query properties.provisioningState --output tsv
   ```

2. Check role assignments for the actual caller's object ID at the project or account scope. Re-run setup to report any existing inherited grant. A local user's successful request proves that user's access; repeat refresh from the deployed API to verify the Container App identity.
3. Wait for role-assignment propagation and retry. A token issued before a change may be cached; restarting the app revision can refresh application credentials, but cannot bypass Azure propagation.
4. Refresh a held, supported stock/ETF in Passive Income. Confirm live provenance, warnings, and the three year views. Provider/source failures remain explicit; no stub fallback should masquerade as live data.

| Symptom | Check |
| --- | --- |
| Credential unavailable locally | Run `az login` in the intended tenant on the API host; check for stale `AZURE_*` service-principal variables. |
| Credential unavailable in Container Apps | Confirm the selected identity is attached; the configured client ID must match the selected user-assigned identity. |
| 401 | Token audience, endpoint type, tenant, and expired/cached credentials. Do not paste access tokens into logs. |
| 403 | Role assigned to the API's principal instead of GitHub's principal; correct project/account scope; propagation; Foundry firewall restrictions. |
| 404 or unsupported API/model | Exact account/project/deployment name and endpoint path; compatible structured-output deployment. A project is not a deployment name. |
| DNS failure, timeout, network-denied response | Container App outbound networking, Foundry public-network/firewall policy, private endpoint DNS/VNet reachability. RBAC cannot open the network path. Local access can require VPN/private DNS separately. |
| Search unavailable, 429, or partial history | Foundry model/search quota, tool availability/policy, source citations and public-web coverage; inspect sanitized provider warnings. New role assignments cannot fix quota or disabled tools. |

Run `./infra/tests/configure-foundry-access.test.ps1` for offline setup checks; every Azure CLI call is mocked. Applying RBAC and proving a production inference request require your real tenant, pre-existing model deployment, allowed networking, and the authorized operator; those cloud operations are deliberately separate from source-code changes.

