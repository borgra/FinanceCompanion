# Offline regression checks. Every az call is replaced; no Azure operation runs.
$ErrorActionPreference = 'Stop'
$accessScript = Join-Path $PSScriptRoot '../scripts/configure-foundry-access.ps1'
$global:FinanceFoundryMockCalls = [System.Collections.Generic.List[object]]::new()
$global:FinanceFoundryMockAssignments = [System.Collections.Generic.List[object]]::new()
$global:FinanceFoundryMockAppHasIdentity = $false
$global:FinanceFoundryMockFail = $false
$global:FinanceFoundryRuntimeAssignments = @()

function global:az {
  $global:FinanceFoundryMockCalls.Add(@($args))
  $global:LASTEXITCODE = 0
  if ($global:FinanceFoundryMockFail) { $global:LASTEXITCODE = 1; return }
  $command = $args[0..([Math]::Min(2, $args.Count - 1))] -join ' '
  if ($command -eq 'role assignment list') {
    if ('--all' -in $args -and '--scope' -in $args) { throw 'Azure CLI does not allow --all together with --scope.' }
    if ('--query' -notin $args) { return ConvertTo-Json -InputObject @($global:FinanceFoundryRuntimeAssignments) -Compress }
    $query = $args[[Array]::IndexOf($args, '--query') + 1]
    $principal = [regex]::Match($query, "principalId=='([^']+)'").Groups[1].Value
    $role = [regex]::Match($query, "roleDefinitionId, '/([^']+)'").Groups[1].Value
    ConvertTo-Json -InputObject @($global:FinanceFoundryMockAssignments | Where-Object { $_.principalId -eq $principal -and $_.roleDefinitionId -like "*/$role" }) -Compress
  } elseif ($command -eq 'role definition list') {
    return '[{"permissions":[{"actions":[],"dataActions":["Microsoft.CognitiveServices/accounts/AIServices/agents/write"]}]}]'
  } elseif ($command -eq 'deployment group create') {
    return '{}'
  } elseif ($command -eq 'role assignment create') {
    $assignment = [PSCustomObject]@{
      name = $args[[Array]::IndexOf($args, '--name') + 1]
      scope = $args[[Array]::IndexOf($args, '--scope') + 1]
      principalId = $args[[Array]::IndexOf($args, '--assignee-object-id') + 1]
      roleDefinitionId = '/providers/Microsoft.Authorization/roleDefinitions/' + $args[[Array]::IndexOf($args, '--role') + 1]
    }
    $global:FinanceFoundryMockAssignments.Add($assignment)
    $assignment | ConvertTo-Json -Compress
  } elseif ($args[0] -eq 'containerapp' -and $args[1] -eq 'show') {
    if ($global:FinanceFoundryMockAppHasIdentity) {
      '{"id":"/subscriptions/app/resourceGroups/app/providers/Microsoft.App/containerApps/api","identity":{"principalId":"22222222-2222-2222-2222-222222222222"}}'
    } else {
      '{"id":"/subscriptions/app/resourceGroups/app/providers/Microsoft.App/containerApps/api","identity":null}'
    }
  } elseif ($command -eq 'containerapp identity assign') {
    '{"principalId":"22222222-2222-2222-2222-222222222222"}'
  } elseif ($args[0] -eq 'identity' -and $args[1] -eq 'show') {
    '{"principalId":"33333333-3333-3333-3333-333333333333","clientId":"44444444-4444-4444-4444-444444444444"}'
  } else {
    throw "Unexpected mocked command: $command"
  }
}

function Assert-AccessTest {
  param([bool] $Condition, [string] $Message)
  if (-not $Condition) { throw $Message }
}

