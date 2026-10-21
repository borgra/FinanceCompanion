"""Registered-agent-only stock research; persistence belongs to the use case."""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
import json
import hashlib
from math import isfinite
import re
import time
from zoneinfo import ZoneInfo

import httpx

from app.domain.exceptions import SecurityDetailsUnavailableError
from app.domain.models import SecurityMetadata
from app.domain.security_details import (
    DETAIL_FIELDS, SecurityDetailsResult, canonical_asset_type, canonical_exchange,
)
from app.infrastructure.foundry_transport import (
    FoundryResponsesTransport, FoundryTransportError, completed_web_source_urls, load_agent_definition, public_evidence_url,
)

PROMPT_VERSION = "stock-details-agent-v1"
SUPPORTED_EXCHANGES = {"NASDAQ", "NYSE", "NYSE ARCA", "AMEX", "NYSE AMERICAN", "BATS", "CBOE"}
MARKET_TIMEZONE = ZoneInfo("America/New_York")
RESULT_KEYS = {
    "schema_version", "symbol", "name", "exchange", "asset_type", "currency", "status",
    "price_kind", "sources", "field_evidence", "warnings", "error", *DETAIL_FIELDS,
}


def _fail(message: str = "Stock research returned invalid or unsupported details. Existing values were preserved."):
    raise SecurityDetailsUnavailableError(message)


def _text(value, limit: int) -> bool:
    return isinstance(value, str) and bool(value.strip()) and len(value) <= limit


def _object(value, keys: set[str]) -> bool:
    return isinstance(value, dict) and set(value) == keys


def _number(value, *, zero: bool = False, maximum: float | None = None) -> bool:
    if type(value) not in {int, float}:
        return False
    try:
        return isfinite(value) and (value >= 0 if zero else value > 0) and (maximum is None or value <= maximum)
    except OverflowError:
        return False


def _fresh(value, now: datetime, days: int) -> bool:
    if not _text(value, 64):
        return False
    try:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            observed = date.fromisoformat(value)
            return 0 <= (now.astimezone(MARKET_TIMEZONE).date() - observed).days <= days
        observed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return observed.tzinfo is not None and timedelta() <= now - observed <= timedelta(days=days)
    except (ValueError, TypeError, OverflowError):
        return False


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def _reject_constant(value):
    raise ValueError("non-JSON number")


def _same_fund(saved_name: str, found_name: str) -> bool:
    def words(name):
        return [word for word in re.findall(r"[a-z0-9]+", name.lower()) if word not in {"fund", "funds", "shares", "the", "of", "inc"}]

    saved_words, found_words = words(saved_name), words(found_name)
    if not saved_words or not found_words or saved_words[0] != found_words[0]:
        return False
    saved, found = set(saved_words), set(found_words)
    classes = {"admiral", "investor", "investors", "institutional", "instl", "retirement", "premium", "select"}
    # An overlapping fund family/index name cannot establish a different share
    # class or numeric index (500 versus 1000, R5 versus R6, Class A versus C).
    if saved & classes != found & classes:
        return False
    if {word for word in saved if any(char.isdigit() for char in word)} != {word for word in found if any(char.isdigit() for char in word)}:
        return False
    class_label = lambda name: re.findall(r"\bclass\s+([a-z0-9]+)\b", name.lower())
    return (class_label(saved_name) == class_label(found_name)
            and len(saved & found) / len(saved) >= 0.75
            and len(saved & found) / len(found) >= 0.75)


def _response_json(response: dict) -> tuple[dict, set[str]]:
    if not isinstance(response, dict) or response.get("status") != "completed" or not isinstance(response.get("output"), list):
        _fail("Stock research did not complete. Existing values were preserved; please retry.")
    completed_search = False
    urls = completed_web_source_urls(response)
    texts = []
    for output in response["output"]:
        if not isinstance(output, dict):
            _fail()
        if output.get("type") == "web_search_call" and output.get("status") == "completed":
            completed_search = True
        if output.get("type") == "message":
            if output.get("status", "completed") != "completed" or not isinstance(output.get("content"), list):
                _fail()
            for content in output["content"]:
                if not isinstance(content, dict) or content.get("type") == "refusal":
                    _fail("Stock research could not return sourced details. Existing values were preserved.")
                if content.get("type") == "output_text":
                    if not isinstance(content.get("text"), str):
                        _fail()
                    texts.append(content["text"])
    if not completed_search or not urls or len(texts) != 1:
        _fail("Stock research lacks completed web search and source evidence. Existing values were preserved.")
    try:
        data = json.loads(texts[0], object_pairs_hook=_unique_object, parse_constant=_reject_constant)
    except (ValueError, TypeError, RecursionError):
        _fail()
    if not _object(data, RESULT_KEYS):
        _fail()
    return data, urls


