$ErrorActionPreference = 'Stop'
$processesFile = Join-Path $PSScriptRoot '.local-dev-processes.json'
if (-not (Test-Path -LiteralPath $processesFile)) { Write-Host 'No tracked local servers.'; exit 0 }
$tracked = Get-Content -LiteralPath $processesFile -Raw | ConvertFrom-Json
foreach ($label in @('api', 'ui')) {
    $processId = $tracked."${label}Pid"
    $startedAt = $tracked."${label}StartedAt"
    if (-not $processId) { continue }
    $localProcess = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if (-not $localProcess) { continue }
    if (-not $startedAt -or $localProcess.StartTime.ToUniversalTime().ToString('O') -ne $startedAt) {
        throw "Saved $label PID does not match its startup time. Stop the old server manually; no unrelated process was terminated."
    }
    & taskkill.exe /PID $processId /T /F | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Unable to stop tracked $label server." }
}
Remove-Item -LiteralPath $processesFile
Write-Host 'Local API and UI stopped. Persistent data was kept in .local-data.'
