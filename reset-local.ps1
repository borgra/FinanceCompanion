$ErrorActionPreference = 'Stop'
$dataPath = Join-Path $PSScriptRoot '.local-data'
if (Test-Path $dataPath) {
  Remove-Item -LiteralPath $dataPath -Recurse -Force
  Write-Host "Removed local JSON data at $dataPath"
} else { Write-Host 'No local JSON data directory exists.' }
