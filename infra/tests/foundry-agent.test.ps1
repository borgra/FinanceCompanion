# Offline policy, registration, pinned-version and smoke tests. No network calls.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../scripts/foundry-agent-definition.ps1')
$registerScript = Join-Path $PSScriptRoot '../scripts/register-foundry-agent.ps1'
$smokeScript = Join-Path $PSScriptRoot '../scripts/test-foundry.ps1'
$global:AgentHttpCalls = [System.Collections.Generic.List[object]]::new()
$global:AgentAzureCalls = [System.Collections.Generic.List[object]]::new()
$global:AgentPolicyId = '/subscriptions/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/resourceGroups/rg/providers/Microsoft.CognitiveServices/accounts/ai/raiPolicies/research-injection-blocking-v1'
$global:AgentModelName = 'gpt-6-luna'
$global:AgentAttachedPolicy = 'research-injection-blocking-v1'
$global:AgentPolicyBlocking = $true
$global:AgentLookupStatus = 404
$global:AgentTokenFails = $false
$global:AgentGuardrailDrift = $false
$global:AgentExpectedDeployment = 'gpt-6-luna'
$global:AgentVersionValue = '7'
$global:AgentProbeMode = ''
$global:AgentPolicy = @{
  id = $global:AgentPolicyId
  properties = @{ mode = 'Blocking'; basePolicyName = 'Microsoft.DefaultV2'; contentFilters = @(
    @{ name = 'Jailbreak'; source = 'Prompt'; enabled = $true; blocking = $true }
    @{ name = 'Indirect Attack'; source = 'Prompt'; enabled = $true; blocking = $true }
  ) }
}
foreach ($category in @('Hate', 'Sexual', 'Violence', 'Selfharm')) {
  foreach ($source in @('Prompt', 'Completion')) {
    $global:AgentPolicy.properties.contentFilters += @{ name = $category; source = $source; enabled = $true; blocking = $true; severityThreshold = 'Medium' }
  }
}
function global:az {
  $global:AgentAzureCalls.Add(@($args))
  $global:LASTEXITCODE = if ($global:AgentTokenFails) { 1 } else { 0 }
  if ($global:AgentTokenFails) { return }
  if (($args[0..1] -join ' ') -eq 'account get-access-token') { return 'offline-secret-token' }
  if (($args[0..1] -join ' ') -ne 'resource show') { throw 'Unexpected Azure operation.' }
  $resourceId = $args[[Array]::IndexOf($args, '--ids') + 1]
  if ($resourceId -match '/raiPolicies/') {
    $global:AgentPolicy.properties.contentFilters[1].blocking = $global:AgentPolicyBlocking
    return $global:AgentPolicy | ConvertTo-Json -Depth 10
  }
  return (@{ model = @{ name = $global:AgentModelName; format = 'OpenAI'; version = '2026-09-22' }; raiPolicyName = $global:AgentAttachedPolicy } | ConvertTo-Json)
}
function Throw-OfflineHttpError {
  param([int]$Status, [string]$Body = '')
  $response = [System.Net.Http.HttpResponseMessage]::new([System.Net.HttpStatusCode]$Status)
  $errorRecord = [System.Management.Automation.ErrorRecord]::new([Microsoft.PowerShell.Commands.HttpResponseException]::new('offline failure', $response), 'OfflineHttp', [System.Management.Automation.ErrorCategory]::InvalidOperation, $null)
  if ($Body) { $errorRecord.ErrorDetails = [System.Management.Automation.ErrorDetails]::new($Body) }
  throw $errorRecord
}
function global:Invoke-RestMethod {
  param($Uri, $Headers, $Method, $ContentType, $TimeoutSec, $Body)
  $global:AgentHttpCalls.Add(@{ Uri = $Uri; Method = $Method; Body = $Body })
  if ($Uri.EndsWith('/responses')) {
    if ($global:AgentProbeMode -eq 'blocked') { Throw-OfflineHttpError 400 '{"error":{"code":"content_filter","innererror":{"content_filter_result":{"jailbreak":{"filtered":true}}}}}' }
    if ($global:AgentProbeMode -eq 'unrelated400') { Throw-OfflineHttpError 400 '{"error":{"code":"invalid_request"}}' }
    return $global:AgentSmokeResponse
  }
  if ($Method -eq 'Get' -and $global:AgentLookupStatus -ne 200) { Throw-OfflineHttpError $global:AgentLookupStatus }
  if ($Method -eq 'Get' -and $Uri -match '/agents/([^/?]+)/versions/([0-9]+)') {
    $name = $Matches[1]
    $kind = if ($name -like '*stock*') { 'stock-details' } else { 'dividend-history' }
    $definition = Get-FoundryAgentDefinition -Deployment $global:AgentExpectedDeployment -AgentKind $kind -RaiPolicyId $global:AgentPolicyId
    if ($global:AgentGuardrailDrift) { $definition.rai_config.rai_policy_name += '-other' }
    return @{ name = $name; version = $global:AgentVersionValue; definition = $definition }
  }
  if ($Method -eq 'Post') {
    $bodyObject = $Body | ConvertFrom-Json
    $name = if ($bodyObject.name) { $bodyObject.name } else { ([Uri]$Uri).AbsolutePath.Split('/')[-1] }
    return @{ name = $name; version = '7'; definition = $bodyObject.definition }
  }
  return @{ name = 'existing-agent' }
}
function Assert-ExpectedFailure {
  param([scriptblock]$Action)
  $failed = $false
  try { & $Action | Out-Null } catch {
    $failed = $true
    if ($_.ToString().Contains('offline-secret-token')) { throw 'Error leaked the Azure token.' }
  }
  if (-not $failed) { throw 'Expected operation to fail.' }
}
function Reset-AgentCalls { $global:AgentHttpCalls.Clear(); $global:AgentAzureCalls.Clear() }
function Set-SmokeResult {
  param($Result)
  $global:AgentSmokeResponse = @{
    status = 'completed'; output = @(
      @{ type = 'web_search_call'; status = 'completed'; action = @{ sources = @(@{ url = 'https://example.com/research' }) } }
      @{ type = 'message'; content = @(@{ type = 'output_text'; annotations = @(); text = ($Result | ConvertTo-Json -Depth 20) }) }
    )
  }
}
$options = @{ Endpoint = 'https://ai.services.ai.azure.com/api/projects/research'; SubscriptionId = 'sub'; RaiPolicyId = $global:AgentPolicyId }
$smokeOptions = @{ AgentVersion = '7'; AsOf = '2026-10-20' }
try {
  foreach ($kind in @('dividend-history', 'stock-details')) {
    Reset-AgentCalls
    & $registerScript @options -AgentKind $kind -WhatIf | Out-Null
    & $smokeScript @options @smokeOptions -AgentKind $kind -WhatIf | Out-Null
    if ($global:AgentHttpCalls.Count -or $global:AgentAzureCalls.Count) { throw 'WhatIf contacted Azure.' }
    & $registerScript @options -AgentKind $kind -AgentName "custom-$kind" | Out-Null
    $body = $global:AgentHttpCalls[1].Body | ConvertFrom-Json
    $schemaName = if ($kind -eq 'stock-details') { 'stock_details_result' } else { 'dividend_history_result' }
    if ($body.name -ne "custom-$kind" -or $body.definition.text.format.name -ne $schemaName -or $body.definition.rai_config.rai_policy_name -cne $global:AgentPolicyId) { throw 'Kind, name or policy binding diverged.' }
  }
  Reset-AgentCalls
  $global:AgentLookupStatus = 200
  & $registerScript @options -AgentKind stock-details | Out-Null
  & $registerScript @options -AgentKind stock-details | Out-Null
  if ($global:AgentHttpCalls.Count -ne 4) { throw 'Repeated registration lost lookup/upsert behavior.' }
  foreach ($call in $global:AgentHttpCalls) { if ($call.Uri -notlike '*/agents/stock-details-agent?api-version=v1') { throw 'Stock registration overwrote another agent.' } }
  foreach ($case in @('policy', 'baseline', 'base-policy', 'deployment', 'model')) {
    Reset-AgentCalls
    if ($case -eq 'policy') { $global:AgentPolicyBlocking = $false }
    if ($case -eq 'baseline') { $global:AgentPolicy.properties.contentFilters[2].severityThreshold = 'High' }
    if ($case -eq 'base-policy') { $global:AgentPolicy.properties.basePolicyName = 'Microsoft.Default' }
    if ($case -eq 'deployment') { $global:AgentAttachedPolicy = 'wrong-policy' }
    if ($case -eq 'model') { $global:AgentModelName = 'wrong-model' }
    Assert-ExpectedFailure { & $registerScript @options }
    if ($global:AgentHttpCalls.Count) { throw 'Unsafe policy/model caused agent mutation.' }
    $global:AgentPolicy.properties.contentFilters[2].severityThreshold = 'Medium'; $global:AgentPolicy.properties.basePolicyName = 'Microsoft.DefaultV2'
    $global:AgentPolicyBlocking = $true; $global:AgentAttachedPolicy = 'research-injection-blocking-v1'; $global:AgentModelName = 'gpt-6-luna'
  }
  Reset-AgentCalls
  Assert-ExpectedFailure { & $registerScript -Endpoint 'https://ai.openai.azure.com' -SubscriptionId sub -RaiPolicyId $global:AgentPolicyId }
  if ($global:AgentAzureCalls.Count) { throw 'Resource-only endpoint reached Azure.' }
  $global:AgentLookupStatus = 403
  Assert-ExpectedFailure { & $registerScript @options }
  if ($global:AgentHttpCalls.Count -ne 1) { throw 'Unauthorized agent lookup attempted an update.' }
  Reset-AgentCalls
  $global:AgentTokenFails = $true
  Assert-ExpectedFailure { & $registerScript @options }
  if ($global:AgentHttpCalls.Count) { throw 'Auth failure caused HTTP calls.' }
  $global:AgentTokenFails = $false; $global:AgentLookupStatus = 200
  $dividendResult = @{
    symbol = 'SCHD'; name = 'Schwab US Dividend Equity ETF'; exchange = 'NYSE ARCA'; asset_type = 'ETF'; currency = 'USD'; source_url = 'https://example.com/research'; error = $null
    dividends = @(@{ ex_dividend_date = '2026-09-23'; amount = 0.2899; declaration_date = $null; record_date = '2026-09-23'; payment_date = '2026-09-28'; status = 'completed'; is_special = $false; source_url = 'https://example.com/research'; distribution_type = 'income'; share_basis = 'current_share_basis' })
  }
  $stockResult = @{
    schema_version = 1; symbol = 'SCHD'; name = 'Schwab US Dividend Equity ETF'; exchange = 'NYSE ARCA'; asset_type = 'ETF'; currency = 'USD'; status = 'partial'; price = 100.25; price_kind = 'close'
    sector = $null; industry = $null; pe_ratio = $null; thirty_day_yield = $null; fifty_two_week_low = $null; fifty_two_week_high = $null; sma20 = $null; sma50 = $null; sma200 = $null; warnings = @('Optional metrics unavailable.'); error = $null
    sources = @(@{ id = 's1'; url = 'https://example.com/research'; title = 'Synthetic fixture' })
    field_evidence = @(@{ field = 'identity'; source_ids = @('s1'); as_of = '2026-10-20' }, @{ field = 'price'; source_ids = @('s1'); as_of = '2026-10-20' })
  }
  foreach ($kind in @('dividend-history', 'stock-details')) {
    Set-SmokeResult $(if ($kind -eq 'stock-details') { $stockResult } else { $dividendResult })
    Reset-AgentCalls
    & $smokeScript @options @smokeOptions -AgentKind $kind | Out-Null
    if ($global:AgentHttpCalls.Count -ne 2 -or $global:AgentAzureCalls.Count -ne 3) { throw 'Smoke must verify policy/model/version before one inference call.' }
    $request = $global:AgentHttpCalls[1].Body | ConvertFrom-Json
    if ($request.agent_reference.name -ne "$kind-agent" -or $request.agent_reference.version -cne '7' -or $request.model -or $request.instructions -or $request.tools -or $request.text -or $request.reasoning) { throw 'Smoke invocation bypassed the approved agent version.' }
    Reset-AgentCalls
    & $smokeScript @options @smokeOptions -AgentKind $kind -VerifyConfigurationOnly | Out-Null
    if (@($global:AgentHttpCalls | Where-Object Method -EQ Post).Count) { throw 'Configuration check made a paid request.' }
    Reset-AgentCalls
    $global:AgentGuardrailDrift = $true
    Assert-ExpectedFailure { & $smokeScript @options @smokeOptions -AgentKind $kind }
    if (@($global:AgentHttpCalls | Where-Object Method -EQ Post).Count) { throw 'Changed policy binding triggered inference.' }
    $global:AgentGuardrailDrift = $false
    $global:AgentVersionValue = '8'
    Assert-ExpectedFailure { & $smokeScript @options @smokeOptions -AgentKind $kind }
    $global:AgentVersionValue = '7'
    $global:AgentProbeMode = 'blocked'
    & $smokeScript @options @smokeOptions -AgentKind $kind -VerifyInjectionBlocking | Out-Null
    $global:AgentProbeMode = 'unrelated400'
    Assert-ExpectedFailure { & $smokeScript @options @smokeOptions -AgentKind $kind -VerifyInjectionBlocking }
    $global:AgentProbeMode = ''
    Assert-ExpectedFailure { & $smokeScript @options @smokeOptions -AgentKind $kind -VerifyInjectionBlocking }
    Set-SmokeResult $(if ($kind -eq 'stock-details') { $stockResult } else { $dividendResult })
    $global:AgentSmokeResponse.output[0].action.sources = @()
    $global:AgentSmokeResponse.output[1].content[0].annotations = @(@{ type = 'url_citation'; url = 'https://example.com/research' })
    Assert-ExpectedFailure { & $smokeScript @options @smokeOptions -AgentKind $kind }
    Set-SmokeResult $(if ($kind -eq 'stock-details') { $stockResult } else { $dividendResult })
    $global:AgentSmokeResponse.output += @{ type = 'function_call'; name = 'unexpected' }
    Assert-ExpectedFailure { & $smokeScript @options @smokeOptions -AgentKind $kind }
    Set-SmokeResult $(if ($kind -eq 'stock-details') { $stockResult } else { $dividendResult })
    $global:AgentSmokeResponse.output[1].content = @(@{ type = 'refusal'; refusal = 'Cannot complete.' })
    Assert-ExpectedFailure { & $smokeScript @options @smokeOptions -AgentKind $kind }

  }
  $dividendResult.dividends[0].source_url = 'https://example.com/forged'
  Set-SmokeResult $dividendResult
  $global:AgentSmokeResponse.output[1].content[0].annotations = @(@{ type = 'url_citation'; url = 'https://example.com/forged' })
  Assert-ExpectedFailure { & $smokeScript @options @smokeOptions -AgentKind dividend-history }
  $dividendResult.dividends[0].source_url = 'https://example.com/research'
  $dividendResult.source_url = 'https://example.com/forged'
  Set-SmokeResult $dividendResult
  Assert-ExpectedFailure { & $smokeScript @options @smokeOptions -AgentKind dividend-history }
  Set-SmokeResult $stockResult
  $stockResult.sources[0].url = 'https://example.com/forged'
  Set-SmokeResult $stockResult
  Assert-ExpectedFailure { & $smokeScript @options @smokeOptions -AgentKind stock-details }
  $stockResult.sources[0].url = 'https://example.com/research'; $stockResult.field_evidence[1].as_of = '2026-10-01'
  Set-SmokeResult $stockResult
  Assert-ExpectedFailure { & $smokeScript @options @smokeOptions -AgentKind stock-details }
  $global:AgentSmokeResponse.status = 'incomplete'
  Assert-ExpectedFailure { & $smokeScript @options @smokeOptions -AgentKind stock-details }
  Write-Host 'Foundry agent offline checks passed: both kinds, blocking policy, deployment/model attachment, pinned versions, safe invocation, adversarial filtering, schema/evidence and no-network WhatIf.'
} finally {
  Remove-Item Function:\global:az
  Remove-Item Function:\global:Invoke-RestMethod
  Get-Variable -Scope Global -Name 'Agent*' | Remove-Variable -Scope Global -ErrorAction SilentlyContinue
}
