param(
    [switch]$ApiOnly,
    [switch]$UiOnly,
    [switch]$RestartApi,
    [switch]$CheckConfig,
    [string]$ConfigFile = (Join-Path $PSScriptRoot '.env.local')
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts/local-config.ps1')
$localConfig = Get-FinanceLocalConfig -RepositoryRoot $PSScriptRoot -ConfigFile $ConfigFile
Assert-FinanceLocalConfig -Config $localConfig
$ConfigFile = (Resolve-Path -LiteralPath $ConfigFile).Path
$apiDirectory = Join-Path $PSScriptRoot 'src/API'
$uiDirectory = Join-Path $PSScriptRoot 'src/UI'
$runtimePython = Join-Path $apiDirectory '.venv/Scripts/python.exe'
$processesFile = Join-Path $PSScriptRoot '.local-dev-processes.json'
$logDirectory = Join-Path $PSScriptRoot '.local-data/logs'

if ($CheckConfig) {
    Write-Host "Local configuration valid. Distribution provider: $($localConfig['FINANCE_COMPANION_DIVIDEND_RESEARCH_PROVIDER'])."
    Write-Host "Persistent data: $($localConfig['FINANCE_COMPANION_LOCAL_JSON_PATH'])"
    exit 0
}
if (@($ApiOnly, $UiOnly, $RestartApi | Where-Object { $_ }).Count -gt 1) { throw 'Choose at most one of -ApiOnly, -UiOnly, or -RestartApi.' }

function Initialize-ApiRuntime {
    if (-not (Test-Path -LiteralPath $runtimePython)) {
        if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw 'Install Python 3.12 or newer and add it to PATH.' }
        & python -m venv (Join-Path $apiDirectory '.venv')
        if ($LASTEXITCODE -ne 0) { throw 'Unable to create the local Python environment.' }
    }
    & $runtimePython -c 'import sys; sys.exit(0 if sys.version_info >= (3,12) else 1)'
    if ($LASTEXITCODE -ne 0) { throw 'The API virtual environment requires Python 3.12 or newer.' }
    $dependencyHash = (Get-FileHash -LiteralPath (Join-Path $apiDirectory 'pyproject.toml')).Hash
    $stamp = Join-Path $apiDirectory '.venv/.finance-dependencies.sha256'
    if (-not (Test-Path -LiteralPath $stamp) -or (Get-Content -LiteralPath $stamp -Raw).Trim() -ne $dependencyHash) {
        # Environments created by tools such as uv may not include pip.
        & $runtimePython -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('pip') else 1)"
        if ($LASTEXITCODE -ne 0) {
            Write-Host 'Bootstrapping pip in src/API/.venv...'
            & $runtimePython -m ensurepip --upgrade
            if ($LASTEXITCODE -ne 0) { throw 'Unable to bootstrap pip in src/API/.venv. See the ensurepip error above.' }
        }
        Write-Host 'Installing API dependencies into src/API/.venv...'
        & $runtimePython -m pip install --disable-pip-version-check -e "$apiDirectory[dev]"
        if ($LASTEXITCODE -ne 0) { throw 'API dependency installation failed.' }
        Set-Content -LiteralPath $stamp -Value $dependencyHash
    }
}

function Initialize-UiRuntime {
    if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Install Node.js 24 LTS (with npm 11).' }
    $nodeMajor = & node -p "process.versions.node.split('.')[0]"
    if ($LASTEXITCODE -ne 0 -or $nodeMajor -ne '24') { throw 'The UI requires Node.js 24 LTS.' }
    $dependencyHash = (Get-FileHash -LiteralPath (Join-Path $uiDirectory 'package-lock.json')).Hash
    $stamp = Join-Path $uiDirectory 'node_modules/.finance-dependencies.sha256'
    if (-not (Test-Path -LiteralPath $stamp) -or (Get-Content -LiteralPath $stamp -Raw).Trim() -ne $dependencyHash) {
        Push-Location $uiDirectory
        try {
            & npm.cmd ci
            if ($LASTEXITCODE -ne 0) { throw 'UI dependency installation failed.' }
            Set-Content -LiteralPath $stamp -Value $dependencyHash
        } finally { Pop-Location }
    }
}

function Assert-LocalFoundryIdentity {
    if ($localConfig['FINANCE_COMPANION_DIVIDEND_RESEARCH_PROVIDER'] -ne 'azure_foundry' -or $localConfig['FINANCE_COMPANION_AZURE_FOUNDRY_AUTH_MODE'] -ne 'entra') { return }
    if ($localConfig['FINANCE_COMPANION_AZURE_FOUNDRY_MANAGED_IDENTITY_CLIENT_ID']) { throw 'Leave AZURE_FOUNDRY_MANAGED_IDENTITY_CLIENT_ID blank locally. Use az login for development; managed identity is for Azure hosting.' }
    if (-not (Get-Command az -ErrorAction SilentlyContinue)) { throw 'Install Azure CLI, then run az login using the tenant with Foundry access.' }
    & az account show --query id --output none --only-show-errors 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Run az login --tenant YOUR_TENANT_ID, then retry. Your developer account needs inference access to the configured Foundry endpoint.' }
}

function Start-LocalChild {
    param([ValidateSet('ApiOnly', 'UiOnly')][string]$Mode)
    $label = if ($Mode -eq 'ApiOnly') { 'api' } else { 'ui' }
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -$Mode -ConfigFile `"$ConfigFile`""
    # Keep the same PowerShell runtime/module path as the launcher. A pwsh
    # parent spawning Windows PowerShell can lose built-in module discovery.
    $shellExecutable = (Get-Process -Id $PID).Path
    return Start-Process -FilePath $shellExecutable -ArgumentList $arguments -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory "$label.log") -RedirectStandardError (Join-Path $logDirectory "$label.error.log") -PassThru
}

