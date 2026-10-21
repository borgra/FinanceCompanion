# Foundry access from Finance Companion

Live research now uses approved immutable agent versions and a deployment-attached blocking RAI policy. The older broad-runtime-role and direct-resource setup is superseded by [Research Agent Security](Research%20Agent%20Security.md) and [infrastructure deployment guidance](../infra/README.md).

The API Container App's managed identity, deployment OIDC principal, and local Azure CLI user are separate principals. Runtime invocation rights do not include registration, policy administration or role assignment. Browser sign-in is also separate from server-to-Foundry access.

## Runtime access

Use an Entra-only project endpoint:

```text
https://<account>.services.ai.azure.com/api/projects/<project>
```

`infra/foundry-runtime-access.bicep` defines a project-scoped custom role with only `AIServices/agents/read`, `AIServices/responses/write` and `AIServices/endpoints/interact/action` under `Microsoft.CognitiveServices/accounts`. A separate account-scoped role reads account/model-deployment/RAI-policy metadata. These reads let the runtime verify model and policy integrity before each research call. Neither role can edit agents, policies, model deployments or roles. The Foundry project's platform service identity separately retains the documented parent-account Foundry User prerequisite in `foundry.bicep`; that grant is never given to the calling API runtime. Exact permissions are version-controlled in `infra/roles/foundry-research-permissions.json`, using [Azure's documented operation names](https://learn.microsoft.com/en-us/azure/role-based-access-control/permissions/ai-machine-learning).

An administrator can preview runtime setup:

```powershell
./infra/scripts/configure-foundry-access.ps1 -FoundryResourceId '/subscriptions/<subscription-id>/resourceGroups/<group>/providers/Microsoft.CognitiveServices/accounts/<account>' -FoundryProjectName '<project>' -ContainerAppName '<api-app>' -ResourceGroupName '<api-group>' -SubscriptionId '<subscription-id>' -AccessProfile Runtime -WhatIf
```

Run without `-WhatIf` only during an approved rollout. The script audits inherited and group grants and rejects broader permissions before applying the restricted role module. Custom roles cannot cancel other Azure grants; remove prior broad roles through an administrator first. A failed or unreadable access audit fails closed. No script silently removes shared identities or grants.

## Operator and local development access

Registration operators need the separate Foundry development data role plus management permissions to read policy/model metadata. Provisioning additionally needs resource creation and scoped custom-role/role-assignment rights. Use `configure-foundry-access.ps1 -AccessProfile Developer -PrincipalObjectId '<human-object-id>' -PrincipalType User ...` explicitly for human operators. The script retains developer-only built-in role support for this purpose; do not apply it to the production API. [Foundry RBAC guidance](https://learn.microsoft.com/en-us/azure/foundry/concepts/rbac-foundry) separates developers from consumers.

Local live mode uses `az login` with the configured tenant/subscription. Leave the managed-identity client ID empty locally. Production uses the API managed identity, with an explicit client ID only when selecting a user-assigned identity. The data-plane scope is `https://ai.azure.com/.default`; management-policy verification uses the separate ARM scope `https://management.azure.com/.default`. A token alone does not establish permission, model capability or filter enforcement. See [Azure authentication guidance](https://learn.microsoft.com/en-us/azure/foundry/concepts/authentication-authorization-foundry).

## Configuration and verification

Supply server-only endpoint/deployment values, `FINANCE_COMPANION_AZURE_FOUNDRY_RAI_POLICY_ID`, and both `..._AGENT_VERSION` / `..._STOCK_DETAILS_AGENT_VERSION` settings after policy registration, immutable-version review, and smoke tests. Empty example values intentionally prevent live startup. Resource-only endpoints, API-key authentication and automatic latest-version selection are unsupported for research. Stub mode remains offline.

Use `infra/scripts/test-foundry.ps1` with the full policy ID and an explicit version for each kind. `-VerifyConfigurationOnly` makes no inference call; `-VerifyInjectionBlocking` is an opt-in adversarial call that requires Azure injection-blocking evidence. Run benign retrieval smoke checks as well. Metadata attachment and offline mocks do not prove that a deployed regional service enforces the filters. See [the security guide](Research%20Agent%20Security.md) for the complete release checks. No live cloud resources or populated credentials were changed by this migration.
