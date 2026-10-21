"""Check config-only launcher behavior without starting services or using credentials."""
from pathlib import Path
import shutil
import subprocess

import pytest

REPO = Path(__file__).resolve().parents[3]
POWERSHELL = shutil.which('powershell') or shutil.which('pwsh')
pytestmark = pytest.mark.skipif(not POWERSHELL, reason='PowerShell is not installed')
LIVE_GUARDRAILS = (
    'FINANCE_COMPANION_AZURE_FOUNDRY_AGENT_VERSION=7\n'
    'FINANCE_COMPANION_AZURE_FOUNDRY_STOCK_DETAILS_AGENT_VERSION=9\n'
    'FINANCE_COMPANION_AZURE_FOUNDRY_RAI_POLICY_ID=/subscriptions/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/resourceGroups/rg/providers/Microsoft.CognitiveServices/accounts/example/raiPolicies/research-injection-blocking-v1\n'
)


def check(tmp_path, lines):
    config = tmp_path / 'local.env'
    config.write_text(lines, encoding='utf-8')
    return subprocess.run([POWERSHELL, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(REPO / 'start-local.ps1'), '-CheckConfig', '-ConfigFile', str(config)], capture_output=True, text=True, timeout=20)


def test_offline_config_needs_no_keys_or_browser_registration(tmp_path):
    result = check(tmp_path, 'FINANCE_COMPANION_DIVIDEND_RESEARCH_PROVIDER=stub\n')
    assert result.returncode == 0, result.stderr
    assert 'provider: stub' in result.stdout
    assert str(REPO / '.local-data' / 'finance.json') in result.stdout


def test_missing_live_settings_fail_by_name_without_secret_values(tmp_path):
    result = check(tmp_path, 'FINANCE_COMPANION_DIVIDEND_RESEARCH_PROVIDER=azure_foundry\nFINANCE_COMPANION_AZURE_FOUNDRY_API_KEY=private-test-key\n')
    assert result.returncode != 0
    assert 'FINANCE_COMPANION_AZURE_FOUNDRY_ENDPOINT' in result.stderr
    assert 'private-test-key' not in result.stdout + result.stderr


def test_live_research_requires_approved_versions_policy_project_and_entra(tmp_path):
    result = check(tmp_path, 'FINANCE_COMPANION_DIVIDEND_RESEARCH_PROVIDER=azure_foundry\nFINANCE_COMPANION_AZURE_FOUNDRY_ENDPOINT=https://example.services.ai.azure.com/api/projects/income\nFINANCE_COMPANION_AZURE_FOUNDRY_DEPLOYMENT=research-deployment\nFINANCE_COMPANION_AZURE_FOUNDRY_AUTH_MODE=entra\n' + LIVE_GUARDRAILS)
    assert result.returncode == 0, result.stderr
    assert 'provider: azure_foundry' in result.stdout
    assert 'ALPHA_VANTAGE_API_KEY' not in result.stdout + result.stderr


def test_removed_distribution_adapters_cannot_be_selected(tmp_path):
    result = check(tmp_path, 'FINANCE_COMPANION_DIVIDEND_RESEARCH_PROVIDER=alpha_vantage\n')
    assert result.returncode != 0
    assert 'stub or azure_foundry' in result.stderr


def test_quoted_values_are_supported(tmp_path):
    result = check(tmp_path, 'FINANCE_COMPANION_DIVIDEND_RESEARCH_PROVIDER="azure_foundry"\nFINANCE_COMPANION_AZURE_FOUNDRY_ENDPOINT="https://example.services.ai.azure.com/api/projects/research"\nFINANCE_COMPANION_AZURE_FOUNDRY_DEPLOYMENT="research-deployment"\n' + LIVE_GUARDRAILS)
    assert result.returncode == 0, result.stderr


def test_browser_login_requires_matching_configuration(tmp_path):
    result = check(tmp_path, 'FINANCE_COMPANION_DISABLE_AUTH_FOR_LOCAL_DEVELOPMENT=false\n')
    assert result.returncode != 0
    assert 'VITE_AUTH_MODE=entra' in result.stderr


@pytest.mark.parametrize("name", ["custom-stock-agent", "x", "a" * 63])
def test_stock_agent_name_accepts_valid_overrides(tmp_path, name):
    result = check(tmp_path, f"FINANCE_COMPANION_AZURE_FOUNDRY_STOCK_DETAILS_AGENT_NAME={name}\n")
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize("name", ["", "../dividend-history", "-stock", "a" * 64])
def test_stock_agent_name_rejects_invalid_overrides(tmp_path, name):
    result = check(tmp_path, f"FINANCE_COMPANION_AZURE_FOUNDRY_STOCK_DETAILS_AGENT_NAME={name}\n")
    assert result.returncode != 0
    assert "FINANCE_COMPANION_AZURE_FOUNDRY_STOCK_DETAILS_AGENT_NAME" in result.stderr


