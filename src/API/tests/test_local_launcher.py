"""Check config-only launcher behavior without starting services or using credentials."""
from pathlib import Path
import shutil
import subprocess

import pytest

REPO = Path(__file__).resolve().parents[3]
POWERSHELL = shutil.which('powershell') or shutil.which('pwsh')
pytestmark = pytest.mark.skipif(not POWERSHELL, reason='PowerShell is not installed')


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


def test_foundry_web_research_needs_only_endpoint_deployment_and_entra(tmp_path):
    result = check(tmp_path, 'FINANCE_COMPANION_DIVIDEND_RESEARCH_PROVIDER=azure_foundry\nFINANCE_COMPANION_AZURE_FOUNDRY_ENDPOINT=https://example.services.ai.azure.com/api/projects/income\nFINANCE_COMPANION_AZURE_FOUNDRY_DEPLOYMENT=research-deployment\nFINANCE_COMPANION_AZURE_FOUNDRY_AUTH_MODE=entra\n')
    assert result.returncode == 0, result.stderr
    assert 'provider: azure_foundry' in result.stdout
    assert 'ALPHA_VANTAGE_API_KEY' not in result.stdout + result.stderr


def test_removed_distribution_adapters_cannot_be_selected(tmp_path):
    result = check(tmp_path, 'FINANCE_COMPANION_DIVIDEND_RESEARCH_PROVIDER=alpha_vantage\n')
    assert result.returncode != 0
    assert 'stub or azure_foundry' in result.stderr


def test_quoted_values_are_supported(tmp_path):
    result = check(tmp_path, 'FINANCE_COMPANION_DIVIDEND_RESEARCH_PROVIDER="azure_foundry"\nFINANCE_COMPANION_AZURE_FOUNDRY_ENDPOINT="https://example.openai.azure.com"\nFINANCE_COMPANION_AZURE_FOUNDRY_DEPLOYMENT="research-deployment"\n')
    assert result.returncode == 0, result.stderr


def test_browser_login_requires_matching_configuration(tmp_path):
    result = check(tmp_path, 'FINANCE_COMPANION_DISABLE_AUTH_FOR_LOCAL_DEVELOPMENT=false\n')
    assert result.returncode != 0
    assert 'VITE_AUTH_MODE=entra' in result.stderr
