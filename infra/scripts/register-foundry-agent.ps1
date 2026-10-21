<# Register the version-controlled prompt agent without deploying ARM resources. #>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Mandatory = $true)][string]$Endpoint,
  [Parameter(Mandatory = $true)][string]$SubscriptionId,
  [string]$Deployment = 'gpt-6-luna',
  [ValidatePattern('^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$')]
  [string]$AgentName = '',
  [ValidateSet('dividend-history', 'stock-details')][string]$AgentKind = 'dividend-history',
  [Parameter(Mandatory = $true)][string]$RaiPolicyId
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'foundry-agent-definition.ps1')
$Endpoint = $Endpoint.TrimEnd('/') -replace '/openai/v1$', ''
Assert-FoundryProjectEndpoint -Endpoint $Endpoint
Assert-FoundryRaiPolicyId $RaiPolicyId
if (-not $AgentName) { $AgentName = "$AgentKind-agent" }
$definition = Get-FoundryAgentDefinition -Deployment $Deployment -AgentKind $AgentKind -RaiPolicyId $RaiPolicyId
if (-not $PSCmdlet.ShouldProcess("$Endpoint / $AgentName", 'Create or update Foundry prompt agent')) { return }
$null = Assert-FoundryDeploymentSecurity -SubscriptionId $SubscriptionId -RaiPolicyId $RaiPolicyId -Deployment $Deployment -Endpoint $Endpoint
$accessToken = & az account get-access-token --subscription $SubscriptionId --resource https://ai.azure.com --query accessToken --output tsv --only-show-errors
if ($LASTEXITCODE -ne 0 -or -not $accessToken) { throw 'Azure token acquisition failed. Sign in with az login.' }
try {
  $headers = @{ Authorization = "Bearer $accessToken" }
  $agentUri = "$($Endpoint.TrimEnd('/'))/agents/$AgentName`?api-version=v1"
  $exists = $true
  try {
    $null = Invoke-RestMethod -Uri $agentUri -Headers $headers -Method Get -TimeoutSec 60
  } catch {
    if ($_.Exception.Response.StatusCode -eq 404) { $exists = $false } else { throw }
  }
  $body = @{ definition = $definition; description = "Cited $AgentKind research with strict structured output." }
  if (-not $exists) {
    $agentUri = "$($Endpoint.TrimEnd('/'))/agents?api-version=v1"
    $body.name = $AgentName
  }
  # The v1 prompt-agent API supports web_search and text.format. The legacy
  # 2025-05-01 assistants API in the draft guide does not offer this contract.
  $agent = Invoke-RestMethod -Uri $agentUri -Headers $headers -Method Post -ContentType application/json -TimeoutSec 90 -Body ($body | ConvertTo-Json -Depth 30)
  if ($agent.version -notmatch '^[1-9][0-9]*$') { throw 'Registration did not return an immutable version identifier.' }
  Assert-FoundryAgentVersion -Version $agent -AgentName $AgentName -AgentVersion $agent.version -Definition $definition
  Write-Host "Foundry agent registered: $AgentName version $($agent.version). Review and smoke test this version before setting the runtime approved-version variable."
  return $agent
} catch {
  # Avoid echoing response bodies/headers that may contain sensitive material.
  throw "Foundry agent registration failed ($($_.Exception.GetType().Name)). Verify project access and prompt-agent/tool support."
} finally {
  $accessToken = $null
  $headers = $null
}
