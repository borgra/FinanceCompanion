targetScope = 'resourceGroup'

@description('Short, lowercase application name used in Azure resource names. Use letters, numbers, and hyphens.')
param appName string

@description('Azure region for regional resources.')
param location string = resourceGroup().location

@description('Cosmos DB Table name for application data.')
param tableName string = 'finance'

@description('Provisioned throughput for the Cosmos DB Table API table. Keep <= 1000 RU/s to stay inside the free-tier allowance.')
@minValue(400)
@maxValue(1000)
param tableThroughput int = 400

var normalizedAppName = toLower(appName)
var compactAppName = take(replace(normalizedAppName, '-', ''), 8)
var suffix = uniqueString(resourceGroup().id, normalizedAppName)
var tags = {
  app: normalizedAppName
  managedBy: 'bicep'
  costProfile: 'personal-scale'
  tranche: 'data'
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

output cosmosAccountName string = cosmosAccount.name
output cosmosTableEndpoint string = 'https://${cosmosAccount.name}.table.cosmos.azure.com:443/'
output cosmosTableName string = tableName

