targetScope = 'resourceGroup'

param appName string
param location string = resourceGroup().location
param projectName string = 'distribution-research'
param agentName string = 'dividend-history-agent'
param stockDetailsAgentName string = 'stock-details-agent'
@description('Version this policy name when changing controls; approval also pins agent versions.')
param raiPolicyName string = 'research-injection-blocking-v1'
param deploymentName string = 'gpt-6-luna'
param modelName string = 'gpt-6-luna'
param modelVersion string = '2026-09-22'

@description('Public network access for the Foundry account. Use Disabled when private endpoints are configured.')
@allowed(['Enabled', 'Disabled'])
param publicNetworkAccess string = 'Enabled'

@description('Global Standard quota units, not provisioned throughput. 100 gives this model 100k TPM; single-pass web research needs headroom.')
@minValue(1)
param capacity int = 100

var compactAppName = take(replace(toLower(appName), '-', ''), 8)
var suffix = uniqueString(resourceGroup().id, toLower(appName))
var tags = {
  app: toLower(appName)
  managedBy: 'bicep'
  tranche: 'foundry'
  workload: 'distribution-research'
}

resource foundry 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: 'ai-${compactAppName}-${suffix}'
  location: location
  tags: tags
  kind: 'AIServices'
  sku: { name: 'S0' }
  identity: { type: 'SystemAssigned' }
  properties: {
    customSubDomainName: 'ai-${compactAppName}-${suffix}'
    allowProjectManagement: true
    disableLocalAuth: true
    publicNetworkAccess: publicNetworkAccess
    networkAcls: {
      defaultAction: publicNetworkAccess == 'Enabled' ? 'Allow' : 'Deny'
    }
  }
}

resource project 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = {
  parent: foundry
  name: projectName
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    displayName: 'Finance Companion distributions'
    description: 'Single-pass cited public-web dividend history research.'
  }
  // Cognitive Services rejects overlapping project/model writes on one account.
  dependsOn: [model]
}

// Policy attachment protects direct Responses calls as well as registered agents.
var promptBaseline = [for category in ['Hate', 'Sexual', 'Violence', 'Selfharm']: {
  name: category
  source: 'Prompt'
  severityThreshold: 'Medium'
  enabled: true
  blocking: true
}]
var completionBaseline = [for category in ['Hate', 'Sexual', 'Violence', 'Selfharm']: {
  name: category
  source: 'Completion'
  severityThreshold: 'Medium'
  enabled: true
  blocking: true
}]
resource researchPolicy 'Microsoft.CognitiveServices/accounts/raiPolicies@2025-06-01' = {
  parent: foundry
  name: raiPolicyName
  properties: {
    basePolicyName: 'Microsoft.DefaultV2'
    mode: 'Blocking'
    contentFilters: concat(promptBaseline, completionBaseline, [
      { name: 'Jailbreak', source: 'Prompt', enabled: true, blocking: true }
      { name: 'Indirect Attack', source: 'Prompt', enabled: true, blocking: true }
    ])
  }
}

// The project's service identity is separate from API and developer callers.
// This platform service identity prerequisite is distinct from the API caller.
// Runtime caller permissions are restricted separately by configure-foundry-access.
var foundryUserRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '53ca6127-db72-4b80-b1b0-d745d6d5456d')
resource projectServiceAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundry.id, project.id, foundryUserRoleId)
  scope: foundry
  properties: {
    roleDefinitionId: foundryUserRoleId
    principalId: project.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource model 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = {
  parent: foundry
  name: deploymentName
  sku: {
    name: 'GlobalStandard'
    capacity: capacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: modelName
      version: modelVersion
    }
    versionUpgradeOption: 'NoAutoUpgrade'
    raiPolicyName: researchPolicy.name
  }
}

output foundryResourceId string = foundry.id
output foundryName string = foundry.name
output projectName string = project.name
output projectEndpoint string = 'https://${foundry.name}.services.ai.azure.com/api/projects/${project.name}'
output deploymentName string = model.name
output modelVersion string = modelVersion
output reasoningEffort string = 'low'

output agentName string = agentName
output stockDetailsAgentName string = stockDetailsAgentName

output raiPolicyId string = researchPolicy.id
