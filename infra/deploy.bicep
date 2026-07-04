targetScope = 'subscription'

@description('Resource group that will contain all application resources.')
param resourceGroupName string

@description('Azure region for the resource group.')
param location string = 'centralus'

@description('Short, lowercase application name used in Azure resource names. Use letters, numbers, and hyphens.')
param appName string

var tags = {
  app: toLower(appName)
  managedBy: 'bicep'
  workload: 'platform'
}

resource appResourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

output resourceGroupName string = appResourceGroup.name
