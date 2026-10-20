"""Execute checked-in workflow Bash with mocked Azure/jq; never contact Azure."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import textwrap

import pytest


REPO = Path(__file__).resolve().parents[3]
WORKFLOWS = REPO / ".github" / "workflows"


def find_bash():
    if os.name == "nt":
        # Prefer Git Bash over the Windows bash.exe shim, which requires WSL.
        git = shutil.which("git")
        if git:
            root = Path(git).parent.parent
            for relative in ("bin/bash.exe", "usr/bin/bash.exe"):
                candidate = root / relative
                if candidate.is_file():
                    return str(candidate)
        return None
    return shutil.which("bash")


BASH = find_bash()
pytestmark = pytest.mark.skipif(not BASH, reason="Bash (Git Bash on Windows) is required")
OPTIONAL_SETTINGS = (
    "AZURE_FOUNDRY_ENDPOINT", "AZURE_FOUNDRY_DEPLOYMENT", "AZURE_FOUNDRY_REASONING_EFFORT",
    "AZURE_FOUNDRY_MANAGED_IDENTITY_RESOURCE_ID", "AZURE_FOUNDRY_MANAGED_IDENTITY_CLIENT_ID",
    "LEGACY_ALPHA_VANTAGE_API_KEY", "ALPHA_VANTAGE_SECRET_REF",
)


def workflow_script(workflow, step):
    # Extract literal Bash blocks from the repository's consistently indented
    # workflows, without adding a YAML dependency to the application test suite.
    source = (WORKFLOWS / workflow).read_text(encoding="utf-8")
    block = source.split(f"      - name: {step}\n", 1)[1].split("\n      - name:", 1)[0]
    marker = "          inlineScript: |\n" if "inlineScript:" in block else "        run: |\n"
    return textwrap.dedent(block.split(marker, 1)[1]).strip() + "\n"


MOCK_COMMANDS = r'''
az() {
  printf '%s\n' "$*" >> "$TEST_AZ_CALLS"
  if [[ "${MOCK_AZ_FAIL:-}" == true ]]; then
    echo 'Mock Azure failure' >&2
    return 42
  fi
  case "$1 $2 ${3:-}" in
    'deployment group show') printf '{}\n' ;;
    'cosmosdb keys list') printf 'mock-connection-string\n' ;;
    'containerapp identity assign') ;;
    'identity show '*) printf 'mock-managed-client\n' ;;
    'containerapp secret set') ;;
    'containerapp update '*) ;;
    'deployment group create')
      for argument in "$@"; do
        if [[ "$argument" == @* ]]; then
          cat "${argument:1}" > "$TEST_SECRET_PARAMS"
        fi
      done
      printf '{}\n'
      ;;
    *) echo "Unexpected mocked Azure operation: $*" >&2; return 99 ;;
  esac
}
jq() {
  if [[ "$1" == -n ]]; then
    local ss='' av=''
    shift
    while [[ "${1:-}" == --arg ]]; do
      case "$2" in
        ss) ss="$3" ;;
        av) av="$3" ;;
        *) echo 'Unexpected jq argument' >&2; return 99 ;;
      esac
      shift 3
    done
    printf '{"sessionSecret":{"value":"%s"},"alphaVantageApiKey":{"value":"%s"}}\n' "$ss" "$av"
  elif [[ "$1" == -r ]]; then
    # Only external JSON selection is mocked; the real workflow controls all
    # fallback logic, shell expansion, command arguments and environment writes.
    case "$2" in
      '.projectEndpoint.value // empty') printf '%s\n' "${MOCK_PROJECT_ENDPOINT-https://example.services.ai.azure.com/api/projects/research}" ;;
      '.deploymentName.value // empty') printf '%s\n' "${MOCK_DEPLOYMENT-gpt-6-luna}" ;;
      '.reasoningEffort.value // "low"') printf '%s\n' "${MOCK_REASONING_EFFORT-low}" ;;
      '.properties.outputs | to_entries[] | '*) ;;
      *) echo "Unexpected mocked jq query: $2" >&2; return 99 ;;
    esac
  else
    echo 'Unexpected mocked jq invocation' >&2
    return 99
  fi
}
'''


def execute_step(tmp_path, workflow, step, settings=None, omit=(), empty_optional=False):
    # Do not inherit developer Azure credentials or configuration into tests.
    environment = {key: os.environ[key] for key in ("PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP") if key in os.environ}
    environment.update({
        "APP_NAME": "finance-companion", "AZURE_RESOURCE_GROUP": "rg-test",
        "COSMOS_ACCOUNT_NAME": "cosmos-test", "COSMOS_TABLE_NAME": "finance",
        "API_CONTAINER_APP_NAME": "api-test", "API_SESSION_SECRET": "offline-test-session-secret-32-characters",
        "IMAGE_NAME": "registry.example.test/api:test", "CORS_ORIGINS": '["https://ui.example.test"]',
        "ENTRA_CLIENT_ID": "test-client", "ENTRA_TENANT_ID": "test-tenant", "ALLOWED_EMAIL": "test@example.test",
        "DIVIDEND_RESEARCH_PROVIDER": "azure_foundry", "AZURE_FOUNDRY_AUTH_MODE": "entra",
        "AZURE_LOCATION": "centralus", "AZURE_STATIC_WEB_APP_LOCATION": "centralus",
        "AZURE_API_TARGET_PORT": "8000", "AZURE_API_MAX_REPLICAS": "1", "AZURE_TABLE_NAME": "finance",
        "API_ENVIRONMENT": "production", "MSYS_NO_PATHCONV": "1",
        "GITHUB_ENV": (tmp_path / "github-env").as_posix(),
        "GITHUB_STEP_SUMMARY": (tmp_path / "summary").as_posix(),
        "TEST_AZ_CALLS": (tmp_path / "az-calls").as_posix(),
        "TEST_SECRET_PARAMS": (tmp_path / "secret-params").as_posix(),
    })
    if empty_optional:
        environment.update({key: "" for key in OPTIONAL_SETTINGS})
    environment.update(settings or {})
    for key in omit:
        environment.pop(key, None)
    script = workflow_script(workflow, step)
    # Match the runner's expression substitution for the Infra Up deployment name.
    script = script.replace("${{ github.run_id }}", "offline-test-run")
    result = subprocess.run(
        [BASH, "--noprofile", "--norc", "-eu", "-o", "pipefail"],
        input=MOCK_COMMANDS + "\n" + script, env=environment, cwd=tmp_path,
        text=True, capture_output=True, timeout=15,
    )
    values = {}
    output_file = tmp_path / "github-env"
    if output_file.exists():
        values = dict(line.split("=", 1) for line in output_file.read_text().splitlines())
    calls_file = tmp_path / "az-calls"
    calls = calls_file.read_text().splitlines() if calls_file.exists() else []
    return result, values, calls


@pytest.mark.parametrize("empty_optional", [False, True], ids=["unset", "empty"])
def test_foundry_discovery_supports_omitted_deployment_and_effort(tmp_path, empty_optional):
    result, values, calls = execute_step(tmp_path, "backend-deploy.yml", "Resolve provisioned Foundry configuration", empty_optional=empty_optional)
    assert result.returncode == 0, result.stderr
    assert values == {
        "AZURE_FOUNDRY_ENDPOINT": "https://example.services.ai.azure.com/api/projects/research",
        "AZURE_FOUNDRY_DEPLOYMENT": "gpt-6-luna", "AZURE_FOUNDRY_REASONING_EFFORT": "low",
    }
    assert len(calls) == 1 and "deployment group show" in calls[0]


def test_foundry_discovery_preserves_explicit_deployment_and_effort(tmp_path):
    result, values, _ = execute_step(tmp_path, "backend-deploy.yml", "Resolve provisioned Foundry configuration", {
        "AZURE_FOUNDRY_DEPLOYMENT": "custom-deployment", "AZURE_FOUNDRY_REASONING_EFFORT": "medium",
    })
    assert result.returncode == 0, result.stderr
    assert values["AZURE_FOUNDRY_DEPLOYMENT"] == "custom-deployment"
    assert "AZURE_FOUNDRY_REASONING_EFFORT" not in values


@pytest.mark.parametrize("missing", ["MOCK_PROJECT_ENDPOINT", "MOCK_DEPLOYMENT"])
def test_foundry_discovery_reports_missing_provisioned_configuration(tmp_path, missing):
    result, _, _ = execute_step(tmp_path, "backend-deploy.yml", "Resolve provisioned Foundry configuration", {missing: ""})
    assert result.returncode != 0
    assert "Run the Foundry infrastructure tranche" in result.stderr
    assert "unbound variable" not in result.stderr


def test_foundry_discovery_propagates_azure_failure(tmp_path):
    result, values, _ = execute_step(tmp_path, "backend-deploy.yml", "Resolve provisioned Foundry configuration", {"MOCK_AZ_FAIL": "true"})
    assert result.returncode == 42
    assert values == {}


@pytest.mark.parametrize("empty_optional", [False, True], ids=["unset", "empty"])
def test_secret_configuration_does_not_require_legacy_market_data_key(tmp_path, empty_optional):
    result, values, calls = execute_step(tmp_path, "backend-deploy.yml", "Configure API secrets", empty_optional=empty_optional)
    assert result.returncode == 0, result.stderr
    assert values["ALPHA_VANTAGE_SECRET_REF"] == ""
    assert len(calls) == 2
    assert "cosmos-table-connection-string=" in calls[1] and "alpha-vantage-api-key=" not in calls[1]


def test_secret_configuration_preserves_explicit_legacy_key(tmp_path):
    result, values, calls = execute_step(tmp_path, "backend-deploy.yml", "Configure API secrets", {"LEGACY_ALPHA_VANTAGE_API_KEY": "offline-test-key"})
    assert result.returncode == 0, result.stderr
    assert values["ALPHA_VANTAGE_SECRET_REF"] == "secretref:alpha-vantage-api-key"
    assert len(calls) == 3 and "alpha-vantage-api-key=offline-test-key" in calls[-1]


@pytest.mark.parametrize("empty_optional", [False, True], ids=["unset", "empty"])
def test_system_identity_does_not_require_user_assigned_identity(tmp_path, empty_optional):
    result, values, calls = execute_step(tmp_path, "backend-deploy.yml", "Enable Foundry runtime managed identity", empty_optional=empty_optional)
    assert result.returncode == 0, result.stderr
    assert values["AZURE_FOUNDRY_MANAGED_IDENTITY_CLIENT_ID"] == ""
    assert len(calls) == 1 and "--system-assigned" in calls[0]


def test_explicit_user_assigned_identity_is_preserved(tmp_path):
    identity = "/subscriptions/test/resourceGroups/rg/providers/Microsoft.ManagedIdentity/userAssignedIdentities/runtime"
    result, values, calls = execute_step(tmp_path, "backend-deploy.yml", "Enable Foundry runtime managed identity", {"AZURE_FOUNDRY_MANAGED_IDENTITY_RESOURCE_ID": identity})
    assert result.returncode == 0, result.stderr
    assert values["AZURE_FOUNDRY_MANAGED_IDENTITY_CLIENT_ID"] == "mock-managed-client"
    assert len(calls) == 3 and f"--user-assigned {identity}" in calls[1]


@pytest.mark.parametrize("empty_optional", [False, True], ids=["unset", "empty"])
@pytest.mark.parametrize("provider", ["stub", "azure_foundry"])
def test_api_deployment_supports_optional_configuration(tmp_path, provider, empty_optional):
    settings = {"DIVIDEND_RESEARCH_PROVIDER": provider}
    if provider == "azure_foundry":
        settings.update({"AZURE_FOUNDRY_ENDPOINT": "https://example.openai.azure.com", "AZURE_FOUNDRY_DEPLOYMENT": "custom-model"})
    result, _, calls = execute_step(tmp_path, "backend-deploy.yml", "Deploy API image", settings, empty_optional=empty_optional)
    assert result.returncode == 0, result.stderr
    assert len(calls) == 1
    assert f"FINANCE_COMPANION_DIVIDEND_RESEARCH_PROVIDER={provider}" in calls[0]
    assert "FINANCE_COMPANION_AZURE_FOUNDRY_REASONING_EFFORT=" in calls[0]
    if provider == "azure_foundry":
        assert "FINANCE_COMPANION_AZURE_FOUNDRY_DEPLOYMENT=custom-model" in calls[0]


@pytest.mark.parametrize("empty_optional", [False, True], ids=["unset", "empty"])
def test_infra_up_supports_stub_without_optional_foundry_settings_or_keys(tmp_path, empty_optional):
    result, _, calls = execute_step(tmp_path, "infra-up.yml", "Deploy Runtime API", {"DIVIDEND_RESEARCH_PROVIDER": "stub"}, empty_optional=empty_optional)
    assert result.returncode == 0, result.stderr
    assert len(calls) == 1 and "deployment group create" in calls[0]
    assert "dividendResearchProvider=stub" in calls[0]
    assert "azureFoundryManagedIdentityResourceId=" in calls[0]
    assert json.loads((tmp_path / "secret-params").read_text())["alphaVantageApiKey"]["value"] == ""


def test_infra_up_preserves_explicit_optional_configuration(tmp_path):
    result, _, calls = execute_step(tmp_path, "infra-up.yml", "Deploy Runtime API", {
        "AZURE_FOUNDRY_ENDPOINT": "https://example.openai.azure.com", "AZURE_FOUNDRY_DEPLOYMENT": "custom-model",
        "AZURE_FOUNDRY_REASONING_EFFORT": "medium", "AZURE_FOUNDRY_MANAGED_IDENTITY_RESOURCE_ID": "test-identity",
        "LEGACY_ALPHA_VANTAGE_API_KEY": "offline-test-key",
    })
    assert result.returncode == 0, result.stderr
    assert len(calls) == 2 and "identity show --ids test-identity" in calls[0]
    assert "azureFoundryDeployment=custom-model" in calls[1]
    assert "azureFoundryReasoningEffort=medium" in calls[1]
    assert "azureFoundryManagedIdentityClientId=mock-managed-client" in calls[1]
    assert json.loads((tmp_path / "secret-params").read_text())["alphaVantageApiKey"]["value"] == "offline-test-key"


def test_infra_up_development_does_not_require_entra_configuration(tmp_path):
    result, _, calls = execute_step(tmp_path, "infra-up.yml", "Deploy Runtime API", {
        "API_ENVIRONMENT": "development", "DIVIDEND_RESEARCH_PROVIDER": "stub",
    }, omit=("ENTRA_CLIENT_ID", "ENTRA_TENANT_ID"))
    assert result.returncode == 0, result.stderr
    assert len(calls) == 1 and "entraClientId=" in calls[0]


@pytest.mark.parametrize("workflow,step", [("backend-deploy.yml", "Deploy API image"), ("infra-up.yml", "Deploy Runtime API")])
@pytest.mark.parametrize("missing", ["ENTRA_CLIENT_ID", "ENTRA_TENANT_ID", "ALLOWED_EMAIL"])
def test_production_configuration_still_fails_actionably_when_required_values_are_missing(tmp_path, workflow, step, missing):
    result, _, calls = execute_step(tmp_path, workflow, step, omit=(missing,))
    assert result.returncode != 0
    assert "Configure ENV_PROD_" in result.stderr
    assert "unbound variable" not in result.stderr
    assert calls == []


@pytest.mark.parametrize("missing", ["AZURE_FOUNDRY_ENDPOINT", "AZURE_FOUNDRY_DEPLOYMENT"])
def test_foundry_provider_still_requires_endpoint_and_deployment(tmp_path, missing):
    settings = {"AZURE_FOUNDRY_ENDPOINT": "https://example.openai.azure.com", "AZURE_FOUNDRY_DEPLOYMENT": "custom-model"}
    settings.pop(missing)
    result, _, calls = execute_step(tmp_path, "backend-deploy.yml", "Validate distribution provider configuration", settings)
    assert result.returncode != 0
    assert f"Set {missing}" in result.stderr
    assert "unbound variable" not in result.stderr
    assert calls == []
