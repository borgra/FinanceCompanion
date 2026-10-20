<# Opt-in live capability check. Makes two billable model calls; never prints tokens. #>
param(
  [Parameter(Mandatory = $true)][string]$Endpoint,
  [string]$Deployment = 'gpt-6-luna',
  [Parameter(Mandatory = $true)][string]$SubscriptionId
)
$ErrorActionPreference = 'Stop'
$parsedEndpoint = $null
if (-not [Uri]::TryCreate($Endpoint, [UriKind]::Absolute, [ref]$parsedEndpoint) -or $parsedEndpoint.Scheme -ne 'https' -or $parsedEndpoint.Port -ne 443 -or $parsedEndpoint.UserInfo -or $parsedEndpoint.Query -or $parsedEndpoint.Fragment -or ($parsedEndpoint.Host -notlike '*.services.ai.azure.com' -and $parsedEndpoint.Host -notlike '*.openai.azure.com') -or $parsedEndpoint.AbsolutePath.TrimEnd('/') -notmatch '^(?:/api/projects/[A-Za-z0-9._-]+)?(?:/openai/v1)?$') {
  throw 'Use the Azure HTTPS project/resource endpoint returned by the Foundry deployment.'
}
$base = $Endpoint.TrimEnd('/')
if (-not $base.EndsWith('/openai/v1')) { $base += '/openai/v1' }
$accessToken = & az account get-access-token --subscription $SubscriptionId --resource https://ai.azure.com --query accessToken --output tsv --only-show-errors
if ($LASTEXITCODE -ne 0 -or -not $accessToken) { throw 'Azure token acquisition failed. Sign in with az login.' }
try {
  $headers = @{ Authorization = "Bearer $accessToken" }
  $search = Invoke-RestMethod -Uri "$base/responses" -Headers $headers -ContentType application/json -Method Post -TimeoutSec 90 -Body (@{
    model = $Deployment; store = $false; max_output_tokens = 4096
    reasoning = @{ effort = 'low' }
    tools = @(@{ type = 'web_search' }); tool_choice = 'required'; max_tool_calls = 2
    include = @('web_search_call.action.sources')
    input = 'Find the official JPMorgan issuer page for JEPQ. Return its title with a web citation. Do not give investment advice.'
  } | ConvertTo-Json -Depth 15)
  $searches = @($search.output | Where-Object { $_.type -eq 'web_search_call' -and $_.status -eq 'completed' })
  $citations = @($search.output | Where-Object type -EQ 'message' | ForEach-Object content | ForEach-Object annotations | Where-Object type -EQ 'url_citation')
  $sourceUrls = @($searches | ForEach-Object action | ForEach-Object sources | ForEach-Object url)
  if ($search.status -ne 'completed' -or $searches.Count -eq 0 -or @($citations | Where-Object { $_.url -in $sourceUrls }).Count -eq 0) { throw 'The model did not return completed web search with a matching source citation.' }
  Write-Output 'PASS: web_search completed with cited public sources.'
  $extraction = Invoke-RestMethod -Uri "$base/responses" -Headers $headers -ContentType application/json -Method Post -TimeoutSec 60 -Body (@{
    model = $Deployment; store = $false; max_output_tokens = 2048
    reasoning = @{ effort = 'low' }
    input = 'Return status ready in the required JSON schema.'
    text = @{ format = @{ type = 'json_schema'; name = 'readiness'; strict = $true; schema = @{
      type = 'object'; properties = @{ status = @{ type = 'string'; enum = @('ready') } }
      required = @('status'); additionalProperties = $false
    } } }
  } | ConvertTo-Json -Depth 15)
  $text = @($extraction.output | Where-Object type -EQ 'message' | ForEach-Object content | Where-Object type -EQ 'output_text' | ForEach-Object text)
  if ($extraction.status -ne 'completed' -or $text.Count -ne 1 -or ($text[0] | ConvertFrom-Json).status -ne 'ready') { throw 'Structured-output extraction did not return the expected result.' }
  Write-Output 'PASS: strict structured output completed with the same deployment and Entra identity.'
} catch {
  $detail = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
  $detail = $detail.Replace($accessToken, '[redacted]')
  throw "Foundry readiness failed: $($detail.Substring(0, [Math]::Min(800, $detail.Length)))"
} finally {
  $accessToken = $null
  $headers = $null
}
