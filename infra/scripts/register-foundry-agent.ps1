<# Register the version-controlled prompt agent without deploying ARM resources. #>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Mandatory = $true)][string]$Endpoint,
  [Parameter(Mandatory = $true)][string]$SubscriptionId,
  [string]$Deployment = 'gpt-6-luna',
  [ValidatePattern('^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$')]
  [string]$AgentName = 'dividend-history-agent'
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'foundry-agent-definition.ps1')
Assert-FoundryProjectEndpoint -Endpoint $Endpoint
$definition = Get-DividendHistoryAgentDefinition -Deployment $Deployment
if (-not $PSCmdlet.ShouldProcess("$Endpoint / $AgentName", 'Create or update Foundry prompt agent')) { return }
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
  $body = @{ definition = $definition; description = 'Cited dividend history with strict structured output.' }
  if (-not $exists) {
    $agentUri = "$($Endpoint.TrimEnd('/'))/agents?api-version=v1"
    $body.name = $AgentName
  }
  # The v1 prompt-agent API supports web_search and text.format. The legacy
  # 2025-05-01 assistants API in the draft guide does not offer this contract.
  $agent = Invoke-RestMethod -Uri $agentUri -Headers $headers -Method Post -ContentType application/json -TimeoutSec 90 -Body ($body | ConvertTo-Json -Depth 30)
  Write-Host "Foundry agent registered: $AgentName"
  return $agent
} catch {
  # Avoid echoing response bodies/headers that may contain sensitive material.
  throw "Foundry agent registration failed ($($_.Exception.GetType().Name)). Verify project access and prompt-agent/tool support."
} finally {
  $accessToken = $null
  $headers = $null
}
