# Shared by local startup and opt-in smoke checks. Never print credential values.
function Get-FinanceLocalConfig {
    param([string]$RepositoryRoot, [string]$ConfigFile)
    if (-not (Test-Path -LiteralPath $ConfigFile)) {
        $template = Join-Path $RepositoryRoot '.env.local.example'
        Copy-Item -LiteralPath $template -Destination $ConfigFile
        throw "Created $ConfigFile. Set your provider credentials/Foundry deployment in that file, then run the command again."
    }
    $config = @{}
    foreach ($line in Get-Content -LiteralPath $ConfigFile) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        $parts = $trimmed -split '=', 2
        if ($parts.Count -ne 2 -or $parts[0].Trim() -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { throw 'Invalid setting in local configuration. Use NAME=value lines.' }
        $value = $parts[1].Trim()
        if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $config[$parts[0].Trim()] = $value
    }
    $defaults = @{
        FINANCE_COMPANION_ENVIRONMENT = 'development'
        FINANCE_COMPANION_DATA_BACKEND = 'json'
        FINANCE_COMPANION_LOCAL_JSON_PATH = (Join-Path $RepositoryRoot '.local-data/finance.json')
        FINANCE_COMPANION_DISABLE_AUTH_FOR_LOCAL_DEVELOPMENT = 'true'
        FINANCE_COMPANION_LOCAL_DEVELOPMENT_USER_ID = 'user-steve'
        FINANCE_COMPANION_ALLOWED_EMAIL = 'local@example.test'
        FINANCE_COMPANION_SESSION_SECRET = 'local-dev-session-secret-change-me'
        FINANCE_COMPANION_DIVIDEND_RESEARCH_PROVIDER = 'stub'
        FINANCE_COMPANION_AZURE_FOUNDRY_AUTH_MODE = 'entra'
        FINANCE_COMPANION_AZURE_FOUNDRY_AGENT_NAME = 'dividend-history-agent'
        FINANCE_COMPANION_AZURE_FOUNDRY_STOCK_DETAILS_AGENT_NAME = 'stock-details-agent'
        FINANCE_COMPANION_CORS_ORIGINS = '["http://localhost:5173"]'
        VITE_API_BASE_URL = 'http://localhost:8000/api/v1'
        VITE_AUTH_MODE = 'local'
    }
    foreach ($entry in $defaults.GetEnumerator()) {
        if (-not $config.ContainsKey($entry.Key)) { $config[$entry.Key] = $entry.Value }
    }
    # Resolve relative JSON paths against the repository, not the child API directory.
    if ($config['FINANCE_COMPANION_LOCAL_JSON_PATH'] -and -not [IO.Path]::IsPathRooted($config['FINANCE_COMPANION_LOCAL_JSON_PATH'])) {
        $config['FINANCE_COMPANION_LOCAL_JSON_PATH'] = [IO.Path]::GetFullPath((Join-Path $RepositoryRoot $config['FINANCE_COMPANION_LOCAL_JSON_PATH']))
    }
    return $config
}

