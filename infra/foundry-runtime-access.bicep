targetScope = 'resourceGroup'

param foundryAccountName string
param projectName string
param principalId string = ''

var permissions = loadJsonContent('roles/foundry-research-permissions.json')
resource foundry 'Microsoft.CognitiveServices/accounts@2025-06-01' existing = {
  name: foundryAccountName
}
resource project 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' existing = {
  parent: foundry
  name: projectName
}
resource runtimeRole 'Microsoft.Authorization/roleDefinitions@2022-04-01' = {
  name: guid(resourceGroup().id, 'finance-companion-research-runtime-v1')
  properties: {
    roleName: 'Finance Companion Research Runtime ${uniqueString(resourceGroup().id)}'
    description: 'Read approved agent definitions and invoke research; cannot edit agents, policies, deployments or roles.'
    type: 'CustomRole'
    assignableScopes: [resourceGroup().id]
    permissions: [{ actions: [], notActions: [], dataActions: permissions.runtimeDataActions, notDataActions: [] }]
  }
}
resource metadataRole 'Microsoft.Authorization/roleDefinitions@2022-04-01' = {
  name: guid(resourceGroup().id, 'finance-companion-research-metadata-v1')
  properties: {
    roleName: 'Finance Companion Research Metadata ${uniqueString(resourceGroup().id)}'
    description: 'Read model identity, deployment policy attachment and the configured RAI policy only.'
    type: 'CustomRole'
    assignableScopes: [resourceGroup().id]
    permissions: [{ actions: permissions.metadataActions, notActions: [], dataActions: [], notDataActions: [] }]
  }
}
resource runtimeAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(principalId)) {
  scope: project
  name: guid(project.id, principalId, runtimeRole.id)
  properties: { principalId: principalId, principalType: 'ServicePrincipal', roleDefinitionId: runtimeRole.id }
}
resource metadataAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(principalId)) {
  scope: foundry
  name: guid(foundry.id, principalId, metadataRole.id)
  properties: { principalId: principalId, principalType: 'ServicePrincipal', roleDefinitionId: metadataRole.id }
}
output runtimeRoleId string = runtimeRole.id
output metadataRoleId string = metadataRole.id
