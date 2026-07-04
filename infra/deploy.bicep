targetScope = 'subscription'

@description('Resource group that will contain all application resources.')
param resourceGroupName string

@description('Azure region for the resource group.')
param location string = 'centralus'

@description('Short, lowercase application name used in Azure resource names. Use letters, numbers, and hyphens.')
param appName string

@description('Azure Static Web Apps region. Static Web Apps supports a smaller region set than normal Azure resources.')
param staticWebAppLocation string = 'centralus'

var tags = {
  app: toLower(appName)
  managedBy: 'bicep'
  workload: 'web-ui'
}

resource appResourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module appResources 'main.bicep' = {
  name: 'app-resources'
  scope: appResourceGroup
  params: {
    appName: appName
    location: location
    staticWebAppLocation: staticWebAppLocation
  }
}

output resourceGroupName string = appResourceGroup.name
output staticWebAppName string = appResources.outputs.staticWebAppName
output staticWebAppDefaultHostName string = appResources.outputs.staticWebAppDefaultHostName
output containerAppName string = appResources.outputs.containerAppName
output containerAppUrl string = appResources.outputs.containerAppUrl
output cosmosAccountName string = appResources.outputs.cosmosAccountName
output cosmosTableName string = appResources.outputs.cosmosTableName
