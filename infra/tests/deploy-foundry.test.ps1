# Offline deployment contract checks. Every Azure CLI call is replaced.
$ErrorActionPreference = 'Stop'
$deployScript = Join-Path $PSScriptRoot '../scripts/deploy-foundry.ps1'
$global:FoundryDeployCalls = [System.Collections.Generic.List[object]]::new()
$global:FoundryDeployFail = $false
$global:FoundryAgentCalls = [System.Collections.Generic.List[object]]::new()
function global:az {
  $global:FoundryDeployCalls.Add(@($args))
  $global:LASTEXITCODE = if ($global:FoundryDeployFail) { 1 } else { 0 }
  if ($global:FoundryDeployFail) { return }
  if (($args[0..1] -join ' ') -eq 'account get-access-token') { return 'offline-test-token' }
  if (($args[0..2] -join ' ') -ne 'deployment group create') { throw 'Unexpected Azure operation.' }
  '{"foundryResourceId":{"value":"/subscriptions/sub/resourceGroups/rg/providers/Microsoft.CognitiveServices/accounts/ai"},"projectName":{"value":"distribution-research"},"projectEndpoint":{"value":"https://ai.services.ai.azure.com/api/projects/distribution-research"},"deploymentName":{"value":"gpt-6-luna"},"reasoningEffort":{"value":"low"},"agentName":{"value":"dividend-history-agent"}}'
}
function global:Invoke-RestMethod {
  param($Uri, $Headers, $Method, $ContentType, $TimeoutSec, $Body)
  $global:FoundryAgentCalls.Add(@{ Uri = $Uri; Method = $Method; Body = $Body; Headers = $Headers })
  return @{ name = 'dividend-history-agent' }
}
try {
  & $deployScript -SubscriptionId 'sub' -WhatIf | Out-Null
  if ($global:FoundryDeployCalls.Count -ne 0) { throw 'WhatIf invoked Azure.' }
  $result = & $deployScript -SubscriptionId 'sub'
  if ($global:FoundryDeployCalls.Count -ne 2 -or $result.deploymentName.value -ne 'gpt-6-luna' -or $result.agentName.value -ne 'dividend-history-agent') { throw 'Deployment did not return its public configuration.' }
  $arguments = $global:FoundryDeployCalls[0]
  foreach ($expected in @('--subscription', 'sub', 'capacity=100', 'modelName=gpt-6-luna', 'modelVersion=2026-09-22', 'agentName=dividend-history-agent')) {
    if ($expected -notin $arguments) { throw "Missing deployment argument $expected" }
  }
  if ($global:FoundryAgentCalls.Count -ne 2) { throw 'Expected an agent lookup and update.' }
  $registration = $global:FoundryAgentCalls[1]
  $body = $registration.Body | ConvertFrom-Json
  if ($registration.Uri -ne 'https://ai.services.ai.azure.com/api/projects/distribution-research/agents/dividend-history-agent?api-version=v1' -or $registration.Method -ne 'Post') { throw 'Incorrect agent registration route.' }
  if ($body.definition.kind -ne 'prompt' -or $body.definition.model -ne 'gpt-6-luna' -or $body.definition.tools[0].type -ne 'web_search' -or -not $body.definition.text.format.strict -or $body.definition.text.format.name -ne 'dividend_history_result') { throw 'Registration omitted the canonical structured web-search definition.' }
  $instructions = Get-Content (Join-Path $PSScriptRoot '../agents/dividend-history-agent.md') -Raw
  if ($body.definition.instructions -ne $instructions) { throw 'Registration did not load canonical instructions.' }
  $global:FoundryDeployFail = $true
  $failed = $false
  try { & $deployScript -SubscriptionId 'sub' | Out-Null } catch { $failed = $true }
  if (-not $failed) { throw 'Native Azure CLI failure was ignored.' }
  Write-Host 'Foundry deployment offline checks passed: preview, pinned model, quota capacity, explicit subscription and failure handling.'
} finally {
  Remove-Item Function:\global:az
  Remove-Item Function:\global:Invoke-RestMethod
  Remove-Variable -Scope Global -Name FoundryDeployCalls, FoundryDeployFail, FoundryAgentCalls -ErrorAction SilentlyContinue
}
