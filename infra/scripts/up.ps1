param(
  [Parameter(Mandatory = $true)]
  [string] $SubscriptionId,

  [string] $AppName = "finance-companion",
  [string] $ResourceGroupName = "rg-finance-companion",
  [string] $Location = "centralus",
  [string] $StaticWebAppLocation = "centralus",
  [string] $EntraClientId = "",
  [string] $EntraTenantId = "",
  [string] $AllowedEmail = "steveborgra@gmail.com",
  [string] $SessionSecret = "",
  [string] $Environment = "production",
  [string] $ContainerImage = "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest",
  [int] $ApiTargetPort = 8000,
  [int] $ApiMaxReplicas = 1,
  [string] $TableName = "finance",
  [int] $TableThroughput = 400,
  [bool] $EnableBlobStorage = $false
)

$ErrorActionPreference = "Stop"

function Invoke-DeploymentTranche {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Name,
    [Parameter(Mandatory = $true)]
    [scriptblock] $Command
  )

  $startedAt = Get-Date
  Write-Host ""
  Write-Host "=== Starting tranche: $Name at $($startedAt.ToString("s")) ==="
  & $Command
  $finishedAt = Get-Date
  $elapsed = New-TimeSpan -Start $startedAt -End $finishedAt
  Write-Host "=== Finished tranche: $Name in $([math]::Round($elapsed.TotalSeconds, 1)) seconds ==="
}

az account set --subscription $SubscriptionId

Invoke-DeploymentTranche -Name "resource-group" -Command {
  az deployment sub create `
    --name "${AppName}-resource-group" `
    --location $Location `
    --template-file "infra/deploy.bicep" `
    --parameters appName=$AppName `
                 resourceGroupName=$ResourceGroupName `
                 location=$Location `
    --only-show-errors
}

Invoke-DeploymentTranche -Name "frontend" -Command {
  az deployment group create `
    --name "${AppName}-frontend" `
    --resource-group $ResourceGroupName `
    --template-file "infra/ui.bicep" `
    --parameters appName=$AppName staticWebAppLocation=$StaticWebAppLocation `
    --only-show-errors
}

Invoke-DeploymentTranche -Name "data" -Command {
  az deployment group create `
    --name "${AppName}-data" `
    --resource-group $ResourceGroupName `
    --template-file "infra/data.bicep" `
    --parameters appName=$AppName location=$Location tableName=$TableName tableThroughput=$TableThroughput `
    --only-show-errors
}

Invoke-DeploymentTranche -Name "runtime-base" -Command {
  az deployment group create `
    --name "${AppName}-runtime-base" `
    --resource-group $ResourceGroupName `
    --template-file "infra/runtime-base.bicep" `
    --parameters appName=$AppName location=$Location `
    --only-show-errors
}

Invoke-DeploymentTranche -Name "runtime-api" -Command {
  az deployment group create `
    --name "${AppName}-runtime-api" `
    --resource-group $ResourceGroupName `
    --template-file "infra/runtime-api.bicep" `
    --parameters appName=$AppName `
                 location=$Location `
                 staticWebAppLocation=$StaticWebAppLocation `
                 containerImage=$ContainerImage `
                 apiTargetPort=$ApiTargetPort `
                 apiMaxReplicas=$ApiMaxReplicas `
                 tableName=$TableName `
                 entraClientId=$EntraClientId `
                 entraTenantId=$EntraTenantId `
                 allowedEmail=$AllowedEmail `
                 sessionSecret=$SessionSecret `
                 environment=$Environment `
    --only-show-errors
}

if ($EnableBlobStorage) {
  Invoke-DeploymentTranche -Name "storage" -Command {
    az deployment group create `
      --name "${AppName}-storage" `
      --resource-group $ResourceGroupName `
      --template-file "infra/storage.bicep" `
      --parameters appName=$AppName location=$Location enableBlobStorage=true `
      --only-show-errors
  }
}
