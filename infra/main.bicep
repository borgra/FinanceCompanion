targetScope = 'resourceGroup'

@description('Short, lowercase application name used in Azure resource names. Use letters, numbers, and hyphens.')
param appName string

@description('Azure region for regional resources.')
param location string = resourceGroup().location

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

var normalizedAppName = toLower(appName)
var compactAppName = take(replace(normalizedAppName, '-', ''), 8)
var suffix = uniqueString(resourceGroup().id, normalizedAppName)
var tags = {
  app: normalizedAppName
  managedBy: 'bicep'
  costProfile: 'personal-scale'
}

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: 'stapp-${compactAppName}-${suffix}'
  location: staticWebAppLocation
  tags: tags
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    allowConfigFileUpdates: true
  }
}

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: 'cosmos-${compactAppName}-${suffix}'
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: true
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: [
      {
        name: 'EnableTable'
      }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
  }
}

resource cosmosTable 'Microsoft.DocumentDB/databaseAccounts/tables@2024-05-15' = {
  parent: cosmosAccount
  name: tableName
  properties: {
    resource: {
      id: tableName
    }
    options: {
      throughput: tableThroughput
    }
  }
}

resource containerEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${compactAppName}-${suffix}'
  location: location
  tags: tags
  properties: {}
}

resource apiContainerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-${compactAppName}-api-${suffix}'
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: containerEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: apiTargetPort
        transport: 'auto'
        allowInsecure: false
      }
    }
    template: {
      containers: [
        {
          name: 'api'
          image: containerImage
          env: [
            {
              name: 'COSMOS_TABLE_ENDPOINT'
              value: 'https://${cosmosAccount.name}.table.cosmos.azure.com:443/'
            }
            {
              name: 'COSMOS_TABLE_NAME'
              value: tableName
            }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: apiMaxReplicas
        rules: [
          {
            name: 'http'
            http: {
              metadata: {
                concurrentRequests: '25'
              }
            }
          }
        ]
      }
    }
  }
}

resource blobStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = if (enableBlobStorage) {
  name: 'st${compactAppName}${suffix}'
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

output staticWebAppName string = staticWebApp.name
output staticWebAppDefaultHostName string = staticWebApp.properties.defaultHostname
output containerAppName string = apiContainerApp.name
output containerAppUrl string = 'https://${apiContainerApp.properties.configuration.ingress.fqdn}'
output containerEnvironmentName string = containerEnvironment.name
output cosmosAccountName string = cosmosAccount.name
output cosmosTableEndpoint string = 'https://${cosmosAccount.name}.table.cosmos.azure.com:443/'
output cosmosTableName string = tableName
output storageAccountName string = enableBlobStorage ? blobStorage.name : ''
