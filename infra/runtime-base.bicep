targetScope = 'resourceGroup'

@description('Short, lowercase application name used in Azure resource names. Use letters, numbers, and hyphens.')
param appName string

@description('Azure region for regional resources.')
param location string = resourceGroup().location

var normalizedAppName = toLower(appName)
var compactAppName = take(replace(normalizedAppName, '-', ''), 8)
var suffix = uniqueString(resourceGroup().id, normalizedAppName)
var tags = {
  app: normalizedAppName
  managedBy: 'bicep'
  costProfile: 'personal-scale'
  tranche: 'runtime-base'
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'acr${compactAppName}${suffix}'
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

resource containerEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${compactAppName}-${suffix}'
  location: location
  tags: tags
  properties: {}
}

output acrLoginServer string = acr.properties.loginServer
output acrName string = acr.name
output containerEnvironmentName string = containerEnvironment.name

