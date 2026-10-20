<#
.SYNOPSIS
Enable a Container App managed identity and grant scoped Foundry inference access.
.DESCRIPTION
Run as an administrator who can update the Container App identity and write role
assignments at the target scope. -WhatIf previews changes. Existing inherited
assignments are reused; this script never removes identities or assignments.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^/subscriptions/[^/]+/resourceGroups/[^/]+/providers/Microsoft\.CognitiveServices/accounts/[^/]+$')]
  [string] $FoundryResourceId,

  [ValidateSet('Project', 'Resource')]
  [string] $EndpointKind = 'Project',
  [string] $FoundryProjectName = '',
  [string] $ContainerAppName = '',
  [string] $ResourceGroupName = '',
  [string] $SubscriptionId = '',
  [string] $UserAssignedIdentityResourceId = '',
  [string] $PrincipalObjectId = '',
  [ValidateSet('ServicePrincipal', 'User', 'Group')]
  [string] $PrincipalType = 'ServicePrincipal'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not (Get-Command az -ErrorAction SilentlyContinue)) { throw 'Install Azure CLI and sign in with az login first.' }
if ($EndpointKind -eq 'Project' -and $FoundryProjectName -notmatch '^[^/]+$') {
  throw 'Project endpoints require a nonempty FoundryProjectName without slashes.'
}
if ($PrincipalObjectId -and ($ContainerAppName -or $UserAssignedIdentityResourceId)) {
  throw 'Use either PrincipalObjectId or ContainerAppName (with an optional user-assigned identity).'
}
if (-not $PrincipalObjectId -and (-not $ContainerAppName -or -not $ResourceGroupName)) {
  throw 'Supply PrincipalObjectId, or both ContainerAppName and ResourceGroupName.'
}
if ($PrincipalObjectId) {
  $parsedPrincipalId = [Guid]::Empty
  if (-not [Guid]::TryParse($PrincipalObjectId, [ref]$parsedPrincipalId)) { throw 'PrincipalObjectId must be a principal object GUID, not a client ID.' }
}

function Invoke-AzureJson {
  param([string[]] $Arguments)
  $output = & az @Arguments --only-show-errors --output json
  if ($LASTEXITCODE -ne 0) { throw "Azure CLI failed: az $($Arguments[0..1] -join ' ')" }
  if ($output) { return (($output -join "`n") | ConvertFrom-Json) }
}

function Ensure-Role {
  param([string] $Scope, [string] $RoleId, [string] $Label)
  $assignments = @(Invoke-AzureJson -Arguments @(
    'role', 'assignment', 'list', '--scope', $Scope, '--include-inherited',
    '--query', "[?principalId=='$PrincipalObjectId' && ends_with(roleDefinitionId, '/$RoleId')]"
  ) | Where-Object {
    $Scope.Equals($_.scope, [StringComparison]::OrdinalIgnoreCase) -or
    $Scope.StartsWith($_.scope.TrimEnd('/') + '/', [StringComparison]::OrdinalIgnoreCase)
  })
  if ($assignments.Count -gt 0) {
    Write-Host "Already authorized: $Label at $($assignments[0].scope)"
    return
  }
  if ($PSCmdlet.ShouldProcess("$PrincipalObjectId at $Scope", "Assign $Label")) {
    # Stable name makes concurrent/repeated invocations converge on one assignment.
    $identityText = "$PrincipalObjectId|$RoleId|$Scope".ToLowerInvariant()
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    try { $digest = $hasher.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($identityText)) } finally { $hasher.Dispose() }
    $assignmentName = [Guid]::new([byte[]]$digest[0..15]).ToString()
    $null = Invoke-AzureJson -Arguments @(
      'role', 'assignment', 'create', '--name', $assignmentName,
      '--assignee-object-id', $PrincipalObjectId, '--assignee-principal-type', $PrincipalType,
      '--role', $RoleId, '--scope', $Scope
    )
    Write-Host "Assigned $Label at $Scope"
  }
}

$appArguments = @()
if ($SubscriptionId) { $appArguments = @('--subscription', $SubscriptionId) }
if (-not $PrincipalObjectId) {
  $PrincipalType = 'ServicePrincipal'
  $app = Invoke-AzureJson -Arguments (@('containerapp', 'show', '--name', $ContainerAppName, '--resource-group', $ResourceGroupName) + $appArguments)
  if ($UserAssignedIdentityResourceId) {
    $identity = Invoke-AzureJson -Arguments @('identity', 'show', '--ids', $UserAssignedIdentityResourceId)
    $PrincipalObjectId = $identity.principalId
    if ($PSCmdlet.ShouldProcess($app.id, "Attach user-assigned identity $UserAssignedIdentityResourceId")) {
      $null = Invoke-AzureJson -Arguments (@('containerapp', 'identity', 'assign', '--name', $ContainerAppName, '--resource-group', $ResourceGroupName, '--user-assigned', $UserAssignedIdentityResourceId) + $appArguments)
    }
    Write-Host "Runtime setting: FINANCE_COMPANION_AZURE_FOUNDRY_MANAGED_IDENTITY_CLIENT_ID=$($identity.clientId)"
  } else {
    if ($PSCmdlet.ShouldProcess($app.id, 'Enable system-assigned managed identity')) {
      $identity = Invoke-AzureJson -Arguments (@('containerapp', 'identity', 'assign', '--name', $ContainerAppName, '--resource-group', $ResourceGroupName, '--system-assigned') + $appArguments)
      $PrincipalObjectId = $identity.principalId
    } elseif ($app.PSObject.Properties['identity'] -and $app.identity -and $app.identity.PSObject.Properties['principalId']) {
      $PrincipalObjectId = $app.identity.principalId
    }
    if (-not $PrincipalObjectId) {
      Write-Host 'The system principal will be created when this script is run without -WhatIf.'
      Write-Host "Planned inference scope: $FoundryResourceId$(if ($EndpointKind -eq 'Project') { '/projects/' + $FoundryProjectName })"
      Write-Host $(if ($EndpointKind -eq 'Project') { 'Planned grants: Foundry User at project scope; Reader at parent resource scope.' } else { 'Planned grant: Cognitive Services OpenAI User at resource scope.' })
      return
    }
    Write-Host 'Runtime setting: leave FINANCE_COMPANION_AZURE_FOUNDRY_MANAGED_IDENTITY_CLIENT_ID empty (system-assigned identity).'
  }
}

Write-Host "Principal object ID: $PrincipalObjectId"
if ($EndpointKind -eq 'Project') {
  Ensure-Role -Scope "$FoundryResourceId/projects/$FoundryProjectName" -RoleId '53ca6127-db72-4b80-b1b0-d745d6d5456d' -Label 'Foundry User (formerly Azure AI User)'
  Ensure-Role -Scope $FoundryResourceId -RoleId 'acdd72a7-3385-48ef-bd42-f606fba81ae7' -Label 'Reader (parent resource metadata only)'
} else {
  Ensure-Role -Scope $FoundryResourceId -RoleId '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd' -Label 'Cognitive Services OpenAI User'
}
Write-Host 'Allow RBAC propagation, then test a refresh from the running API. Token acquisition alone does not verify inference authorization.'
