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

@description('The Microsoft Entra Client ID for the production environment.')
param entraClientId string = ''

@description('The Microsoft Entra Tenant ID for the production environment.')
param entraTenantId string = ''

@description('The primary user email allowed to access this workspace.')
param allowedEmail string = 'steveborgra@gmail.com'

@description('The secure secret used to sign session cookies. Should be at least 32 characters.')
@secure()
param sessionSecret string = ''

@description('The application environment setting (e.g. production, development).')
param environment string = 'production'

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

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'acr${compactAppName}${suffix}'
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
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
  identity: {
    type: 'SystemAssigned'
  }
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
      registries: [
        {
          server: acr.properties.loginServer
          identity: 'system'
        }
      ]
      secrets: [
        {
          name: 'cosmos-connection-string'
          value: cosmosAccount.listConnectionStrings().connectionStrings[0].connectionString
        }
        {
          name: 'session-secret'
          value: empty(sessionSecret) ? 'local-dev-session-secret-change-me-longer-32-chars' : sessionSecret
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: containerImage
          env: [
            {
              name: 'FINANCE_COMPANION_COSMOS_TABLE_CONNECTION_STRING'
              secretRef: 'cosmos-connection-string'
            }
            {
              name: 'FINANCE_COMPANION_COSMOS_TABLE_NAME'
              value: tableName
            }
            {
              name: 'FINANCE_COMPANION_SESSION_SECRET'
              secretRef: 'session-secret'
            }
            {
              name: 'FINANCE_COMPANION_ENVIRONMENT'
              value: environment
            }
            {
              name: 'FINANCE_COMPANION_ALLOWED_EMAIL'
              value: allowedEmail
            }
            {
              name: 'FINANCE_COMPANION_ENTRA_CLIENT_ID'
              value: entraClientId
            }
            {
              name: 'FINANCE_COMPANION_ENTRA_TENANT_ID'
              value: entraTenantId
            }
            {
              name: 'FINANCE_COMPANION_CORS_ORIGINS'
              value: '["http://localhost:5173", "https://${staticWebApp.properties.defaultHostname}"]'
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

resource acrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, apiContainerApp.id, 'AcrPull')
  scope: acr
  properties: {
    principalId: apiContainerApp.identity.principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
    principalType: 'ServicePrincipal'
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
output acrLoginServer string = acr.properties.loginServer
output acrName string = acr.name
