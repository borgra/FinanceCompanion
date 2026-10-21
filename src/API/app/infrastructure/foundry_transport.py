"""Bounded Responses transport shared by the separate Foundry research agents."""
from __future__ import annotations

import ipaddress
import json
import logging
from pathlib import Path
import re
import time
from queue import Queue, Empty
from threading import BoundedSemaphore, Thread
from urllib.parse import quote, urlsplit

import httpx

MAX_SOURCE_BYTES = 500_000
_HTTP_SLOTS = BoundedSemaphore(8)
_LOGGER = logging.getLogger(__name__)
RAI_POLICY_PATTERN = r"/subscriptions/[0-9a-fA-F-]{36}/resourceGroups/[A-Za-z0-9._()-]+/providers/Microsoft.CognitiveServices/accounts/[A-Za-z0-9-]+/raiPolicies/[A-Za-z0-9._-]+"
AGENT_NAME_PATTERN = r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"


class FoundryTransportError(Exception):
    """Safe, provider-neutral transport failure."""


def guardrail_rejected(event: str, reference: dict | None = None) -> None:
    # Only internal event codes are logged. Never log input, model output,
    # source excerpts, credentials, policy contents, or exception bodies.
    reference = reference if isinstance(reference, dict) else {}
    name, version = reference.get("name"), reference.get("version")
    name = name if isinstance(name, str) and re.fullmatch(AGENT_NAME_PATTERN, name) else "unavailable"
    version = version if isinstance(version, str) and re.fullmatch(r"[1-9][0-9]{0,18}", version) else "unavailable"
    _LOGGER.warning("Foundry guardrail rejected research: %s agent=%s version=%s", event, name, version)


def _service_blocked(value) -> bool:
    if isinstance(value, dict):
        for key, item in value.items():
            lowered = key.lower()
            if lowered in {"blocked", "filtered", "policy_violation", "content_filter_violation", "refusal"} and item not in (None, False, "", [], {}):
                return True
            if lowered in {"type", "status", "finish_reason", "code"} and isinstance(item, str):
                if item.lower().replace("-", "_") in {"refusal", "blocked", "failed", "incomplete", "cancelled", "content_filter", "content_filter_violation", "responsibleaipolicyviolation", "jailbreak_detected"}:
                    return True
            if _service_blocked(item):
                return True
    elif isinstance(value, list):
        return any(_service_blocked(item) for item in value)
    return False


def validate_agent_response(response: dict, expected_reference: dict | None = None) -> None:
    """Reject service filtering/refusals even when the outer status is completed."""
    def reject(event):
        guardrail_rejected(event, expected_reference)
        raise FoundryTransportError("Foundry research was blocked or returned an invalid agent response. Saved records were kept.")

    if not isinstance(response, dict) or response.get("status") != "completed" or response.get("error") or response.get("incomplete_details"):
        reject("incomplete_response")
    if expected_reference is not None and response.get("agent_reference") is not None and response["agent_reference"] != expected_reference:
        guardrail_rejected("agent_reference_mismatch", expected_reference)
        raise FoundryTransportError("Foundry research returned a different agent reference. Saved records were kept.")
    outputs = response.get("output")
    if not isinstance(outputs, list):
        reject("invalid_output")
    for output in outputs:
        if not isinstance(output, dict) or output.get("type") not in {"web_search_call", "message", "reasoning"}:
            reject("unexpected_tool_output")
        if output.get("status", "completed") != "completed":
            reject("incomplete_tool_output")
        if output["type"] == "message":
            content = output.get("content")
            if not isinstance(content, list) or any(not isinstance(item, dict) or item.get("type") != "output_text" for item in content):
                reject("refusal_or_unexpected_content")

    if _service_blocked(response):
        reject("service_filter_block")


def completed_web_source_urls(response: dict) -> set[str]:
    """Only sources returned by completed web tools ground an accepted fact.

    Model-generated JSON and message citations cannot invent tool evidence.
    Traceability still does not independently verify the publisher's facts.
    """
    sources = set()
    for output in response.get("output", []):
        if not isinstance(output, dict) or output.get("type") != "web_search_call" or output.get("status") != "completed":
            continue
        action = output.get("action")
        if not isinstance(action, dict) or not isinstance(action.get("sources"), list):
            continue
        for source in action["sources"]:
            if isinstance(source, dict) and isinstance(source.get("url"), str) and public_evidence_url(source["url"]):
                sources.add(source["url"])
    return sources