def _validate(data: dict, tool_urls: set[str], security: SecurityMetadata, now: datetime) -> tuple[dict, list, list, list]:
    asset = canonical_asset_type(security.asset_type)
    if type(data["schema_version"]) is not int or data["schema_version"] != 1:
        _fail()
    for field, limit in (("symbol", 24), ("name", 250), ("exchange", 64), ("currency", 8)):
        if not _text(data[field], limit):
            _fail()
    if (data["symbol"].strip().upper() != security.symbol.strip().upper()
            or canonical_exchange(data["exchange"]) != canonical_exchange(security.exchange)
            or data["asset_type"] not in {"Stock", "ETF", "Mutual Fund"}
            or data["asset_type"] != asset or data["currency"].strip().upper() != "USD"):
        _fail("Stock research did not match the saved security listing. Existing values were preserved.")
    if asset == "Mutual Fund":
        # Fund share classes can share an exchange label; the saved full name is
        # an additional identity constraint, not an optional classification.
        if not _same_fund(security.name, data["name"]):
            _fail("Stock research did not confirm the saved mutual fund identity. Existing values were preserved.")
    if data["status"] not in {"complete", "partial", "unavailable", "unsupported"}:
        _fail()
    if data["status"] in {"unavailable", "unsupported"}:
        _fail("Sourced details are unavailable for this listing. Existing values were preserved.")
    if data["error"] is not None or not _number(data["price"]):
        _fail("Stock research did not return a valid positive price. Existing values were preserved.")
    kinds = {"nav"} if asset == "Mutual Fund" else {"last_trade", "close"}
    if data["price_kind"] not in kinds:
        _fail("Stock research returned an unsupported price basis. Existing values were preserved.")
    if not isinstance(data["warnings"], list) or len(data["warnings"]) > 8 or any(not _text(item, 250) for item in data["warnings"]):
        _fail()
    model_warnings = list(data["warnings"])
    warnings, missing = [], []
    if not isinstance(data["sources"], list) or not 1 <= len(data["sources"]) <= 8:
        _fail()
    sources, ids, all_ids = [], set(), set()
    for source in data["sources"]:
        if not _object(source, {"id", "url", "title"}) or not _text(source["id"], 64) or not _text(source["title"], 250) or not _text(source["url"], 1024) or source["id"] in all_ids:
            _fail()
        all_ids.add(source["id"])
        if source["url"] in tool_urls and public_evidence_url(source["url"]):
            sources.append(dict(source))
            ids.add(source["id"])
    if not isinstance(data["field_evidence"], list) or len(data["field_evidence"]) > 11:
        _fail()
    evidence = {}
    for item in data["field_evidence"]:
        if not _object(item, {"field", "source_ids", "as_of"}) or not isinstance(item["field"], str) or item["field"] not in {"identity", *DETAIL_FIELDS} or item["field"] in evidence:
            _fail()
        evidence[item["field"]] = item

    def supported(field: str) -> bool:
        item = evidence.get(field)
        return bool(item and isinstance(item["source_ids"], list) and 1 <= len(item["source_ids"]) <= 2
                    and all(isinstance(key, str) and key in ids for key in item["source_ids"])
                    and len(set(item["source_ids"])) == len(item["source_ids"])
                    and _fresh(item["as_of"], now, 60 if field == "thirty_day_yield" else 7))

    if not supported("identity") or not supported("price"):
        _fail("Stock research price or identity lacks fresh matching source evidence. Existing values were preserved.")
    values = {"price": float(data["price"])}
    for field in DETAIL_FIELDS[1:]:
        value = data[field]
        valid = _text(value, 250) if field in {"sector", "industry"} else _number(value, zero=field == "thirty_day_yield", maximum=1 if field == "thirty_day_yield" else None)
        if value is not None and valid and supported(field):
            values[field] = value.strip() if isinstance(value, str) else float(value)
        else:
            values[field] = None
            missing.append(field)
    if missing:
        warnings.append("Unavailable or invalid fields (saved values retained): " + ", ".join(missing) + ".")
    low, high = values["fifty_two_week_low"], values["fifty_two_week_high"]
    if low is not None and high is not None and low > high:
        values["fifty_two_week_low"] = values["fifty_two_week_high"] = None
        warnings.append("fifty_two_week_low/fifty_two_week_high: inconsistent range; saved values were retained.")
    accepted = [item for field, item in evidence.items() if field == "identity" or values.get(field) is not None]
    used_ids = {key for item in accepted for key in item["source_ids"]}
    warnings = list(dict.fromkeys(warnings + model_warnings))[:8]
    return values, [source for source in sources if source["id"] in used_ids], accepted, warnings


