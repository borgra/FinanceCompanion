"""Invoke the user's existing Foundry stock agent; validate its sourced output."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from math import isfinite
import re
import time
from typing import Literal
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field

from app.domain.dividend_research import DividendResearchProviderError
from app.domain.models import SecurityMetadata
from app.infrastructure.alpha_vantage_security_details import SecurityDetailsUnavailableError
from app.infrastructure.foundry_web_research import (
    FoundryWebDividendResearchProvider, SUPPORTED_EXCHANGES, UNKNOWN_EXCHANGES,
    UNKNOWN_ASSET_TYPES, _iso_date, canonical_asset_type, canonical_exchange, public_evidence_url,
)


class StockAgentSource(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    id: str = Field(min_length=1, max_length=100)
    url: str = Field(min_length=1, max_length=1024)
    title: str = Field(max_length=250)


class StockAgentEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    field: Literal["identity", "price", "sector", "industry", "pe_ratio", "thirty_day_yield",
                   "fifty_two_week_low", "fifty_two_week_high", "sma20", "sma50", "sma200"]
    source_ids: list[str] = Field(min_length=1, max_length=2)
    as_of: str = Field(min_length=10, max_length=40)


class StockAgentResult(BaseModel):
    """The response contract of stock-details-agent version 1 (managed in Azure)."""
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)
    schema_version: Literal[1]
    symbol: str = Field(min_length=1, max_length=24)
    name: str = Field(min_length=1, max_length=250)
    exchange: str = Field(min_length=1, max_length=64)
    asset_type: Literal["Stock", "ETF", "Mutual Fund"]
    currency: str = Field(min_length=1, max_length=16)
    status: Literal["complete", "partial", "unavailable", "unsupported"]
    price: float | None
    price_kind: Literal["last_trade", "close", "nav"] | None
    sector: str | None = Field(max_length=250)
    industry: str | None = Field(max_length=250)
    pe_ratio: float | None
    thirty_day_yield: float | None
    fifty_two_week_low: float | None
    fifty_two_week_high: float | None
    sma20: float | None
    sma50: float | None
    sma200: float | None
    sources: list[StockAgentSource] = Field(max_length=8)
    field_evidence: list[StockAgentEvidence] = Field(max_length=11)
    warnings: list[str] = Field(max_length=8)
    error: str | None = Field(max_length=1000)


def _observation_date(value: str):
    if len(value) == 10:
        return _iso_date(value)
    timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if timestamp.tzinfo is None:
        raise ValueError("An observation timestamp must include its timezone")
    if timestamp > datetime.now(UTC):
        raise ValueError("An observation timestamp must not be in the future")
    return timestamp.astimezone(ZoneInfo("America/New_York")).date()


def _tool_evidence(data: dict) -> set[str]:
    """Require sources returned by completed search or citation annotations.

    A model-authored JSON URL alone cannot establish grounding. These are cited
    AI facts, not independently fetched or verified publisher quotations.
    """
    sources, completed_search = set(), False
    for item in data.get("output", []):
        if item.get("type") == "web_search_call" and item.get("status") == "completed":
            completed_search = True
            action = item.get("action") or {}
            urls = [entry.get("url") for entry in action.get("sources", [])]
            urls.append(action.get("url"))
            sources.update(url for url in urls if isinstance(url, str) and public_evidence_url(url))
        if item.get("type") == "message":
            for part in item.get("content", []):
                for annotation in part.get("annotations", []):
                    url = annotation.get("url")
                    if annotation.get("type") == "url_citation" and isinstance(url, str) and public_evidence_url(url):
                        sources.add(url)
    if not completed_search or not sources:
        raise ValueError("No completed web research with public sources")
    return sources


class FoundrySecurityDetailsProvider:
    def __init__(self, research: FoundryWebDividendResearchProvider, *, agent_name: str = "stock-details-agent", today=None):
        self._research = research
        self._agent_name = agent_name
        self._today = today or (lambda: datetime.now(ZoneInfo("America/New_York")).date())

    def get_details(self, security: SecurityMetadata) -> SecurityMetadata:
        symbol = security.symbol.strip().upper()
        exchange = canonical_exchange(security.exchange)
        asset_type = canonical_asset_type(security.asset_type)
        if (not re.fullmatch(r"[A-Z0-9][A-Z0-9.\-]{0,23}", symbol)
                or security.currency.upper() != "USD"
                or exchange not in SUPPORTED_EXCHANGES | UNKNOWN_EXCHANGES
                or asset_type not in {"ETF", "Stock"} | UNKNOWN_ASSET_TYPES):
            raise SecurityDetailsUnavailableError("Stock agent price research supports US-listed USD stocks and ETFs. Check the saved ticker, exchange and currency.")
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}", self._agent_name):
            raise SecurityDetailsUnavailableError("Configure a valid Foundry stock-details agent name.")
        if not re.fullmatch(r"/api/projects/[A-Za-z0-9._-]+/openai/v1/responses", urlsplit(self._research._url).path) or self._research._auth_mode != "entra":
            raise SecurityDetailsUnavailableError("The stock-details agent requires a Foundry project endpoint and Entra authentication. Configure AZURE_FOUNDRY_ENDPOINT for the project containing your existing agent.")
        try:
            # Routing and execution bounds are metadata. The ticker is the only
            # task input; model, instructions, tools and schema belong to Azure.
            data = self._research._call({
                "agent_reference": {"type": "agent_reference", "name": self._agent_name},
                "input": symbol,
                "include": ["web_search_call.action.sources"],
                "max_output_tokens": 6000, "max_tool_calls": 6,
            }, time.monotonic() + 90)
            reference = data.get("agent_reference")
            if reference is not None and reference.get("name") != self._agent_name:
                raise ValueError("The response references a different agent")
            texts = [part["text"] for item in data.get("output", []) if item.get("type") == "message"
                     for part in item.get("content", []) if part.get("type") == "output_text"]
            if len(texts) != 1:
                raise ValueError("Missing structured stock-agent result")
            result = StockAgentResult.model_validate_json(texts[0])
            if (result.status not in {"complete", "partial"} or result.error
                    or result.symbol.upper() != symbol or result.currency.upper() != "USD"
                    or canonical_exchange(result.exchange) not in SUPPORTED_EXCHANGES
                    or (exchange not in UNKNOWN_EXCHANGES and canonical_exchange(result.exchange) != exchange)
                    or result.asset_type not in {"ETF", "Stock"}
                    or (asset_type not in UNKNOWN_ASSET_TYPES and result.asset_type != asset_type)):
                raise ValueError("Unavailable or mismatched stock-agent identity")
            source_urls = _tool_evidence(data)
            sources = {source.id: source.url for source in result.sources
                       if public_evidence_url(source.url) and source.url in source_urls}
            evidence = {entry.field: entry for entry in result.field_evidence}
            if len({source.id for source in result.sources}) != len(result.sources) or len(evidence) != len(result.field_evidence):
                raise ValueError("Ambiguous source or field evidence")
            today = self._today()

            def supported(field: str, age: int | None):
                fact = evidence.get(field)
                if fact is None or any(source_id not in sources for source_id in fact.source_ids):
                    return None
                try:
                    observed = _observation_date(fact.as_of)
                except (ValueError, TypeError, OverflowError):
                    return None
                if observed > today or (age is not None and observed < today - timedelta(days=age)):
                    return None
                return observed

            price_date = supported("price", 7)
            price = result.price
            try:
                saved_date = _iso_date(security.price_as_of) if security.price_as_of else None
            except (ValueError, TypeError):
                saved_date = None
            if saved_date is not None and saved_date > today:
                saved_date = None
            if (not supported("identity", None) or price_date is None or price is None
                    or not isfinite(price) or not 0 < price <= 1_000_000
                    or result.price_kind not in {"close", "last_trade"}
                    or (saved_date is not None and price_date < saved_date)):
                raise ValueError("The agent did not return a usable sourced, dated price")
            resolved = SecurityMetadata(symbol=symbol, name=result.name, exchange=canonical_exchange(result.exchange),
                asset_type=result.asset_type, currency="USD", price=price, price_as_of=price_date.isoformat(),
                price_source_url=sources[evidence["price"].source_ids[0]],
                price_basis="latest_close" if result.price_kind == "close" else "delayed_quote",
                details_status=f"AI agent research ({self._agent_name}); delayed or latest closing price")
            for field in ("sector", "industry", "pe_ratio", "thirty_day_yield", "fifty_two_week_low", "fifty_two_week_high", "sma20", "sma50", "sma200"):
                value = getattr(result, field)
                age = None if field in {"sector", "industry"} else 60 if field == "thirty_day_yield" else 7
                if value is None or not supported(field, age):
                    continue
                if isinstance(value, float) and (not isfinite(value) or not 0 <= value <= 1_000_000
                        or (field != "thirty_day_yield" and value <= 0) or (field == "thirty_day_yield" and value > 1)):
                    continue
                setattr(resolved, field, value)
            if resolved.fifty_two_week_low is not None and resolved.fifty_two_week_high is not None and resolved.fifty_two_week_low > resolved.fifty_two_week_high:
                resolved.fifty_two_week_low = resolved.fifty_two_week_high = None
            return resolved
        except DividendResearchProviderError as exc:
            raise SecurityDetailsUnavailableError(f"The Foundry stock-details agent could not complete research. {exc}") from None
        except (ValueError, TypeError, KeyError, AttributeError):
            raise SecurityDetailsUnavailableError("The stock-details agent did not return a valid sourced, dated USD price for this listing. Saved prices and distribution records were preserved.") from None
