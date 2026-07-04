param(
    [switch]$ApiOnly,
    [switch]$UiOnly
)

$ErrorActionPreference = 'Stop'

function Get-LocalConfig {
    $envPath = Join-Path $PSScriptRoot '.env.local'
    if (-not (Test-Path $envPath)) {
        throw "Missing $envPath. Copy .env.local.example to .env.local and set your Entra app values."
    }

    $config = @{}
    foreach ($line in Get-Content $envPath) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) {
            continue
        }

        $parts = $trimmed -split '=', 2
        if ($parts.Count -ne 2) {
            continue
        }

        $config[$parts[0].Trim()] = $parts[1].Trim()
    }

    return $config
}

function Set-ProcessConfig {
    param(
        [hashtable]$Config
    )

    foreach ($entry in $Config.GetEnumerator()) {
        [System.Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
    }
}

function Test-RequiredKeys {
    param(
        [hashtable]$Config
    )

    $required = @(
        'FINANCE_COMPANION_ALLOWED_EMAIL',
        'FINANCE_COMPANION_SESSION_SECRET',
        'VITE_API_BASE_URL',
        'FINANCE_COMPANION_ENTRA_CLIENT_ID',
        'FINANCE_COMPANION_ENTRA_TENANT_ID',
        'VITE_ENTRA_CLIENT_ID',
        'VITE_ENTRA_TENANT_ID'
    )

    $missing = $required | Where-Object { -not $Config.ContainsKey($_) -or [string]::IsNullOrWhiteSpace($Config[$_]) }
    if ($missing.Count -gt 0) {
        throw "Missing required values in .env.local: $($missing -join ', ')"
    }
}

function Show-EntraWarning {
    param(
        [hashtable]$Config
    )

    $entraClientId = $Config['VITE_ENTRA_CLIENT_ID']
    $entraTenantId = $Config['VITE_ENTRA_TENANT_ID']
    if ($entraClientId -like 'your-entra-*' -or $entraTenantId -like 'your-entra-*') {
        Write-Warning 'The Entra client or tenant value still uses the placeholder value. Microsoft sign-in will not complete until you replace them.'
    }
}

$config = Get-LocalConfig
Test-RequiredKeys -Config $config
Show-EntraWarning -Config $config

if ($ApiOnly) {
    Set-ProcessConfig -Config $config
    Set-Location (Join-Path $PSScriptRoot 'src/API')
    Write-Host 'Starting API on http://localhost:8000'
    python -m uvicorn app.main:app --reload --port 8000
    exit $LASTEXITCODE
}

if ($UiOnly) {
    Set-ProcessConfig -Config $config
    Set-Location (Join-Path $PSScriptRoot 'src/UI')
    Write-Host 'Starting UI on http://localhost:5173'
    npm run dev -- --host localhost --port 5173
    exit $LASTEXITCODE
}

$processesFile = Join-Path $PSScriptRoot '.local-dev-processes.json'

$apiProcess = Start-Process -FilePath 'powershell.exe' `
    -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath, '-ApiOnly') `
    -WorkingDirectory $PSScriptRoot `
    -WindowStyle Normal `
    -PassThru

$uiProcess = Start-Process -FilePath 'powershell.exe' `
    -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath, '-UiOnly') `
    -WorkingDirectory $PSScriptRoot `
    -WindowStyle Normal `
    -PassThru

@{
    apiPid = $apiProcess.Id
    uiPid = $uiProcess.Id
} | ConvertTo-Json | Set-Content $processesFile

Write-Host 'Local startup launched.'
Write-Host 'API: http://localhost:8000/api/v1/health'
Write-Host 'UI:  http://localhost:5173'
Write-Host 'Use .\stop-local.ps1 to close both windows later.'
