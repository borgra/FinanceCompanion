param(
  [Parameter(Mandatory = $true)]
  [string] $SubscriptionId,

  [string] $AppName = "finance-companion",
  [string] $ResourceGroupName = "rg-finance-companion",
  [string] $Location = "centralus",
  [string] $StaticWebAppLocation = "centralus",
  [string] $EntraClientId = "",
  [string] $EntraTenantId = "",
  [string] $AllowedEmail = "",
  [string] $SessionSecret = "",
  [string] $AlphaVantageApiKey = "",
  [string] $Environment = "production",
  [ValidateSet('stub', 'azure_foundry')]
  [string] $DividendResearchProvider = 'stub',
  [string] $AzureFoundryEndpoint = '',
  [string] $AzureFoundryDeployment = '',
  [string] $AzureFoundryAgentName = 'dividend-history-agent',
  [string] $AzureFoundryReasoningEffort = '',
  [string] $AzureFoundryManagedIdentityResourceId = '',
  [switch] $EnableFoundry,
  [ValidateRange(1, 1000000)][int] $FoundryCapacity = 100,
  [string] $ContainerImage = "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest",
  [int] $ApiTargetPort = 8000,
  [int] $ApiMaxReplicas = 1,
  [string] $TableName = "finance",
  [int] $TableThroughput = 400,
  [bool] $EnableBlobStorage = $false
)

$ErrorActionPreference = "Stop"

if ($SessionSecret.Length -lt 32 -or $SessionSecret.StartsWith('local-dev-session-secret')) {
  throw 'Supply a private, randomly generated SessionSecret of at least 32 characters before deploying.'
}
if ([string]::IsNullOrWhiteSpace($AllowedEmail)) {
  throw 'Supply an explicit AllowedEmail before deploying.'
}
if ($Environment -ne 'development' -and ([string]::IsNullOrWhiteSpace($EntraClientId) -or [string]::IsNullOrWhiteSpace($EntraTenantId))) {
  throw 'Supply EntraClientId and EntraTenantId before deploying a non-development environment.'
}

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

$newFoundry = $null
if ($EnableFoundry) {
  $newFoundry = & (Join-Path $PSScriptRoot 'deploy-foundry.ps1') -SubscriptionId $SubscriptionId -ResourceGroupName $ResourceGroupName -AppName $AppName -Location $Location -Capacity $FoundryCapacity -AgentName $AzureFoundryAgentName
  $AzureFoundryEndpoint = $newFoundry.projectEndpoint.value
  $AzureFoundryDeployment = $newFoundry.deploymentName.value
  $AzureFoundryReasoningEffort = $newFoundry.reasoningEffort.value
  $DividendResearchProvider = 'azure_foundry'
}

Invoke-DeploymentTranche -Name "runtime-api" -Command {
  $runtimeIdentityClientId = ''
  if ($AzureFoundryManagedIdentityResourceId) {
    $runtimeIdentityClientId = az identity show --ids $AzureFoundryManagedIdentityResourceId --query clientId --output tsv --only-show-errors
    if ($LASTEXITCODE -ne 0 -or -not $runtimeIdentityClientId) { throw 'Unable to resolve the user-assigned identity client ID.' }
  }
  $secretParamFile = Join-Path ([System.IO.Path]::GetTempPath()) ("fc-runtime-secrets-" + [guid]::NewGuid().ToString("N") + ".json")
  try {
    @{
      sessionSecret = @{ value = $SessionSecret }
      alphaVantageApiKey = @{ value = $AlphaVantageApiKey }
    } | ConvertTo-Json -Compress | Set-Content -LiteralPath $secretParamFile -Encoding utf8 -NoNewline
    az deployment group create `
      --name "${AppName}-runtime-api" `
      --resource-group $ResourceGroupName `
      --template-file "infra/runtime-api.bicep" `
      --parameters "@$secretParamFile" `
                   appName=$AppName `
                   location=$Location `
                   staticWebAppLocation=$StaticWebAppLocation `
                   containerImage=$ContainerImage `
                   apiTargetPort=$ApiTargetPort `
                   apiMaxReplicas=$ApiMaxReplicas `
                   tableName=$TableName `
                   entraClientId=$EntraClientId `
                   entraTenantId=$EntraTenantId `
                   allowedEmail=$AllowedEmail `
                   environment=$Environment `
                   dividendResearchProvider=$DividendResearchProvider `
                   azureFoundryEndpoint=$AzureFoundryEndpoint `
                   azureFoundryDeployment=$AzureFoundryDeployment `
                   azureFoundryAgentName=$AzureFoundryAgentName `
                   azureFoundryReasoningEffort=$AzureFoundryReasoningEffort `
                   azureFoundryManagedIdentityResourceId=$AzureFoundryManagedIdentityResourceId `
                   azureFoundryManagedIdentityClientId=$runtimeIdentityClientId `
      --only-show-errors
  } finally {
    Remove-Item -LiteralPath $secretParamFile -Force -ErrorAction SilentlyContinue
  }
}

if ($newFoundry) {
  $apiName = az deployment group show --subscription $SubscriptionId --resource-group $ResourceGroupName --name "$AppName-runtime-api" --query properties.outputs.containerAppName.value --output tsv --only-show-errors
  if ($LASTEXITCODE -ne 0 -or -not $apiName) { throw 'Unable to resolve the runtime Container App name for Foundry RBAC.' }
  & (Join-Path $PSScriptRoot 'configure-foundry-access.ps1') -SubscriptionId $SubscriptionId -ResourceGroupName $ResourceGroupName -ContainerAppName $apiName -FoundryResourceId $newFoundry.foundryResourceId.value -FoundryProjectName $newFoundry.projectName.value -EndpointKind Project -UserAssignedIdentityResourceId $AzureFoundryManagedIdentityResourceId
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
