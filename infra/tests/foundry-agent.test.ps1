# Offline data-plane tests: every Azure and HTTP operation is replaced.
$ErrorActionPreference = 'Stop'
$registerScript = Join-Path $PSScriptRoot '../scripts/register-foundry-agent.ps1'
$smokeScript = Join-Path $PSScriptRoot '../scripts/test-foundry.ps1'
$global:AgentHttpCalls = [System.Collections.Generic.List[object]]::new()
$global:AgentAzureCalls = [System.Collections.Generic.List[object]]::new()
$global:AgentLookupStatus = 404
$global:AgentTokenFails = $false
$global:AgentSmokeResponse = @{
  status = 'completed'
  output = @(
    @{ type = 'web_search_call'; status = 'completed'; action = @{ sources = @(@{ url = 'https://example.com/dividends' }) } }
    @{ type = 'message'; content = @(@{
      type = 'output_text'; annotations = @()
      text = (@{
        symbol = 'SCHD'; name = 'Schwab US Dividend Equity ETF'; exchange = 'NYSE ARCA'
        asset_type = 'ETF'; currency = 'USD'; source_url = 'https://example.com/dividends'; error = $null
        dividends = @(@{
          ex_dividend_date = '2026-09-23'; amount = 0.2899; declaration_date = $null
          record_date = '2026-09-23'; payment_date = '2026-09-28'; status = 'completed'; is_special = $false
        })
      } | ConvertTo-Json -Depth 10)
    }) }
  )
}
function global:az {
  $global:AgentAzureCalls.Add(@($args))
  $global:LASTEXITCODE = if ($global:AgentTokenFails) { 1 } else { 0 }
  if (-not $global:AgentTokenFails) { return 'offline-secret-token' }
}
function global:Invoke-RestMethod {
  param($Uri, $Headers, $Method, $ContentType, $TimeoutSec, $Body)
  $global:AgentHttpCalls.Add(@{ Uri = $Uri; Method = $Method; Body = $Body })
  if ($Method -eq 'Get' -and $global:AgentLookupStatus -ne 200) {
    $response = [System.Net.Http.HttpResponseMessage]::new([System.Net.HttpStatusCode]$global:AgentLookupStatus)
    throw [Microsoft.PowerShell.Commands.HttpResponseException]::new('offline failure', $response)
  }
  if ($Uri.EndsWith('/responses')) { return $global:AgentSmokeResponse }
  return @{ name = 'dividend-history-agent' }
}
function Assert-ExpectedFailure {
  param([scriptblock]$Action)
  $failed = $false
  try { & $Action | Out-Null } catch {
    $failed = $true
    if ($_.ToString().Contains('offline-secret-token')) { throw 'Error leaked the Azure access token.' }
  }
  if (-not $failed) { throw 'Expected operation to fail.' }
}
$options = @{ Endpoint = 'https://ai.services.ai.azure.com/api/projects/research'; SubscriptionId = 'sub' }
try {
  & $registerScript @options -WhatIf | Out-Null
  if ($global:AgentAzureCalls.Count -or $global:AgentHttpCalls.Count) { throw 'Registration WhatIf contacted Azure.' }
  Assert-ExpectedFailure { & $registerScript -Endpoint 'https://untrusted.example/api/projects/research' -SubscriptionId sub }
  if ($global:AgentAzureCalls.Count -or $global:AgentHttpCalls.Count) { throw 'Invalid endpoint contacted Azure.' }
  & $registerScript @options -AgentName 'custom-agent' | Out-Null
  $created = $global:AgentHttpCalls[1]
  $body = $created.Body | ConvertFrom-Json
  if ($created.Uri -ne 'https://ai.services.ai.azure.com/api/projects/research/agents?api-version=v1' -or $body.name -ne 'custom-agent') { throw 'Missing-agent lookup did not create the named agent.' }
  if ($body.definition.text.format.schema.properties.dividends.items.properties.amount.type -ne 'number') { throw 'Registration schema diverged from the canonical contract.' }
  $global:AgentHttpCalls.Clear()
  $global:AgentLookupStatus = 403
  Assert-ExpectedFailure { & $registerScript @options }
  if ($global:AgentHttpCalls.Count -ne 1 -or $global:AgentHttpCalls[0].Method -ne 'Get') { throw 'Unauthorized lookup attempted registration.' }
  $global:AgentHttpCalls.Clear()
  $global:AgentTokenFails = $true
  Assert-ExpectedFailure { & $registerScript @options }
  if ($global:AgentHttpCalls.Count) { throw 'Token acquisition failure sent an HTTP request.' }
  $global:AgentTokenFails = $false
  $global:AgentLookupStatus = 200
  & $smokeScript @options -AsOf '2026-10-20' | Out-Null
  if ($global:AgentHttpCalls.Count -ne 1) { throw 'Smoke test did not use exactly one model call.' }
  $request = $global:AgentHttpCalls[0].Body | ConvertFrom-Json
  $input = $request.input[1].content | ConvertFrom-Json
  if ($request.text.format.name -ne 'dividend_history_result' -or $request.tools[0].type -ne 'web_search' -or $request.tool_choice -ne 'required' -or $input.as_of -ne '2026-10-20' -or $input.history_start -ne '2024-10-20') { throw 'Smoke test did not use the same single-pass contract as runtime.' }
  $global:AgentHttpCalls.Clear()
  & $smokeScript -Endpoint 'https://ai.openai.azure.com/openai/v1' -SubscriptionId 'sub' -AsOf '2026-10-20' | Out-Null
  if ($global:AgentHttpCalls.Count -ne 1 -or $global:AgentHttpCalls[0].Uri -ne 'https://ai.openai.azure.com/openai/v1/responses') { throw 'Resource endpoint smoke test lost Responses URL compatibility.' }
  $global:AgentSmokeResponse.status = 'incomplete'
  Assert-ExpectedFailure { & $smokeScript @options -AsOf '2026-10-20' }
  Write-Host 'Foundry agent offline checks passed: preview, endpoint guard, create/update, auth failure, strict schema and single-pass smoke contract.'
} finally {
  Remove-Item Function:\global:az
  Remove-Item Function:\global:Invoke-RestMethod
  Remove-Variable -Scope Global -Name AgentHttpCalls, AgentAzureCalls, AgentLookupStatus, AgentTokenFails, AgentSmokeResponse -ErrorAction SilentlyContinue
}
