param(
    [switch]$ApiOnly,
    [switch]$UiOnly,
    [switch]$RestartApi
)

$ErrorActionPreference = 'Stop'

function Get-LocalConfig {
    $envPath = Join-Path $PSScriptRoot '.env.local'
    if (-not (Test-Path $envPath)) {
        throw "Missing $envPath. Create .env.local with your local API, UI, Entra, and Alpha Vantage settings."
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
        'FINANCE_COMPANION_ALPHA_VANTAGE_API_KEY',
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

function Start-LocalApiProcess {
    param(
        [string]$ScriptPath,
        [string]$WorkingDirectory
    )

    return Start-Process -FilePath 'powershell.exe' `
        -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-File', $ScriptPath, '-ApiOnly') `
        -WorkingDirectory $WorkingDirectory `
        -WindowStyle Normal `
        -PassThru
}

function Stop-TrackedProcess {
    param(
        [int]$ProcessId,
        [string]$Description
    )

    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $process) {
        return
    }

    Write-Host "Stopping tracked $Description process (PID $ProcessId)"
    & taskkill.exe /PID $ProcessId /T /F | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to stop tracked $Description process tree (PID $ProcessId)."
    }

    $process.WaitForExit(10000)
    if (-not $process.HasExited) {
        throw "Timed out stopping tracked $Description process (PID $ProcessId)."
    }
}

function Wait-ForApiHealth {
    param(
        [int]$TimeoutSeconds = 30
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $response = Invoke-WebRequest -Uri 'http://localhost:8000/api/v1/health' -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) {
                return
            }
        } catch {
            # The API is still starting; retry until the deadline.
        }

        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)

    throw "The API did not become healthy at http://localhost:8000/api/v1/health within $TimeoutSeconds seconds."
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

if ($RestartApi) {
    if ($ApiOnly -or $UiOnly) {
        throw 'Use -RestartApi by itself.'
    }

    $processesFile = Join-Path $PSScriptRoot '.local-dev-processes.json'
    $trackedProcesses = if (Test-Path $processesFile) {
        Get-Content $processesFile | ConvertFrom-Json
    } else {
        $null
    }

    if ($trackedProcesses -and $trackedProcesses.apiPid) {
        Stop-TrackedProcess -ProcessId $trackedProcesses.apiPid -Description 'API'
    }

    $apiProcess = Start-LocalApiProcess -ScriptPath $PSCommandPath -WorkingDirectory $PSScriptRoot
    try {
        Wait-ForApiHealth
    } catch {
        Stop-TrackedProcess -ProcessId $apiProcess.Id -Description 'API'
        throw
    }

    @{
        apiPid = $apiProcess.Id
        uiPid = if ($trackedProcesses) { $trackedProcesses.uiPid } else { $null }
    } | ConvertTo-Json | Set-Content $processesFile

    Write-Host "API restarted successfully (PID $($apiProcess.Id))."
    exit 0
}
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

$apiProcess = Start-LocalApiProcess -ScriptPath $PSCommandPath -WorkingDirectory $PSScriptRoot

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
Write-Host 'Use .\start-local.ps1 -RestartApi to restart only the API after local API changes.'
