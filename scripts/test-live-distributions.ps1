param(
    [ValidatePattern('^[A-Za-z0-9.-]{1,20}$')][string]$Symbol = 'JEPQ',
    [string]$ConfigFile = (Join-Path (Split-Path $PSScriptRoot -Parent) '.env.local'),
    [switch]$VerifyRestart
)
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'local-config.ps1')
$config = Get-FinanceLocalConfig -RepositoryRoot $repositoryRoot -ConfigFile $ConfigFile
Assert-FinanceLocalConfig -Config $config
if ($config['FINANCE_COMPANION_DIVIDEND_RESEARCH_PROVIDER'] -eq 'stub') { throw 'Use DIVIDEND_RESEARCH_PROVIDER=azure_foundry to test AI web retrieval. Stub records do not test retrieval.' }
if ($config['FINANCE_COMPANION_DISABLE_AUTH_FOR_LOCAL_DEVELOPMENT'] -ne 'true') { throw 'This script targets local development with browser auth bypass. With browser sign-in enabled, perform the refresh from the signed-in UI instead.' }
$api = 'http://localhost:8000/api/v1'
$holdings = @(Invoke-RestMethod -Uri "$api/holdings" -TimeoutSec 10)
$matches = @($holdings | Where-Object { $_.security.symbol -ieq $Symbol })
if ($matches.Count -eq 0) { throw "Add $Symbol with a positive quantity in Investing > Holdings, then rerun this smoke check." }
$holding = $matches[0]
Write-Host "Refreshing $Symbol using the configured live provider. Foundry web research searches public sources and uses your Azure deployment; Azure search/model charges may apply."
try {
    $updated = Invoke-RestMethod -Uri "$api/holdings/$($holding.id)/dividends/refresh" -Method Post -ContentType application/json -Body '{}' -TimeoutSec 110
} catch {
    throw 'Live distribution refresh failed. Inspect the provider error in Passive Income or .local-data/logs/api.error.log. Existing records were kept.'
}
$security = $updated.security
if ($security.dividendResearchProvider -ne 'azure_foundry') { throw 'The running API did not use Foundry. Restart it with .\start-local.ps1 -RestartApi and retry.' }
$evidence = $security.dividendResearchSnapshot.evidence
if ($evidence.kind -ne 'foundry_web_search' -or @($evidence.searches).Count -eq 0 -or @($evidence.citations).Count -eq 0) { throw 'The returned snapshot did not prove a completed Foundry web search with citations. Restart the API and review provider warnings.' }
if ($security.dividendResearchRetrievedAt -eq $holding.security.dividendResearchRetrievedAt -and $security.dividendResearchSnapshotId -eq $holding.security.dividendResearchSnapshotId) { throw 'The API reused a fresh cached result. Persistence may be valid, but this did not test a new live retrieval. Wait at least 60 seconds after the last refresh, then retry.' }
$sourced = @($security.sourcePayoutDetails | Where-Object { $_.status -in @('completed', 'announced') -and $_.source -ne 'stub' -and -not $_.excludedFromTotals })
$projected = @($security.payoutDetails | Where-Object { $_.status -eq 'projected' -and -not $_.excludedFromTotals })
if ($sourced.Count -lt 2) { throw 'Fewer than two usable cited source events were returned. Check source coverage/provider warnings; this is not a successful live forecast test.' }
if ($projected.Count -eq 0) { throw 'Source retrieval succeeded but no projections were available. Review cadence/share-basis warnings; the forecast portion of this smoke check did not pass.' }
if (-not $security.dividendResearchSnapshotId) { throw 'The research snapshot was not persisted.' }
$stored = Get-Content -LiteralPath $config['FINANCE_COMPANION_LOCAL_JSON_PATH'] -Raw | ConvertFrom-Json
$diskHoldings = @($stored.holdings.($config['FINANCE_COMPANION_LOCAL_DEVELOPMENT_USER_ID']))
$diskHolding = @($diskHoldings | Where-Object id -EQ $holding.id)[0]
if (-not $diskHolding -or $diskHolding.security.dividendResearchSnapshotId -ne $security.dividendResearchSnapshotId) { throw 'The local JSON file does not contain the returned research snapshot.' }
Write-Host "PASS: $Symbol retrieved $($sourced.Count) sourced events and $($projected.Count) projections; provider=$($security.dividendResearchProvider), status=$($security.dividendResearchStatus)."
Write-Host "PASS: source records, forecasts and snapshot saved to $($config['FINANCE_COMPANION_LOCAL_JSON_PATH'])."
if ($VerifyRestart) {
    $beforeEvents = ConvertTo-Json -InputObject @($security.payoutDetails) -Depth 50 -Compress
    & (Join-Path $repositoryRoot 'start-local.ps1') -RestartApi -ConfigFile $ConfigFile
    if ($LASTEXITCODE -ne 0) { throw 'API restart failed.' }
    $after = @(Invoke-RestMethod -Uri "$api/holdings" -TimeoutSec 10) | Where-Object id -EQ $holding.id
    $afterEvents = ConvertTo-Json -InputObject @($after.security.payoutDetails) -Depth 50 -Compress
    if ($after.security.dividendResearchSnapshotId -ne $security.dividendResearchSnapshotId -or $afterEvents -ne $beforeEvents) { throw 'Distribution records changed or disappeared across API restart.' }
    Write-Host 'PASS: the restarted API returned the same persisted distribution records and snapshot.'
}
Write-Host 'Inspect Previous year, Current year, and Next year in Investing > Passive Income. Warnings remain visible for inferred cadence or unavailable metadata.'
