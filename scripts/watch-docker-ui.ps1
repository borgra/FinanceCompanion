param(
    [ValidateRange(250, 10000)]
    [int]$DebounceMilliseconds = 1000,
    [ValidateRange(1, 60)]
    [int]$PollIntervalSeconds = 1,
    [switch]$Once
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$uiSourcePath = Join-Path $repositoryRoot 'src\UI'
$composeFile = Join-Path $repositoryRoot 'docker-compose.local.yml'
$ignoredPathPattern = '[\\/](node_modules|dist|build|coverage|\.vite|\.git)[\\/]'

if (-not (Test-Path -LiteralPath $uiSourcePath)) {
    throw "UI source directory not found: $uiSourcePath"
}

if (-not (Test-Path -LiteralPath $composeFile)) {
    throw "Docker Compose file not found: $composeFile"
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker is required but was not found on PATH.'
}

function Get-UiSourceSignature {
    $trackedFiles = Get-ChildItem -LiteralPath $uiSourcePath -File -Recurse |
        Where-Object {
            $_.FullName -notmatch $ignoredPathPattern -and
            $_.Name -notlike '*.tmp' -and
            $_.Name -notlike '*.swp' -and
            $_.Name -notlike '*~' -and
            $_.Name -notlike '~$*' -and
            $_.Name -notlike '*.log'
        } |
        Sort-Object FullName

    return [string]::Join("`n", @($trackedFiles | ForEach-Object {
        "$($_.FullName)|$($_.Length)|$($_.LastWriteTimeUtc.Ticks)"
    }))
}

function Invoke-UiRebuild {
    $timestamp = Get-Date -Format 'HH:mm:ss'
    Write-Host "[$timestamp] Rebuilding the Docker UI service..."
    & docker compose -f $composeFile up -d --build --force-recreate ui
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Docker UI rebuild failed (exit code $LASTEXITCODE). Watching for the next change."
        return
    }

    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] UI is available at http://localhost:5173"
}

$currentSignature = Get-UiSourceSignature
Invoke-UiRebuild
if ($Once) {
    exit 0
}

Write-Host "Watching $uiSourcePath for changes. Press Ctrl+C to stop watching; Docker services will keep running."
while ($true) {
    Start-Sleep -Seconds $PollIntervalSeconds
    $nextSignature = Get-UiSourceSignature
    if ($nextSignature -eq $currentSignature) {
        continue
    }

    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] UI source change detected; waiting for saves to settle..."
    do {
        $settledSignature = $nextSignature
        Start-Sleep -Milliseconds $DebounceMilliseconds
        $nextSignature = Get-UiSourceSignature
    } while ($nextSignature -ne $settledSignature)

    $currentSignature = $nextSignature
    Invoke-UiRebuild
}