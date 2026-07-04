$ErrorActionPreference = 'Stop'

$processesFile = Join-Path $PSScriptRoot '.local-dev-processes.json'
if (-not (Test-Path $processesFile)) {
    Write-Host 'No local startup process file found.'
    exit 0
}

$processes = Get-Content $processesFile | ConvertFrom-Json

foreach ($pidValue in @($processes.apiPid, $processes.uiPid)) {
    if (-not $pidValue) {
        continue
    }

    $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($process) {
        Stop-Process -Id $pidValue
    }
}

Remove-Item $processesFile -ErrorAction SilentlyContinue
Write-Host 'Local API and UI processes stopped.'

