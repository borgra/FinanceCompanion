# Shared canonical definitions for registration and opt-in smoke tests.
function Get-FoundryAgentDefinition {
  param(
    [Parameter(Mandatory = $true)][string]$Deployment,
    [ValidateSet('dividend-history', 'stock-details')][string]$AgentKind = 'dividend-history',
    [string]$RaiPolicyId = ''
  )
  # Kinds are an allowlist, independent of deployed names and never arbitrary paths.
  $agentDirectory = Join-Path $PSScriptRoot '../agents'
  $schemaName = if ($AgentKind -eq 'stock-details') { 'stock_details_result' } else { 'dividend_history_result' }
  return @{
    rai_config = @{ rai_policy_name = $RaiPolicyId }
    kind = 'prompt'
    model = $Deployment
    instructions = Get-Content (Join-Path $agentDirectory "$AgentKind-agent.md") -Raw
    tools = @(@{ type = 'web_search' })
    tool_choice = 'required'
    reasoning = @{ effort = 'low' }
    text = @{ format = @{
      type = 'json_schema'; name = $schemaName; strict = $true
      schema = Get-Content (Join-Path $agentDirectory "$AgentKind-agent.schema.json") -Raw | ConvertFrom-Json
    } }
  }
}

function Get-DividendHistoryAgentDefinition {
  param([Parameter(Mandatory = $true)][string]$Deployment)
  return Get-FoundryAgentDefinition -Deployment $Deployment -AgentKind dividend-history
}

function Get-StockDetailsAgentDefinition {
  param([Parameter(Mandatory = $true)][string]$Deployment)
  return Get-FoundryAgentDefinition -Deployment $Deployment -AgentKind stock-details
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

function Assert-FoundryRaiPolicyId {
  param([Parameter(Mandatory = $true)][string]$RaiPolicyId)
  if ($RaiPolicyId -notmatch '^/subscriptions/[0-9a-fA-F-]{36}/resourceGroups/[A-Za-z0-9._()-]+/providers/Microsoft\.CognitiveServices/accounts/[A-Za-z0-9-]+/raiPolicies/[A-Za-z0-9._-]+$') { throw 'RaiPolicyId must be a full account RAI policy ARM resource ID.' }
}

function Assert-FoundryDeploymentSecurity {
  param(
    [Parameter(Mandatory = $true)][string]$SubscriptionId,
    [Parameter(Mandatory = $true)][string]$RaiPolicyId,
    [Parameter(Mandatory = $true)][string]$Deployment,
    [Parameter(Mandatory = $true)][string]$Endpoint
  )
  Assert-FoundryRaiPolicyId $RaiPolicyId
  $accountId = $RaiPolicyId -replace '/raiPolicies/[^/]+$', ''
  $accountName = ($accountId -split '/')[-1]
  if (([Uri]$Endpoint).DnsSafeHost.Split('.')[0] -ne $accountName) { throw 'Policy and project endpoint must belong to the same Foundry account.' }
  $policyJson = & az resource show --ids $RaiPolicyId --api-version 2025-06-01 --subscription $SubscriptionId --output json --only-show-errors
  if ($LASTEXITCODE -ne 0) { throw 'Unable to verify the configured RAI policy exists.' }
  $policy = ($policyJson -join "`n") | ConvertFrom-Json
  if ($policy.id -ine $RaiPolicyId -or $policy.properties.mode -cne 'Blocking' -or $policy.properties.basePolicyName -cne 'Microsoft.DefaultV2') { throw 'Configured RAI policy is missing or is not blocking.' }
  foreach ($category in @('Hate', 'Sexual', 'Violence', 'Selfharm')) {
    foreach ($source in @('Prompt', 'Completion')) {
      $filters = @($policy.properties.contentFilters | Where-Object { $_.name -ceq $category -and $_.source -ceq $source })
      if ($filters.Count -ne 1 -or $filters[0].enabled -ne $true -or $filters[0].blocking -ne $true -or $filters[0].severityThreshold -notin @('Low', 'Medium')) { throw 'RAI policy must preserve blocking baseline content categories.' }
    }
  }
  foreach ($filterName in @('Jailbreak', 'Indirect Attack')) {
    $filters = @($policy.properties.contentFilters | Where-Object { $_.name -eq $filterName -and $_.source -eq 'Prompt' })
    if ($filters.Count -ne 1 -or $filters[0].enabled -ne $true -or $filters[0].blocking -ne $true) { throw "RAI policy must enable blocking $filterName detection." }
  }
  $deploymentJson = & az resource show --ids "$accountId/deployments/$Deployment" --api-version 2025-06-01 --subscription $SubscriptionId --query properties --output json --only-show-errors
  if ($LASTEXITCODE -ne 0) { throw 'Unable to verify the model deployment policy attachment.' }
  $properties = ($deploymentJson -join "`n") | ConvertFrom-Json
  if ($properties.model.name -ne 'gpt-6-luna' -or $properties.model.format -ne 'OpenAI') { throw 'The deployment must serve the OpenAI gpt-6-luna model.' }
  $policyName = ($RaiPolicyId -split '/')[-1]
  if ($properties.raiPolicyName -cne $policyName) { throw 'The model deployment must attach the configured RAI policy.' }
  return $properties
}

function ConvertTo-CanonicalAgentValue {
  param($Value)
  if ($null -eq $Value) { return $null }
  if ($Value -is [string]) { return [string]$Value }
  if ($Value -is [System.ValueType]) { return $Value }
  if ($Value -is [System.Collections.IDictionary]) {
    $result = [ordered]@{}
    foreach ($key in @($Value.Keys | Sort-Object)) { $result[$key] = ConvertTo-CanonicalAgentValue $Value[$key] }
    return $result
  }
  if ($Value -is [pscustomobject]) {
    $result = [ordered]@{}
    foreach ($property in @($Value.PSObject.Properties | Sort-Object Name)) { $result[$property.Name] = ConvertTo-CanonicalAgentValue $property.Value }
    return $result
  }
  if ($Value -is [System.Collections.IEnumerable] -and $Value -isnot [string]) {
    $items = @($Value | ForEach-Object { ConvertTo-CanonicalAgentValue $_ })
    return ,$items
  }
  return $Value
}

function Assert-FoundryAgentVersion {
  param($Version, [string]$AgentName, [string]$AgentVersion, $Definition)
  if ($Version.name -ne $AgentName -or $Version.version -cne $AgentVersion -or $AgentVersion -notmatch '^[1-9][0-9]{0,18}$') { throw 'Expected the explicitly approved immutable agent version.' }
  $actualDefinition = ConvertTo-CanonicalAgentValue $Version.definition
  $expectedDefinition = ConvertTo-CanonicalAgentValue $Definition
  if ($actualDefinition.instructions -isnot [string]) { throw 'Approved agent instructions are missing.' }
  $actualDefinition.instructions = $actualDefinition.instructions.Replace("`r`n", "`n").Trim()
  $expectedDefinition.instructions = $expectedDefinition.instructions.Replace("`r`n", "`n").Trim()
  $actual = $actualDefinition | ConvertTo-Json -Depth 50 -Compress
  $expected = $expectedDefinition | ConvertTo-Json -Depth 50 -Compress
  if ($actual -cne $expected) { throw 'Approved agent version does not match the canonical definition and RAI policy.' }
}
