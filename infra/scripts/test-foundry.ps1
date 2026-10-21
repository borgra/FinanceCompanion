<# Opt-in live capability check. Makes one billable web-search/structured-output call. #>
param(
  [Parameter(Mandatory = $true)][string]$Endpoint,
  [string]$Deployment = 'gpt-6-luna',
  [string]$AgentName = 'dividend-history-agent',
  [ValidatePattern('^[A-Za-z0-9.-]{1,20}$')][string]$Symbol = 'SCHD',
  [datetime]$AsOf = (Get-Date),
  [Parameter(Mandatory = $true)][string]$SubscriptionId
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'foundry-agent-definition.ps1')
Assert-FoundryResponsesEndpoint -Endpoint $Endpoint
$base = $Endpoint.TrimEnd('/')
if (-not $base.EndsWith('/openai/v1')) { $base += '/openai/v1' }
$definition = Get-DividendHistoryAgentDefinition -Deployment $Deployment
$accessToken = & az account get-access-token --subscription $SubscriptionId --resource https://ai.azure.com --query accessToken --output tsv --only-show-errors
if ($LASTEXITCODE -ne 0 -or -not $accessToken) { throw 'Azure token acquisition failed. Sign in with az login.' }
try {
  $headers = @{ Authorization = "Bearer $accessToken" }
  $request = @{
    model = $Deployment; store = $false; max_output_tokens = 12000
    reasoning = $definition.reasoning
    tools = $definition.tools; tool_choice = $definition.tool_choice
    include = @('web_search_call.action.sources')
    metadata = @{ agent_name = $AgentName }
    text = $definition.text
    input = @(
      @{ role = 'system'; content = $definition.instructions }
      @{ role = 'user'; content = (@{
        symbol = $Symbol.ToUpperInvariant(); exchange = $null
        as_of = $AsOf.ToString('yyyy-MM-dd'); history_start = $AsOf.AddMonths(-24).ToString('yyyy-MM-dd')
      } | ConvertTo-Json -Compress) }
    )
  }
  $response = Invoke-RestMethod -Uri "$base/responses" -Headers $headers -ContentType application/json -Method Post -TimeoutSec 120 -Body ($request | ConvertTo-Json -Depth 30)
  $searches = @($response.output | Where-Object { $_.type -eq 'web_search_call' -and $_.status -eq 'completed' })
  $texts = @($response.output | Where-Object type -EQ 'message' | ForEach-Object content | Where-Object type -EQ 'output_text' | ForEach-Object text)
  if ($response.status -ne 'completed' -or $searches.Count -eq 0 -or $texts.Count -ne 1) { throw 'Expected completed web search and one structured output.' }
  $schemaPath = Join-Path $PSScriptRoot '../agents/dividend-history-agent.schema.json'
  if (-not (Test-Json -Json $texts[0] -SchemaFile $schemaPath -ErrorAction Stop)) { throw 'Output did not match the dividend agent schema.' }
  $result = $texts[0] | ConvertFrom-Json
  if ($result.error -or $result.symbol -ne $Symbol -or @($result.dividends).Count -eq 0) { throw 'No reliable dividend history returned for the requested security.' }
  $sourceUrls = @($searches | ForEach-Object action | ForEach-Object sources | ForEach-Object url)
  $citations = @($response.output | Where-Object type -EQ 'message' | ForEach-Object content | ForEach-Object annotations | Where-Object type -EQ 'url_citation' | ForEach-Object url)
  $publicSources = @(@($sourceUrls) + @($citations) | Where-Object { $_ -match '^https://[^/]+/' -and $_ -notmatch '^https://(localhost|127\.|10\.|192\.168\.|\[)' })
  if ($publicSources.Count -eq 0) { throw 'No public HTTPS web-search evidence returned.' }
  foreach ($dividend in $result.dividends) {
    $exDate = [datetime]::ParseExact($dividend.ex_dividend_date, 'yyyy-MM-dd', [cultureinfo]::InvariantCulture)
    if ($exDate -lt $AsOf.Date.AddMonths(-24) -or $dividend.amount -le 0 -or [double]::IsInfinity($dividend.amount) -or [double]::IsNaN($dividend.amount)) { throw 'Invalid date or dividend amount returned.' }
  }
  Write-Output "PASS: $AgentName retrieved $(@($result.dividends).Count) $Symbol dividends with web evidence and strict JSON in one call."
} catch {
  throw "Foundry dividend smoke test failed ($($_.Exception.GetType().Name)). Verify tool support, project access and reliable history availability."
} finally {
  $accessToken = $null
  $headers = $null
}