def test_local_config_forwards_distinct_agent_names(tmp_path):
    script = REPO / "scripts" / "local-config.ps1"
    config_file = tmp_path / "local.env"
    config_file.write_text("FINANCE_COMPANION_AZURE_FOUNDRY_STOCK_DETAILS_AGENT_NAME=custom-stock\n", encoding="utf-8")
    command = (
        f". '{script}'; "
        f"$config = Get-FinanceLocalConfig -RepositoryRoot '{REPO}' -ConfigFile '{config_file}'; "
        "Assert-FinanceLocalConfig $config; Set-FinanceLocalEnvironment $config; "
        "Write-Output $env:FINANCE_COMPANION_AZURE_FOUNDRY_STOCK_DETAILS_AGENT_NAME; "
        "Write-Output $env:FINANCE_COMPANION_AZURE_FOUNDRY_AGENT_NAME"
    )
    result = subprocess.run([POWERSHELL, "-NoProfile", "-Command", command], capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, result.stderr
    assert result.stdout.splitlines() == ["custom-stock", "dividend-history-agent"]


@pytest.mark.parametrize("shell", list(dict.fromkeys(filter(None, [shutil.which("pwsh"), shutil.which("powershell")]))))
def test_restart_identity_check_preserves_exact_timestamps_for_strings_and_json_dates(tmp_path, shell):
    script = tmp_path / "restart-identity.ps1"
    script.write_text(r"""
param([string]$Launcher)
$ErrorActionPreference = 'Stop'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($Launcher, [ref]$tokens, [ref]$errors)
$function = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Stop-TrackedLocalProcess' }, $true)
Invoke-Expression $function.Extent.Text
$global:ExpectedStart = [datetime]::Parse('2026-10-21T19:39:58.9612526Z', [cultureinfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind)
$global:Kills = 0
function Get-Process { param($Id, $ErrorAction) return [pscustomobject]@{StartTime=$global:ExpectedStart} }
function taskkill.exe { $global:Kills++; $global:LASTEXITCODE=0 }
$fromJson = '{"started":"2026-10-21T19:39:58.9612526Z"}' | ConvertFrom-Json
foreach ($value in @('2026-10-21T19:39:58.9612526Z', $global:ExpectedStart, $fromJson.started)) {
  Stop-TrackedLocalProcess -ProcessId 42 -StartedAt $value
}
if ($global:Kills -ne 3) { throw 'Valid timestamps were not accepted.' }
foreach ($value in @('2026-10-21T19:39:58.9612527Z', $global:ExpectedStart.AddSeconds(1), 'invalid', $null)) {
  $rejected=$false
  try { Stop-TrackedLocalProcess -ProcessId 42 -StartedAt $value } catch { $rejected=$true }
  if (-not $rejected) { throw 'A reused or unverifiable PID was accepted.' }
}
if ($global:Kills -ne 3) { throw 'Wrong process was stopped.' }
Write-Output 'identity verified'
""", encoding="utf-8")
    result = subprocess.run([shell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script),
        "-Launcher", str(REPO / "start-local.ps1")], capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, result.stderr
    assert "identity verified" in result.stdout


@pytest.mark.parametrize("setting", ["FINANCE_COMPANION_AZURE_FOUNDRY_AGENT_VERSION", "FINANCE_COMPANION_AZURE_FOUNDRY_STOCK_DETAILS_AGENT_VERSION", "FINANCE_COMPANION_AZURE_FOUNDRY_RAI_POLICY_ID"])
def test_live_launcher_rejects_missing_approval_settings(tmp_path, setting):
    security = "\n".join(line for line in LIVE_GUARDRAILS.splitlines() if not line.startswith(setting + "="))
    result = check(tmp_path, "FINANCE_COMPANION_DIVIDEND_RESEARCH_PROVIDER=azure_foundry\nFINANCE_COMPANION_AZURE_FOUNDRY_ENDPOINT=https://example.services.ai.azure.com/api/projects/research\nFINANCE_COMPANION_AZURE_FOUNDRY_DEPLOYMENT=luna\n" + security)
    assert result.returncode != 0
    assert setting in result.stderr


@pytest.mark.parametrize("override,error", [
    ("FINANCE_COMPANION_AZURE_FOUNDRY_AGENT_VERSION=latest", "immutable"),
    ("FINANCE_COMPANION_AZURE_FOUNDRY_STOCK_DETAILS_AGENT_VERSION=0", "immutable"),
    ("FINANCE_COMPANION_AZURE_FOUNDRY_ENDPOINT=https://example.openai.azure.com", "project endpoint"),
    ("FINANCE_COMPANION_AZURE_FOUNDRY_AUTH_MODE=key", "AUTH_MODE=entra"),
    ("FINANCE_COMPANION_AZURE_FOUNDRY_RAI_POLICY_ID=policy-name", "full ARM"),
])
def test_live_launcher_fails_closed_on_unsafe_security_config(tmp_path, override, error):
    result = check(tmp_path, "FINANCE_COMPANION_DIVIDEND_RESEARCH_PROVIDER=azure_foundry\nFINANCE_COMPANION_AZURE_FOUNDRY_ENDPOINT=https://example.services.ai.azure.com/api/projects/research\nFINANCE_COMPANION_AZURE_FOUNDRY_DEPLOYMENT=luna\n" + LIVE_GUARDRAILS + override + "\n")
    assert result.returncode != 0
    assert error in result.stderr
