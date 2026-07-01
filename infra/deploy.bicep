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

@description('Deploy application resources into the resource group. Set to false to validate only subscription authentication and resource group creation.')
param deployAppResources bool = true

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

module appResources 'main.bicep' = if (deployAppResources) {
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
output staticWebAppName string = deployAppResources ? appResources.outputs.staticWebAppName : ''
output staticWebAppDefaultHostName string = deployAppResources ? appResources.outputs.staticWebAppDefaultHostName : ''
output containerAppName string = deployAppResources ? appResources.outputs.containerAppName : ''
output containerAppUrl string = deployAppResources ? appResources.outputs.containerAppUrl : ''
output containerEnvironmentName string = deployAppResources ? appResources.outputs.containerEnvironmentName : ''
output cosmosAccountName string = deployAppResources ? appResources.outputs.cosmosAccountName : ''
output cosmosTableEndpoint string = deployAppResources ? appResources.outputs.cosmosTableEndpoint : ''
output cosmosTableName string = deployAppResources ? appResources.outputs.cosmosTableName : ''
output storageAccountName string = deployAppResources ? appResources.outputs.storageAccountName : ''