class FoundryStockDetailsProvider:
    def __init__(self, *, endpoint: str, deployment: str, auth_mode: str = "entra", api_key: str | None = None,
                 client: httpx.Client | None = None, token_provider=None, management_token_provider=None, managed_identity_client_id: str | None = None,
                 environment: str = "development", reasoning_effort: str | None = None,
                 agent_name: str = "stock-details-agent", agent_version: str | None = None,
                 rai_policy_id: str | None = None, clock=None):
        self._transport = FoundryResponsesTransport(endpoint=endpoint, deployment=deployment, auth_mode=auth_mode,
            api_key=api_key, client=client, token_provider=token_provider, management_token_provider=management_token_provider, managed_identity_client_id=managed_identity_client_id,
            environment=environment, reasoning_effort=reasoning_effort or "low")
        try:
            self._instructions, self._schema = load_agent_definition("stock-details")
        except FoundryTransportError as exc:
            raise SecurityDetailsUnavailableError(str(exc)) from None
        self._agent_name, self._deployment = agent_name, deployment
        self._agent_version = agent_version
        self._rai_policy_id = rai_policy_id
        self._clock = clock or (lambda: datetime.now(UTC))

    def _approved_agent(self, deadline: float) -> dict:
        return self._transport.verify_registered_agent(kind="stock-details", name=self._agent_name,
            version=self._agent_version, deployment=self._deployment, rai_policy_id=self._rai_policy_id, deadline=deadline)

    def get_details(self, security: SecurityMetadata) -> SecurityDetailsResult:
        deadline = time.monotonic() + 55
        for field, limit in (("symbol", 24), ("name", 250), ("exchange", 64), ("asset_type", 64), ("currency", 8)):
            value = getattr(security, field)
            if not _text(value, limit) or any(ord(char) < 32 or ord(char) == 127 for char in value):
                _fail("The saved security identity is invalid or too large for research. Saved details were kept.")
        asset = canonical_asset_type(security.asset_type)
        if (asset not in {"Stock", "ETF", "Mutual Fund"} or security.currency.strip().upper() != "USD"
                or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.\-]{0,23}", security.symbol.strip())
                or (asset != "Mutual Fund" and canonical_exchange(security.exchange) not in SUPPORTED_EXCHANGES)):
            _fail("Stock research supports identifiable USD stocks, ETFs and mutual funds. Existing values were preserved.")
        now = self._clock().astimezone(UTC)
        identity = {"symbol": security.symbol, "name": security.name, "exchange": security.exchange,
                    "asset_type": asset, "currency": security.currency, "as_of": now.isoformat().replace("+00:00", "Z")}
        try:
            agent = self._approved_agent(deadline)
            response = self._transport.call_agent({
                "agent_reference": {"type": "agent_reference", "name": self._agent_name, "version": agent["version"]},
                "metadata": {"agent_name": self._agent_name, "prompt_version": PROMPT_VERSION},
                "max_tool_calls": 6,
                "include": ["web_search_call.action.sources"], "max_output_tokens": 8000,
                "input": [{"role": "user", "content": json.dumps(identity)}],
            }, deadline)
            returned_agent = response.get("agent_reference")
            if returned_agent is not None and returned_agent != {"type": "agent_reference", "name": self._agent_name, "version": agent["version"]}:
                _fail("Stock research returned a different agent reference. Saved details were kept.")
            data, urls = _response_json(response)
            values, sources, evidence, warnings = _validate(data, urls, security, now)
            if time.monotonic() > deadline:
                _fail("Stock research exceeded its time limit. Existing values were preserved; please retry.")
        except FoundryTransportError as exc:
            raise SecurityDetailsUnavailableError(str(exc)) from None
        except (TypeError, ValueError, KeyError, OverflowError, RecursionError):
            _fail()
        return SecurityDetailsResult(name=data["name"].strip(), **values, provenance={
            "schemaVersion": 1, "provider": "azure_foundry", "agentName": self._agent_name,
            "agentVersion": agent["version"], "executionMode": "registered_agent",
            "deployment": self._deployment, "promptVersion": PROMPT_VERSION,
            "definitionHash": hashlib.sha256((self._instructions + json.dumps(self._schema, sort_keys=True)).encode()).hexdigest(),
            "retrievedAt": self._clock().astimezone(UTC).isoformat().replace("+00:00", "Z"),
            "priceKind": data["price_kind"], "authoritative": False, "sources": sources,
            "fieldEvidence": [{"field": item["field"], "sourceIds": list(item["source_ids"]), "asOf": item["as_of"]} for item in evidence],
            "warnings": warnings,
        }, status="partial")
