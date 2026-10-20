# Offline deployment contract checks. Every Azure CLI call is replaced.
$ErrorActionPreference = 'Stop'
$deployScript = Join-Path $PSScriptRoot '../scripts/deploy-foundry.ps1'
$global:FoundryDeployCalls = [System.Collections.Generic.List[object]]::new()
$global:FoundryDeployFail = $false
function global:az {
  $global:FoundryDeployCalls.Add(@($args))
  $global:LASTEXITCODE = if ($global:FoundryDeployFail) { 1 } else { 0 }
  if ($global:FoundryDeployFail) { return }
  if (($args[0..2] -join ' ') -ne 'deployment group create') { throw 'Unexpected Azure operation.' }
  '{"foundryResourceId":{"value":"/subscriptions/sub/resourceGroups/rg/providers/Microsoft.CognitiveServices/accounts/ai"},"projectName":{"value":"distribution-research"},"projectEndpoint":{"value":"https://ai.services.ai.azure.com/api/projects/distribution-research"},"deploymentName":{"value":"gpt-6-luna"},"reasoningEffort":{"value":"low"}}'
}
try {
  & $deployScript -SubscriptionId 'sub' -WhatIf | Out-Null
  if ($global:FoundryDeployCalls.Count -ne 0) { throw 'WhatIf invoked Azure.' }
  $result = & $deployScript -SubscriptionId 'sub'
  if ($global:FoundryDeployCalls.Count -ne 1 -or $result.deploymentName.value -ne 'gpt-6-luna') { throw 'Deployment did not return its public configuration.' }
  $arguments = $global:FoundryDeployCalls[0]
  foreach ($expected in @('--subscription', 'sub', 'capacity=100', 'modelName=gpt-6-luna', 'modelVersion=2026-09-22')) {
    if ($expected -notin $arguments) { throw "Missing deployment argument $expected" }
  }
  $global:FoundryDeployFail = $true
  $failed = $false
  try { & $deployScript -SubscriptionId 'sub' | Out-Null } catch { $failed = $true }
  if (-not $failed) { throw 'Native Azure CLI failure was ignored.' }
  Write-Host 'Foundry deployment offline checks passed: preview, pinned model, quota capacity, explicit subscription and failure handling.'
} finally {
  Remove-Item Function:\global:az
  Remove-Variable -Scope Global -Name FoundryDeployCalls, FoundryDeployFail -ErrorAction SilentlyContinue
}