function Assert-FinanceLocalConfig {
    param([hashtable]$Config)
    if ($Config['FINANCE_COMPANION_ENVIRONMENT'] -ne 'development') { throw 'Local startup requires ENVIRONMENT=development.' }
    if ($Config['FINANCE_COMPANION_DATA_BACKEND'] -ne 'json') { throw 'Local startup uses DATA_BACKEND=json so refreshes persist across restarts.' }
    if ($Config['FINANCE_COMPANION_COSMOS_TABLE_CONNECTION_STRING']) { throw 'Remove COSMOS_TABLE_CONNECTION_STRING from the local config when using JSON persistence.' }
    $required = @('FINANCE_COMPANION_SESSION_SECRET', 'VITE_API_BASE_URL')
    $provider = $Config['FINANCE_COMPANION_DIVIDEND_RESEARCH_PROVIDER']
    if ($provider -notin @('stub', 'azure_foundry')) { throw 'Choose DIVIDEND_RESEARCH_PROVIDER=stub or azure_foundry.' }
    if ($provider -eq 'azure_foundry') {
        $required += @('FINANCE_COMPANION_AZURE_FOUNDRY_ENDPOINT', 'FINANCE_COMPANION_AZURE_FOUNDRY_DEPLOYMENT')
        $required += @('FINANCE_COMPANION_AZURE_FOUNDRY_RAI_POLICY_ID', 'FINANCE_COMPANION_AZURE_FOUNDRY_AGENT_VERSION', 'FINANCE_COMPANION_AZURE_FOUNDRY_STOCK_DETAILS_AGENT_VERSION')
        if ($Config['FINANCE_COMPANION_AZURE_FOUNDRY_AUTH_MODE'] -ne 'entra') { throw 'Live research requires AZURE_FOUNDRY_AUTH_MODE=entra and a project endpoint.' }
        foreach ($versionSetting in @('FINANCE_COMPANION_AZURE_FOUNDRY_AGENT_VERSION', 'FINANCE_COMPANION_AZURE_FOUNDRY_STOCK_DETAILS_AGENT_VERSION')) {
            if ($Config[$versionSetting] -and $Config[$versionSetting] -notmatch '^[1-9][0-9]{0,18}$') { throw "Configure an explicitly approved immutable numeric $versionSetting." }
        }
        if ($Config['FINANCE_COMPANION_AZURE_FOUNDRY_RAI_POLICY_ID'] -and $Config['FINANCE_COMPANION_AZURE_FOUNDRY_RAI_POLICY_ID'] -notmatch '^/subscriptions/[0-9a-fA-F-]{36}/resourceGroups/[A-Za-z0-9._()-]+/providers/Microsoft\.CognitiveServices/accounts/[A-Za-z0-9-]+/raiPolicies/[A-Za-z0-9._-]+$') { throw 'Configure a full ARM AZURE_FOUNDRY_RAI_POLICY_ID.' }
        if ($Config['FINANCE_COMPANION_AZURE_FOUNDRY_ENDPOINT'] -and $Config['FINANCE_COMPANION_AZURE_FOUNDRY_ENDPOINT'] -notmatch '^https://[A-Za-z0-9-]+\.services\.ai\.azure\.com/api/projects/[A-Za-z0-9._-]+/?$') { throw 'Live research requires an Azure HTTPS Foundry project endpoint.' }
    }
    foreach ($agentSetting in @('FINANCE_COMPANION_AZURE_FOUNDRY_AGENT_NAME', 'FINANCE_COMPANION_AZURE_FOUNDRY_STOCK_DETAILS_AGENT_NAME')) {
        if ($Config[$agentSetting] -notmatch '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$') { throw "Configure a valid $agentSetting (1-63 letters, digits or internal hyphens)." }
    }
    $bypass = $Config['FINANCE_COMPANION_DISABLE_AUTH_FOR_LOCAL_DEVELOPMENT'] -eq 'true'
    if (-not $bypass) {
        if ($Config['VITE_AUTH_MODE'] -ne 'entra') { throw 'Set VITE_AUTH_MODE=entra when browser authentication is enabled.' }
        $required += @('FINANCE_COMPANION_ENTRA_CLIENT_ID', 'FINANCE_COMPANION_ENTRA_TENANT_ID', 'VITE_ENTRA_CLIENT_ID', 'VITE_ENTRA_TENANT_ID', 'FINANCE_COMPANION_ALLOWED_EMAIL')
    } elseif ($Config['VITE_AUTH_MODE'] -ne 'local') { throw 'Set VITE_AUTH_MODE=local when local browser authentication is bypassed.' }
    $missing = @($required | Where-Object { -not $Config[$_] -or $Config[$_] -match '^(your-|replace-|<)' })
    if ($missing.Count) {
        throw "Configure these values in .env.local: $($missing -join ', '). Credential values were not printed."
    }
    if ($Config['FINANCE_COMPANION_SESSION_SECRET'].Length -lt 32) { throw 'SESSION_SECRET must have at least 32 characters.' }
}

function Set-FinanceLocalEnvironment {
    param([hashtable]$Config)
    foreach ($entry in $Config.GetEnumerator()) { [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process') }
    # Do not accidentally inherit a production store into this local process.
    [Environment]::SetEnvironmentVariable('FINANCE_COMPANION_COSMOS_TABLE_CONNECTION_STRING', '', 'Process')
}