try {
  $common = @{
    FoundryResourceId = '/subscriptions/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/resourceGroups/foundry/providers/Microsoft.CognitiveServices/accounts/models'
    FoundryProjectName = 'income'
  }
  $user = @{ PrincipalObjectId = '11111111-1111-1111-1111-111111111111'; PrincipalType = 'User'; AccessProfile = 'Developer' }
  & $accessScript @common @user -WhatIf
  Assert-AccessTest ($global:FinanceFoundryMockAssignments.Count -eq 0) 'WhatIf created role assignments.'
  & $accessScript @common @user
  Assert-AccessTest ($global:FinanceFoundryMockAssignments.Count -eq 2) 'Project mode must assign project Foundry User and parent Reader.'
  Assert-AccessTest ($global:FinanceFoundryMockAssignments[0].scope.EndsWith('/projects/income')) 'Foundry User was not restricted to project scope.'
  Assert-AccessTest (-not $global:FinanceFoundryMockAssignments[1].scope.Contains('/projects/')) 'Reader was not assigned at parent resource scope.'
  & $accessScript @common @user
  Assert-AccessTest ($global:FinanceFoundryMockAssignments.Count -eq 2) 'Repeated setup duplicated assignments.'
  & $accessScript @common @user -EndpointKind Resource
  Assert-AccessTest ($global:FinanceFoundryMockAssignments.Count -eq 3) 'Resource mode did not add the OpenAI role.'
  Assert-AccessTest ($global:FinanceFoundryMockAssignments[2].roleDefinitionId.EndsWith('/5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')) 'Resource mode used an incorrect role.'

  $app = @{ ContainerAppName = 'api'; ResourceGroupName = 'app'; SubscriptionId = 'app' }
  $before = $global:FinanceFoundryMockCalls.Count
  & $accessScript @common @app -WhatIf
  $newCalls = @($global:FinanceFoundryMockCalls | Select-Object -Skip $before)
  Assert-AccessTest (@($newCalls | Where-Object { ($_ -join ' ') -like '*identity assign*' }).Count -eq 0) 'WhatIf enabled an identity.'
  & $accessScript @common @app
  Assert-AccessTest (@($global:FinanceFoundryMockCalls | Where-Object { ($_ -join ' ') -like '*deployment group create*principalId=22222222-2222-2222-2222-222222222222*' }).Count -eq 1) 'System-assigned app identity did not receive restricted role deployment.'
  & $accessScript @common @app -UserAssignedIdentityResourceId '/subscriptions/app/resourceGroups/app/providers/Microsoft.ManagedIdentity/userAssignedIdentities/runtime'
  Assert-AccessTest (@($global:FinanceFoundryMockCalls | Where-Object { ($_ -join ' ') -like '*deployment group create*principalId=33333333-3333-3333-3333-333333333333*' }).Count -eq 1) 'User-assigned identity did not receive restricted roles for principal ID.'
  Assert-AccessTest ($global:FinanceFoundryMockAssignments.Count -eq 3) 'Runtime reused broad built-in role assignments.'
  $permissionContract = Get-Content (Join-Path $PSScriptRoot '../roles/foundry-research-permissions.json') -Raw | ConvertFrom-Json
  Assert-AccessTest ($permissionContract.runtimeDataActions.Count -eq 3 -and 'Microsoft.CognitiveServices/accounts/AIServices/agents/write' -notin $permissionContract.runtimeDataActions) 'Runtime role can edit agents.'
  Assert-AccessTest (@($permissionContract.metadataActions | Where-Object { $_ -notmatch '/read$' }).Count -eq 0) 'Metadata role can mutate policies or deployments.'
  Assert-AccessTest ('Microsoft.CognitiveServices/accounts/raiPolicies/read' -in $permissionContract.metadataActions -and 'Microsoft.CognitiveServices/accounts/deployments/read' -in $permissionContract.metadataActions) 'Runtime cannot verify policy/model integrity.'
  $audit = @($global:FinanceFoundryMockCalls | Where-Object { ($_ -join ' ') -like '*role assignment list*--assignee*' })
  Assert-AccessTest (@($audit | Where-Object { '--include-groups' -notin $_ -or '--include-inherited' -notin $_ }).Count -eq 0) 'Runtime effective access audit omitted inherited/group grants.'
  $beforeDeployments = @($global:FinanceFoundryMockCalls | Where-Object { ($_ -join ' ') -like '*deployment group create*' }).Count
  $global:FinanceFoundryRuntimeAssignments = @(@{ roleDefinitionId = '/providers/Microsoft.Authorization/roleDefinitions/broad-role' })
  $failed = $false
  try { & $accessScript @common @app } catch { $failed = $true }
  Assert-AccessTest $failed 'Runtime broad data-plane role was silently accepted.'
  Assert-AccessTest (@($global:FinanceFoundryMockCalls | Where-Object { ($_ -join ' ') -like '*deployment group create*' }).Count -eq $beforeDeployments) 'Unsafe runtime identity received additional grants.'
  $global:FinanceFoundryRuntimeAssignments = @()

  $global:FinanceFoundryMockFail = $true
  $failed = $false
  try { & $accessScript @common @user } catch { $failed = $true }
  Assert-AccessTest $failed 'Azure CLI errors were silently ignored.'
  Write-Host 'Foundry setup offline checks passed: WhatIf, project/resource scope, idempotency, system/user identity, and CLI failures.'
} finally {
  Remove-Item Function:\global:az
  Remove-Variable -Scope Global -Name FinanceFoundryMockCalls, FinanceFoundryMockAssignments, FinanceFoundryMockAppHasIdentity, FinanceFoundryMockFail, FinanceFoundryRuntimeAssignments -ErrorAction SilentlyContinue
}
