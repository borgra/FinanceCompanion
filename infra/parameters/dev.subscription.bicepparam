using '../deploy.bicep'

param resourceGroupName = 'rg-finance-companion-dev'
param appName = 'finance-companion'
param location = 'centralus'
param staticWebAppLocation = 'centralus'
param apiTargetPort = 8000
param apiMaxReplicas = 1
param tableName = 'finance'
param tableThroughput = 400
param enableBlobStorage = false
