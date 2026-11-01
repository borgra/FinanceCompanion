"""Opt-in live Foundry smoke check. Reads configuration; never changes holdings."""
from pathlib import Path
import argparse
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src" / "API"))

from app.domain.models import SecurityMetadata
from app.infrastructure.alpha_vantage_security_details import SecurityDetailsUnavailableError
from app.infrastructure.foundry_security_details import FoundrySecurityDetailsProvider
from app.infrastructure.foundry_web_research import FoundryWebDividendResearchProvider
from app.infrastructure.settings import Settings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--symbol", default="JEPQ")
    parser.add_argument("--exchange", default="NASDAQ")
    parser.add_argument("--asset-type", default="ETF", choices=["Stock", "ETF", "Unknown"])
    args = parser.parse_args()
    settings = Settings()
    settings.validate_security()
    if settings.dividend_research_provider != "azure_foundry":
        parser.error("Configure azure_foundry to verify live AI price research.")
    research = FoundryWebDividendResearchProvider(
        endpoint=settings.azure_foundry_endpoint, deployment=settings.azure_foundry_deployment,
        agent_name=settings.azure_foundry_agent_name, reasoning_effort=settings.azure_foundry_reasoning_effort,
        auth_mode=settings.azure_foundry_auth_mode, api_key=settings.azure_foundry_api_key,
        environment=settings.environment, managed_identity_client_id=settings.azure_foundry_managed_identity_client_id,
    )
    print(f"Sending {args.symbol.upper()} to the configured Foundry stock agent; model/search charges apply.", flush=True)
    try:
        result = FoundrySecurityDetailsProvider(research, agent_name=settings.azure_foundry_stock_details_agent_name).get_details(SecurityMetadata(
            symbol=args.symbol, name=args.symbol, exchange=args.exchange, asset_type=args.asset_type, currency="USD"))
    except SecurityDetailsUnavailableError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    print(json.dumps({"symbol": result.symbol, "exchange": result.exchange, "price": result.price,
        "priceAsOf": result.price_as_of, "priceBasis": result.price_basis, "priceSourceUrl": result.price_source_url,
        "detailsStatus": result.details_status, "peRatio": result.pe_ratio, "sector": result.sector,
        "industry": result.industry, "thirtyDayYield": result.thirty_day_yield,
        "fiftyTwoWeekLow": result.fifty_two_week_low, "fiftyTwoWeekHigh": result.fifty_two_week_high,
        "sma20": result.sma20, "sma50": result.sma50, "sma200": result.sma200}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