def load_agent_definition(kind: str) -> tuple[str, dict]:
    if kind not in {"dividend-history", "stock-details"}:
        raise FoundryTransportError("Unknown Foundry agent definition.")
    location = Path(__file__).resolve()
    local = location.parents[4] / "infra" / "agents" if len(location.parents) > 4 else location.parent / "agents"
    directory = local if local.is_dir() else location.parent / "agents"
    try:
        instructions = (directory / f"{kind}-agent.md").read_text(encoding="utf-8")
        schema = json.loads((directory / f"{kind}-agent.schema.json").read_text(encoding="utf-8"))
        if not instructions.strip() or schema.get("type") != "object":
            raise ValueError("invalid definition")
        return instructions, schema
    except (OSError, ValueError, AttributeError):
        raise FoundryTransportError("The Foundry agent definition is missing or invalid. Rebuild the API with infra/agents included.") from None


def re_numeric_host(host: str) -> bool:
    # Reject IPv4 shorthand/alternate numeric encodings that ipaddress does not
    # recognize (127.1, 0177.0.0.1, 0x7f.0.0.1). No URL is fetched by this helper.
    parts = host.split(".")
    return all(part.isdigit() or (part.lower().startswith("0x") and all(c in "0123456789abcdef" for c in part[2:].lower())) for part in parts)


