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

@description('The Microsoft Entra Client ID for the production environment.')
param entraClientId string = ''

@description('The Microsoft Entra Tenant ID for the production environment.')
param entraTenantId string = ''

@description('The primary user email allowed to access this workspace.')
@minLength(3)
param allowedEmail string

@description('The secure secret used to sign session cookies. Should be at least 32 characters.')
@secure()
@minLength(32)
param sessionSecret string

@description('Alpha Vantage API key used to refresh security details.')
@secure()
param alphaVantageApiKey string = ''

@description('The application environment setting (e.g. production, development).')
param environment string = 'production'

@description('Distribution research provider. Stub remains the credential-free default.')
@allowed(['stub', 'azure_foundry'])
param dividendResearchProvider string = 'stub'

@description('Foundry project endpoint or Azure OpenAI resource endpoint.')
param azureFoundryEndpoint string = ''

@description('Existing structured-output-capable model deployment name.')
param azureFoundryDeployment string = ''

@description('Version-controlled dividend history agent name.')
param azureFoundryAgentName string = 'dividend-history-agent'

@description('Reasoning effort for reasoning models; leave empty for models without this setting.')
@allowed(['', 'none', 'low', 'medium', 'high'])
param azureFoundryReasoningEffort string = ''

@description('Production Foundry access uses Microsoft Entra managed identity.')
@allowed(['entra'])
param azureFoundryAuthMode string = 'entra'

@description('Existing user-assigned identity to retain/attach; empty uses the system identity.')
param azureFoundryManagedIdentityResourceId string = ''

@description('Client ID of the attached user-assigned identity; empty selects system-assigned identity.')
param azureFoundryManagedIdentityClientId string = ''

var normalizedAppName = toLower(appName)
var compactAppName = take(replace(normalizedAppName, '-', ''), 8)
var suffix = uniqueString(resourceGroup().id, normalizedAppName)
var tags = {
  app: normalizedAppName
  managedBy: 'bicep'
  costProfile: 'personal-scale'
  tranche: 'runtime-api'
}

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' existing = {
  name: 'stapp-${compactAppName}-${suffix}'
}

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' existing = {
  name: 'cosmos-${compactAppName}-${suffix}'
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: 'acr${compactAppName}${suffix}'
}

resource containerEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: 'cae-${compactAppName}-${suffix}'
}

resource apiContainerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-${compactAppName}-api-${suffix}'
  location: location
  tags: tags
  identity: empty(azureFoundryManagedIdentityResourceId) ? {
    type: 'SystemAssigned'
  } : {
    type: 'SystemAssigned,UserAssigned'
    userAssignedIdentities: {
      '${azureFoundryManagedIdentityResourceId}': {}
    }
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
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'cosmos-connection-string'
          value: cosmosAccount.listConnectionStrings().connectionStrings[0].connectionString
        }
        {
          name: 'session-secret'
          value: sessionSecret
        }
        ...(empty(alphaVantageApiKey) ? [] : [{
          name: 'alpha-vantage-api-key'
          value: alphaVantageApiKey
        }])
        {
          name: 'acr-password'
          value: acr.listCredentials().passwords[0].value
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
            ...(empty(alphaVantageApiKey) ? [] : [{
              name: 'FINANCE_COMPANION_ALPHA_VANTAGE_API_KEY'
              secretRef: 'alpha-vantage-api-key'
            }])
            {
              name: 'FINANCE_COMPANION_ENVIRONMENT'
              value: environment
            }
            {
              // The API requires an explicit provider outside development.
              name: 'FINANCE_COMPANION_DIVIDEND_RESEARCH_PROVIDER'
              value: dividendResearchProvider
            }
            {
              name: 'FINANCE_COMPANION_AZURE_FOUNDRY_ENDPOINT'
              value: azureFoundryEndpoint
            }
            {
              name: 'FINANCE_COMPANION_AZURE_FOUNDRY_DEPLOYMENT'
              value: azureFoundryDeployment
            }
            {
              name: 'FINANCE_COMPANION_AZURE_FOUNDRY_AGENT_NAME'
              value: azureFoundryAgentName
            }
            {
              name: 'FINANCE_COMPANION_AZURE_FOUNDRY_REASONING_EFFORT'
              value: azureFoundryReasoningEffort
            }
            {
              name: 'FINANCE_COMPANION_AZURE_FOUNDRY_AUTH_MODE'
              value: azureFoundryAuthMode
            }
            {
              name: 'FINANCE_COMPANION_AZURE_FOUNDRY_MANAGED_IDENTITY_CLIENT_ID'
              value: azureFoundryManagedIdentityClientId
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
              value: environment == 'development' ? '["http://localhost:5173", "https://${staticWebApp.properties.defaultHostname}"]' : '["https://${staticWebApp.properties.defaultHostname}"]'
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

output containerAppName string = apiContainerApp.name
output containerAppPrincipalId string = apiContainerApp.identity.principalId
output containerAppUrl string = 'https://${apiContainerApp.properties.configuration.ingress.fqdn}'
