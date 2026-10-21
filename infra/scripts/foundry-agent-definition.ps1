# Shared by registration and the opt-in single-pass smoke test.
function Get-DividendHistoryAgentDefinition {
  param([Parameter(Mandatory = $true)][string]$Deployment)
  $agentDirectory = Join-Path $PSScriptRoot '../agents'
  return @{
    kind = 'prompt'
    model = $Deployment
    instructions = Get-Content (Join-Path $agentDirectory 'dividend-history-agent.md') -Raw
    tools = @(@{ type = 'web_search' })
    tool_choice = 'required'
    reasoning = @{ effort = 'low' }
    text = @{ format = @{
      type = 'json_schema'; name = 'dividend_history_result'; strict = $true
      schema = Get-Content (Join-Path $agentDirectory 'dividend-history-agent.schema.json') -Raw | ConvertFrom-Json
    } }
  }
}

function Assert-FoundryProjectEndpoint {
  param([Parameter(Mandatory = $true)][string]$Endpoint)
  $parsedEndpoint = $null
  if (-not [Uri]::TryCreate($Endpoint, [UriKind]::Absolute, [ref]$parsedEndpoint) -or
      $parsedEndpoint.Scheme -ne 'https' -or $parsedEndpoint.Port -ne 443 -or
      $parsedEndpoint.UserInfo -or $parsedEndpoint.Query -or $parsedEndpoint.Fragment -or
      $parsedEndpoint.Host -notlike '*.services.ai.azure.com' -or
      $parsedEndpoint.AbsolutePath.TrimEnd('/') -notmatch '^/api/projects/[A-Za-z0-9._-]+$') {
    throw 'Use the Azure HTTPS Foundry project endpoint returned by the deployment.'
  }
}

function Assert-FoundryResponsesEndpoint {
  param([Parameter(Mandatory = $true)][string]$Endpoint)
  $parsedEndpoint = $null
  if (-not [Uri]::TryCreate($Endpoint, [UriKind]::Absolute, [ref]$parsedEndpoint) -or
      $parsedEndpoint.Scheme -ne 'https' -or $parsedEndpoint.Port -ne 443 -or
      $parsedEndpoint.UserInfo -or $parsedEndpoint.Query -or $parsedEndpoint.Fragment -or
      ($parsedEndpoint.Host -notlike '*.services.ai.azure.com' -and $parsedEndpoint.Host -notlike '*.openai.azure.com') -or
      $parsedEndpoint.AbsolutePath.TrimEnd('/') -notmatch '^(?:/api/projects/[A-Za-z0-9._-]+)?(?:/openai/v1)?$') {
    throw 'Use an Azure HTTPS Foundry project or OpenAI resource endpoint.'
  }
}