function Stop-TrackedLocalProcess {
    param([int]$ProcessId, [object]$StartedAt)
    $tracked = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $tracked) { return }
    # ConvertFrom-Json may return ISO timestamps as DateTime objects (PowerShell
    # 7), rather than strings. Compare exact instants without losing subsecond
    # precision or accepting a reused PID.
    $expectedStart = $null
    if ($StartedAt -is [datetime]) { $expectedStart = $StartedAt.ToUniversalTime() }
    elseif ($StartedAt) {
        try { $expectedStart = [datetime]::Parse([string]$StartedAt, [cultureinfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime() } catch { }
    }
    if (-not $expectedStart -or $tracked.StartTime.ToUniversalTime().Ticks -ne $expectedStart.Ticks) { throw "PID $ProcessId does not match the saved startup time. Stop the old local server manually to avoid terminating an unrelated process." }
    & taskkill.exe /PID $ProcessId /T /F | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Unable to stop local process $ProcessId." }
}

function Wait-LocalHealth {
    param([string]$Url, [System.Diagnostics.Process]$Child, [string]$Label)
    $deadline = (Get-Date).AddSeconds(45)
    do {
        if ($Child.HasExited) { throw "$Label exited during startup. Check .local-data/logs/$Label.error.log." }
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { return }
        } catch { }
        Start-Sleep -Milliseconds 500
        $Child.Refresh()
    } while ((Get-Date) -lt $deadline)
    throw "$Label did not become healthy. Check .local-data/logs/$Label.error.log and verify ports 8000/5173 are available."
}

function Assert-LocalPortFree {
    param([int]$Port)
    $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    if ($listener) { throw "Port $Port is already in use. Stop the other native/Docker stack before starting this local server; do not run two JSON API writers." }
}

Set-FinanceLocalEnvironment -Config $localConfig
if ($ApiOnly) {
    Initialize-ApiRuntime
    Assert-LocalFoundryIdentity
    Set-Location $apiDirectory
    Write-Host "Starting API. Distribution provider: $($localConfig['FINANCE_COMPANION_DIVIDEND_RESEARCH_PROVIDER'])."
    & $runtimePython -m uvicorn app.main:app --host localhost --port 8000
    exit $LASTEXITCODE
}
if ($UiOnly) {
    Initialize-UiRuntime
    Set-Location $uiDirectory
    & npm.cmd run dev -- --host localhost --port 5173 --strictPort
    exit $LASTEXITCODE
}

Initialize-ApiRuntime
Assert-LocalFoundryIdentity
if (-not $RestartApi) { Initialize-UiRuntime }
$existing = if (Test-Path -LiteralPath $processesFile) { Get-Content -LiteralPath $processesFile -Raw | ConvertFrom-Json } else { $null }
if ($existing -and $existing.apiPid) {
    $oldApi = Get-Process -Id $existing.apiPid -ErrorAction SilentlyContinue
    if ($oldApi -and -not $RestartApi) { throw 'A tracked local API is running. Use .\start-local.ps1 -RestartApi, or .\stop-local.ps1 before starting both services.' }
    if ($oldApi) { Stop-TrackedLocalProcess -ProcessId $existing.apiPid -StartedAt $existing.apiStartedAt }
}
Assert-LocalPortFree -Port 8000
if (-not $RestartApi) { Assert-LocalPortFree -Port 5173 }
$apiChild = Start-LocalChild -Mode ApiOnly
$apiStart = $apiChild.StartTime.ToUniversalTime().ToString('O')
$uiChild = $null
try {
    Wait-LocalHealth -Url 'http://localhost:8000/api/v1/health' -Child $apiChild -Label api
    if (-not $RestartApi) {
        $uiChild = Start-LocalChild -Mode UiOnly
        Wait-LocalHealth -Url 'http://localhost:5173' -Child $uiChild -Label ui
    }
} catch {
    if ($uiChild) { Stop-TrackedLocalProcess -ProcessId $uiChild.Id -StartedAt $uiChild.StartTime.ToUniversalTime().ToString('O') }
    Stop-TrackedLocalProcess -ProcessId $apiChild.Id -StartedAt $apiStart
    throw
}
@{
    apiPid = $apiChild.Id
    apiStartedAt = $apiStart
    uiPid = if ($uiChild) { $uiChild.Id } elseif ($existing) { $existing.uiPid } else { $null }
    uiStartedAt = if ($uiChild) { $uiChild.StartTime.ToUniversalTime().ToString('O') } elseif ($existing) { $existing.uiStartedAt } else { $null }
    configFile = $ConfigFile
} | ConvertTo-Json | Set-Content -LiteralPath $processesFile
Write-Host "Local API ready. Distribution provider: $($localConfig['FINANCE_COMPANION_DIVIDEND_RESEARCH_PROVIDER'])."
Write-Host "Persistent data: $($localConfig['FINANCE_COMPANION_LOCAL_JSON_PATH'])"
Write-Host 'Open http://localhost:5173 and choose Investing > Passive Income > Refresh distribution data.'
Write-Host 'Logs: .local-data/logs. Stop: .\stop-local.ps1. Reload API configuration: .\start-local.ps1 -RestartApi.'
