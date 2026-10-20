<# Deploy the Foundry tranche without redeploying the application or changing its image. #>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Mandatory = $true)][string]$SubscriptionId,
  [string]$ResourceGroupName = 'rg-finance-companion',
  [string]$AppName = 'finance-companion',
  [string]$Location = 'centralus',
  [string]$ProjectName = 'distribution-research',
  [string]$DeploymentName = 'gpt-6-luna',
  [string]$ModelName = 'gpt-6-luna',
  [string]$ModelVersion = '2026-09-22',
  [ValidateRange(1, 1000000)][int]$Capacity = 100,
  [string]$ContainerAppName = '',
  [switch]$GrantCurrentUser
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Invoke-FoundryAzureJson {
  param([string[]]$Arguments)
  $result = & az @Arguments --subscription $SubscriptionId --only-show-errors --output json
  if ($LASTEXITCODE -ne 0) { throw "Azure CLI failed: az $($Arguments[0..1] -join ' ')" }
  return (($result -join "`n") | ConvertFrom-Json)
}
$template = Join-Path $PSScriptRoot '../foundry.bicep'
$parameters = @("appName=$AppName", "location=$Location", "projectName=$ProjectName", "deploymentName=$DeploymentName", "modelName=$ModelName", "modelVersion=$ModelVersion", "capacity=$Capacity")
if (-not $PSCmdlet.ShouldProcess("$ResourceGroupName / $DeploymentName ($ModelVersion), $Location, GlobalStandard capacity $Capacity", 'Create or update Foundry resource, project, model deployment and project service identity access')) {
  return
}
$outputs = Invoke-FoundryAzureJson -Arguments (@('deployment','group','create','--name',"$AppName-foundry",'--resource-group',$ResourceGroupName,'--template-file',$template,'--parameters') + $parameters + @('--query','properties.outputs'))
$access = Join-Path $PSScriptRoot 'configure-foundry-access.ps1'
$accessOptions = @{
  SubscriptionId = $SubscriptionId
  FoundryResourceId = $outputs.foundryResourceId.value
  FoundryProjectName = $outputs.projectName.value
  EndpointKind = 'Project'
}
if ($ContainerAppName) {
  & $access @accessOptions -ContainerAppName $ContainerAppName -ResourceGroupName $ResourceGroupName
}
if ($GrantCurrentUser) {
  # This switch is for a signed-in human, not an OIDC service principal in CI.
  $currentUser = & az ad signed-in-user show --query id --only-show-errors --output tsv
  if ($LASTEXITCODE -ne 0 -or -not $currentUser) { throw 'Unable to resolve the Azure CLI user. Use the RBAC setup script with an explicit principal instead.' }
  & $access @accessOptions -PrincipalObjectId $currentUser -PrincipalType User
}
Write-Host "Foundry endpoint: $($outputs.projectEndpoint.value)"
Write-Host "Model deployment: $($outputs.deploymentName.value)"
return $outputs