def public_evidence_url(value: str) -> bool:
    try:
        if not isinstance(value, str) or any(char.isspace() or ord(char) < 32 or ord(char) == 127 for char in value):
            return False
        url = urlsplit(value)
        if url.scheme != "https" or not url.hostname or url.username or url.password or url.port not in {None, 443}:
            return False
    except ValueError:
        return False
    host = url.hostname.lower().rstrip(".")
    try:
        ascii_host = host.encode("idna").decode("ascii")
    except UnicodeError:
        return False
    if (len(ascii_host) > 253 or url.hostname.endswith("..")
            or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", part) for part in ascii_host.split("."))):
        return False
    if host == "localhost" or re_numeric_host(host):
        return False
    if "." not in host or host.endswith((".local", ".localhost", ".internal", ".test")):
        return False
    try:
        return ipaddress.ip_address(host).is_global
    except ValueError:
        return True


class FoundryResponsesTransport:
    def __init__(self, *, endpoint: str, deployment: str, auth_mode: str = "entra", api_key: str | None = None, client: httpx.Client | None = None, token_provider=None, management_token_provider=None, managed_identity_client_id: str | None = None, environment: str = "development", reasoning_effort: str | None = None, error_type=FoundryTransportError):
        self._error_type = error_type
        base = endpoint.rstrip("/")
        if not base.endswith("/openai/v1"):
            base += "/openai/v1"
        self._url = base + "/responses"
        self._deployment = deployment
        self._reasoning_effort = reasoning_effort
        self._auth_mode = auth_mode
        self._api_key = api_key
        self._client = client or httpx.Client(timeout=httpx.Timeout(55, connect=3), follow_redirects=False)
        self._token_provider = token_provider
        self._management_token_provider = management_token_provider or token_provider
        if auth_mode == "entra" and token_provider is None:
            from azure.identity import DefaultAzureCredential, ManagedIdentityCredential, get_bearer_token_provider
            if environment == "development":
                credential = DefaultAzureCredential(process_timeout=5, exclude_managed_identity_credential=True,
                    exclude_environment_credential=True, exclude_workload_identity_credential=True,
                    exclude_shared_token_cache_credential=True, exclude_visual_studio_code_credential=True,
                    exclude_developer_cli_credential=True, exclude_powershell_credential=True,
                    exclude_interactive_browser_credential=True, exclude_broker_credential=True,
                    connection_timeout=3, read_timeout=5, retry_total=0)
            else:
                credential = ManagedIdentityCredential(client_id=managed_identity_client_id, connection_timeout=3, read_timeout=5, retry_total=0)
            self._token_provider = get_bearer_token_provider(credential, "https://ai.azure.com/.default")
            self._management_token_provider = management_token_provider or get_bearer_token_provider(credential, "https://management.azure.com/.default")

    def _post_bounded(self, headers: dict, payload: dict, timeout: float, deadline: float) -> httpx.Response:
        return self._request_bounded("POST", self._url, headers, payload, timeout, deadline)

    def _request_bounded(self, method: str, url: str, headers: dict, payload: dict | None, timeout: float, deadline: float) -> httpx.Response:
        # httpx read timeouts reset per packet. Bound caller latency independently
        # so slow headers plus a later stalled read cannot double the total budget.
        # Workers do no persistence and remain capped even after a caller times out.
        return self._work_bounded(lambda: self._read_bounded(headers, payload, timeout, deadline, method=method, url=url), deadline)

    def _work_bounded(self, operation, deadline: float):
        if time.monotonic() >= deadline:
            raise httpx.ReadTimeout("research time budget")
        if not _HTTP_SLOTS.acquire(blocking=False):
            raise self._error_type("Foundry research is busy. Saved details were kept; retry later.")
        result = Queue(maxsize=1)
        def read():
            try:
                result.put((True, operation()))
            except Exception as exc:
                result.put((False, exc))
            finally:
                _HTTP_SLOTS.release()
        Thread(target=read, daemon=True, name="foundry-response").start()
        try:
            ok, value = result.get(timeout=max(0, deadline - time.monotonic()))
        except Empty:
            raise httpx.ReadTimeout("research time budget") from None
        if not ok:
            raise value
        if time.monotonic() >= deadline:
            raise httpx.ReadTimeout("research time budget")
        return value

    def _read_bounded(self, headers: dict, payload: dict | None, timeout: float, deadline: float, *, method: str = "POST", url: str | None = None) -> httpx.Response:
        with self._client.stream(method, url or self._url, headers=headers, json=payload, timeout=httpx.Timeout(timeout, connect=min(3, timeout), write=min(5, timeout), pool=min(3, timeout))) as response:
            chunks, size = [], 0
            for chunk in response.iter_bytes():
                size += len(chunk)
                if size > MAX_SOURCE_BYTES or time.monotonic() > deadline:
                    raise self._error_type("Foundry distribution validation exceeded its response size or time limit.")
                chunks.append(chunk)
            # iter_bytes has already decoded HTTP compression. Keeping the wire
            # encoding on the buffered response would make httpx decode twice.
            headers = dict(response.headers)
            headers.pop("content-encoding", None)
            headers.pop("content-length", None)
            return httpx.Response(response.status_code, headers=headers, content=b"".join(chunks), request=response.request)

    def _headers(self, deadline: float, *, management: bool = False) -> dict:
        if time.monotonic() >= deadline:
            raise httpx.ReadTimeout("research time budget")
        headers = {"Content-Type": "application/json"}
        if self._auth_mode == "key" and not management:
            headers["api-key"] = self._api_key or ""
        else:
            provider = self._management_token_provider if management else self._token_provider
            if provider is None:
                raise self._error_type("Foundry policy verification requires Azure management-plane authentication. Saved records were kept.")
            headers["Authorization"] = "Bearer " + self._work_bounded(provider, deadline)
        if time.monotonic() >= deadline:
            raise httpx.ReadTimeout("research time budget")
        return headers

    def get_registered_agent(self, name: str, version: str | None, deadline: float) -> dict:
        """Read trusted project metadata; never create or repair agents at runtime."""
        try:
            parsed = urlsplit(self._url)
            path = parsed.path.removesuffix("/openai/v1/responses")
            if (self._auth_mode != "entra" or parsed.scheme != "https"
                    or not parsed.hostname or not parsed.hostname.endswith(".services.ai.azure.com")
                    or parsed.username or parsed.password or parsed.port not in {None, 443} or parsed.query or parsed.fragment
                    or not re.fullmatch(r"/api/projects/[A-Za-z0-9._-]+", path)
                    or not isinstance(name, str) or not re.fullmatch(AGENT_NAME_PATTERN, name)
                    or (version is not None and not re.fullmatch(r"[A-Za-z0-9._-]{1,64}", version))):
                raise self._error_type("Registered stock agents require a Foundry project endpoint, Entra authentication, and a valid agent reference.")
            url = f"{parsed.scheme}://{parsed.netloc}{path}/agents/{quote(name, safe='')}"
            if version:
                url += f"/versions/{quote(version, safe='')}"
            headers = self._headers(deadline)
            remaining = deadline - time.monotonic()
            response = self._request_bounded("GET", url + "?api-version=v1", headers, None, min(10, remaining), deadline)
            if response.status_code == 404:
                raise self._error_type("The registered stock-details agent or version was not found. Register the approved agent before refreshing; saved details were kept.")
            if response.status_code in {401, 403}:
                raise self._error_type("Access to the registered stock-details agent was denied. Check Foundry project permissions; saved details were kept.")
            response.raise_for_status()
            agent = response.json()
            if not isinstance(agent, dict) or agent.get("name") != name:
                raise ValueError("wrong agent")
            resolved = agent if version else agent.get("versions", {}).get("latest")
            if (not isinstance(resolved, dict) or resolved.get("name") != name
                    or not isinstance(resolved.get("version"), str)
                    or not re.fullmatch(r"[A-Za-z0-9._-]{1,64}", resolved["version"])
                    or (version and resolved["version"] != version)):
                raise ValueError("invalid agent version")
            return resolved
        except self._error_type:
            raise
        except httpx.TimeoutException:
            raise self._error_type("Registered stock agent verification timed out. Saved details were kept; retry later.") from None
        except Exception:
            raise self._error_type("Unable to verify the registered stock-details agent. Saved details were kept; no model fallback is allowed.") from None

    def verify_registered_agent(self, *, kind: str, name: str, version: str | None, deployment: str,
                                rai_policy_id: str | None, deadline: float) -> dict:
        """Pin and verify approved instructions/tools/schema and project RAI policy."""
        try:
            if (kind not in {"stock-details", "dividend-history"}
                    or not isinstance(version, str) or not re.fullmatch(r"[1-9][0-9]{0,18}", version)
                    or not isinstance(rai_policy_id, str) or not re.fullmatch(RAI_POLICY_PATTERN, rai_policy_id)):
                raise ValueError("missing pinned policy or version")
            instructions, schema = load_agent_definition(kind)
            agent = self.get_registered_agent(name, version, deadline)
            definition = agent.get("definition")
            if not isinstance(definition, dict):
                raise ValueError("missing definition")
            expected = {"kind": "prompt", "model": deployment, "tools": [{"type": "web_search"}],
                "tool_choice": "required", "reasoning": {"effort": "low"},
                "text": {"format": {"type": "json_schema", "name": "stock_details_result" if kind == "stock-details" else "dividend_history_result",
                                    "strict": True, "schema": schema}}}
            actual_instructions = definition.get("instructions")
            if (not isinstance(actual_instructions, str)
                    or actual_instructions.replace("\r\n", "\n").strip() != instructions.replace("\r\n", "\n").strip()
                    or any(json.dumps(definition.get(key), sort_keys=True) != json.dumps(value, sort_keys=True) for key, value in expected.items())
                    or definition.get("rai_config") != {"rai_policy_name": rai_policy_id}):
                raise ValueError("definition mismatch")
            self._verify_policy_integrity(rai_policy_id, deployment, deadline, {"name": name, "version": version})
            _LOGGER.info("Foundry approved agent verified: kind=%s name=%s version=%s", kind, name, version)
            return agent
        except self._error_type:
            raise
        except Exception:
            guardrail_rejected("registered_definition_mismatch", {"name": name, "version": version})
            raise self._error_type("The registered agent version, policy or definition does not match the approved guardrails. Saved records were kept.") from None

    def _verify_policy_integrity(self, rai_policy_id: str, deployment: str, deadline: float, reference: dict | None = None) -> None:
        """Re-read policy and attachment on every research request; no stale cache."""
        try:
            if not isinstance(deployment, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", deployment):
                raise ValueError("invalid deployment")
            account_id, _, policy_name = rai_policy_id.rpartition("/raiPolicies/")
            account_name = account_id.rsplit("/accounts/", 1)[-1]
            if (urlsplit(self._url).hostname or "").split(".")[0].casefold() != account_name.casefold():
                raise ValueError("policy belongs to another account")
            def read(resource_id):
                headers = self._headers(deadline, management=True)
                remaining = deadline - time.monotonic()
                response = self._request_bounded("GET", "https://management.azure.com" + resource_id + "?api-version=2025-06-01",
                    headers, None, min(10, remaining), deadline)
                response.raise_for_status()
                data = response.json()
                if not isinstance(data, dict):
                    raise ValueError("invalid management resource")
                return data

            policy = read(rai_policy_id)
            if not isinstance(policy.get("id"), str) or policy["id"].casefold() != rai_policy_id.casefold():
                raise ValueError("wrong policy resource")
            properties = policy.get("properties")
            if not isinstance(properties, dict) or properties.get("basePolicyName") != "Microsoft.DefaultV2" or properties.get("mode") != "Blocking":
                raise ValueError("nonblocking policy")
            filters = properties.get("contentFilters")
            if not isinstance(filters, list):
                raise ValueError("missing filters")
            required = {(name, source) for name in ("Hate", "Sexual", "Violence", "Selfharm") for source in ("Prompt", "Completion")}
            required.update({("Jailbreak", "Prompt"), ("Indirect Attack", "Prompt")})
            for name, source in required:
                entries = [item for item in filters if isinstance(item, dict) and item.get("name") == name and item.get("source") == source]
                if (len(entries) != 1 or entries[0].get("enabled") is not True or entries[0].get("blocking") is not True
                        or (name not in {"Jailbreak", "Indirect Attack"} and entries[0].get("severityThreshold") not in {"Low", "Medium"})):
                    raise ValueError("missing or widened blocking filter")
            attachment = read(account_id + "/deployments/" + quote(deployment, safe=""))
            if not isinstance(attachment.get("properties"), dict) or attachment["properties"].get("raiPolicyName") != policy_name:
                raise ValueError("deployment policy mismatch")
            model = attachment["properties"].get("model")
            if not isinstance(model, dict) or model.get("name") != "gpt-6-luna" or model.get("format") != "OpenAI":
                raise ValueError("deployment model mismatch")
        except Exception:
            guardrail_rejected("policy_integrity_rejected", reference)
            raise self._error_type("Foundry safety policy integrity could not be verified. Saved records were kept; restore the approved blocking policy and deployment attachment.") from None

    def _call(self, payload: dict, deadline: float, *, registered_agent: bool = False) -> dict:
        try:
            if registered_agent:
                reference = payload.get("agent_reference", {})
                allowed = {"agent_reference", "input", "include", "metadata", "max_output_tokens", "max_tool_calls"}
                if (not isinstance(reference, dict) or set(payload) - allowed or set(reference) != {"name", "version", "type"}
                        or reference.get("type") != "agent_reference" or not reference.get("name") or not reference.get("version")
                        or not isinstance(reference.get("name"), str) or not re.fullmatch(AGENT_NAME_PATTERN, reference["name"])
                        or not isinstance(reference.get("version"), str) or not re.fullmatch(r"[1-9][0-9]{0,18}", reference["version"])
                        or not isinstance(payload.get("input"), list) or len(payload["input"]) != 1
                        or any(not isinstance(item, dict) or set(item) != {"role", "content"} or item.get("role") != "user"
                               or not isinstance(item.get("content"), str) or len(item["content"]) > 2048 for item in payload["input"])):
                    raise self._error_type("Stock research must invoke the approved registered agent without instruction, tool, schema or model overrides.")
            elif self._reasoning_effort:
                payload = {"reasoning": {"effort": self._reasoning_effort}, **payload}
            # Foundry's project gateway requires the Responses input-item tag;
            # do not rely on OpenAI's shorthand message-shape inference.
            if isinstance(payload.get("input"), list):
                payload = {**payload, "input": [
                    {"type": "message", "role": item["role"], "content": [{"type": "input_text", "text": item["content"]}]}
                    if isinstance(item, dict) and "role" in item and isinstance(item.get("content"), str) else item
                    for item in payload["input"]
                ]}
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise httpx.ReadTimeout("research time budget")
            headers = self._headers(deadline)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise httpx.ReadTimeout("research time budget")
            body = {"store": False, **payload} if registered_agent else {"model": self._deployment, "store": False, **payload}
            response = self._post_bounded(headers, body, min(55, remaining), deadline)
            if response.status_code == 400:
                try:
                    blocked = _service_blocked(response.json())
                except (ValueError, TypeError, RecursionError):
                    blocked = False
                if blocked:
                    guardrail_rejected("service_content_filter_block", payload.get("agent_reference"))
                    raise self._error_type("Foundry safety filters blocked this research. Saved records were kept; review the requested public security identity and approved policy.")
            if response.status_code in {401, 403}:
                raise self._error_type("Foundry web research permission or authentication failed. Check Azure CLI login locally or the Container App managed identity roles, and whether web search is enabled.")
            if response.status_code == 429:
                raise self._error_type("Foundry web research is rate limited. Please retry later.")
            if response.status_code in {400, 404, 422}:
                raise self._error_type("Foundry web research could not use the configured endpoint or deployment. Choose a Responses deployment supporting web_search and structured output, and check that Azure has not blocked the web_search tool.")
            response.raise_for_status()
            data = response.json()
            if data.get("status") != "completed":
                raise self._error_type("Foundry web research did not complete. Existing records were preserved; retry or check deployment output limits.")
            if registered_agent:
                try:
                    validate_agent_response(data, reference)
                except FoundryTransportError as exc:
                    raise self._error_type(str(exc)) from None
            return data
        except self._error_type:
            raise
        except httpx.TimeoutException:
            raise self._error_type("Foundry web research timed out. Existing records were preserved. Please retry.") from None
        except Exception:
            raise self._error_type("Foundry web research failed. Check your Azure login, endpoint and deployment configuration.") from None

    def call(self, payload: dict, deadline: float) -> dict:
        return self._call(payload, deadline)

    def call_agent(self, payload: dict, deadline: float) -> dict:
        return self._call(payload, deadline, registered_agent=True)
