targetScope = 'subscription'

@description('Resource group that will contain all application resources.')
param resourceGroupName string

@description('Azure region for the resource group and regional resources.')
param location string = 'centralus'

@description('Short, lowercase application name used in Azure resource names. Use letters, numbers, and hyphens.')
param appName string

@description('Azure Static Web Apps region. Static Web Apps supports a smaller region set than normal Azure resources.')
param staticWebAppLocation string = 'centralus'

@description('Container image for the Python API. Use a placeholder until the API image exists.')
param containerImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('External port exposed by the API container.')
param apiTargetPort int = 8000

@description('Maximum API replicas. Keep this low for personal-scale cost control.')
@minValue(1)
param apiMaxReplicas int = 1

@description('Cosmos DB Table name for application data.')
param tableName string = 'finance'

@description('Provisioned throughput for the Cosmos DB Table API table. Keep <= 1000 RU/s to stay inside the free-tier allowance.')
@minValue(400)
@maxValue(1000)
param tableThroughput int = 400

@description('Create a low-cost blob storage account for optional file persistence.')
param enableBlobStorage bool = false

var tags = {
  app: toLower(appName)
  managedBy: 'bicep'
  costProfile: 'personal-scale'
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
    containerImage: containerImage
    apiTargetPort: apiTargetPort
    apiMaxReplicas: apiMaxReplicas
    tableName: tableName
    tableThroughput: tableThroughput
    enableBlobStorage: enableBlobStorage
  }
}

output resourceGroupName string = appResourceGroup.name
output staticWebAppName string = appResources.outputs.staticWebAppName
output staticWebAppDefaultHostName string = appResources.outputs.staticWebAppDefaultHostName
output containerAppName string = appResources.outputs.containerAppName
output containerAppUrl string = appResources.outputs.containerAppUrl
output containerEnvironmentName string = appResources.outputs.containerEnvironmentName
output cosmosAccountName string = appResources.outputs.cosmosAccountName
output cosmosTableEndpoint string = appResources.outputs.cosmosTableEndpoint
output cosmosTableName string = appResources.outputs.cosmosTableName
output storageAccountName string = appResources.outputs.storageAccountName
