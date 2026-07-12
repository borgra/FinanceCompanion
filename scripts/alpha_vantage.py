from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


API_URL = "https://www.alphavantage.co/query"
API_KEY_NAME = "FINANCE_COMPANION_ALPHA_VANTAGE_API_KEY"


@dataclass(frozen=True)
class Endpoint:
    category: str
    description: str
    required: tuple[str, ...] = ()
    defaults: tuple[tuple[str, str], ...] = ()
    optional: tuple[str, ...] = ()


def endpoint(
    category: str,
    description: str,
    required: Iterable[str] = (),
    defaults: Iterable[tuple[str, str]] = (),
    optional: Iterable[str] = (),
) -> Endpoint:
    return Endpoint(
        category=category,
        description=description,
        required=tuple(required),
        defaults=tuple(defaults),
        optional=tuple(optional),
    )


SYMBOL_OPTIONAL = ("datatype=json|csv", "outputsize=compact|full")
INTERVALS = "interval=1min|5min|15min|30min|60min"
TECHNICAL_OPTIONAL = (
    "interval=1min|5min|15min|30min|60min|daily|weekly|monthly",
    "time_period=<number>",
    "series_type=open|high|low|close",
    "datatype=json|csv",
)


ENDPOINTS: dict[str, Endpoint] = {
    # Core stock APIs
    "TIME_SERIES_INTRADAY": endpoint(
        "Core Stock",
        "Intraday OHLCV time series.",
        ("symbol", "interval"),
        (("interval", "5min"),),
        ("adjusted=true|false", "extended_hours=true|false", "month=YYYY-MM", *SYMBOL_OPTIONAL),
    ),
    "TIME_SERIES_DAILY": endpoint(
        "Core Stock",
        "Daily OHLCV time series.",
        ("symbol",),
        optional=SYMBOL_OPTIONAL,
    ),
    "TIME_SERIES_DAILY_ADJUSTED": endpoint(
        "Core Stock",
        "Daily adjusted OHLCV time series with dividend and split fields.",
        ("symbol",),
        optional=SYMBOL_OPTIONAL,
    ),
    "TIME_SERIES_WEEKLY": endpoint("Core Stock", "Weekly OHLCV time series.", ("symbol",), optional=("datatype=json|csv",)),
    "TIME_SERIES_WEEKLY_ADJUSTED": endpoint("Core Stock", "Weekly adjusted OHLCV time series.", ("symbol",), optional=("datatype=json|csv",)),
    "TIME_SERIES_MONTHLY": endpoint("Core Stock", "Monthly OHLCV time series.", ("symbol",), optional=("datatype=json|csv",)),
    "TIME_SERIES_MONTHLY_ADJUSTED": endpoint("Core Stock", "Monthly adjusted OHLCV time series.", ("symbol",), optional=("datatype=json|csv",)),
    "GLOBAL_QUOTE": endpoint("Core Stock", "Latest price and volume quote.", ("symbol",), optional=("datatype=json|csv",)),
    "REALTIME_BULK_QUOTES": endpoint("Core Stock", "Latest quotes for up to 100 symbols.", ("symbol",), optional=("datatype=json|csv",)),
    "SYMBOL_SEARCH": endpoint("Core Stock", "Ticker search.", ("keywords",), optional=("datatype=json|csv",)),
    "MARKET_STATUS": endpoint("Core Stock", "Current market open or closed status."),

    # Options
    "REALTIME_OPTIONS": endpoint("Options", "Realtime US options chain.", ("symbol",), optional=("contract=<option contract id>", "datatype=json|csv")),
    "HISTORICAL_OPTIONS": endpoint("Options", "Historical US options chain.", ("symbol",), optional=("date=YYYY-MM-DD", "datatype=json|csv")),

    # Alpha Intelligence
    "NEWS_SENTIMENT": endpoint(
        "Alpha Intelligence",
        "Market news and sentiment.",
        optional=(
            "tickers=AAPL,MSFT",
            "topics=technology,earnings",
            "time_from=YYYYMMDDTHHMM",
            "time_to=YYYYMMDDTHHMM",
            "sort=LATEST|EARLIEST|RELEVANCE",
            "limit=<number>",
        ),
    ),
    "TOP_GAINERS_LOSERS": endpoint("Alpha Intelligence", "Top market gainers, losers, and most active."),
    "INSIDER_TRANSACTIONS": endpoint("Alpha Intelligence", "Latest insider transactions.", ("symbol",)),
    "ANALYTICS_FIXED_WINDOW": endpoint(
        "Alpha Intelligence",
        "Fixed-window analytics over one or more symbols.",
        ("SYMBOLS", "RANGE", "INTERVAL", "OHLC"),
        optional=("CALCULATIONS=MEAN,STDDEV,CORRELATION",),
    ),
    "ANALYTICS_SLIDING_WINDOW": endpoint(
        "Alpha Intelligence",
        "Sliding-window analytics over one or more symbols.",
        ("SYMBOLS", "RANGE", "INTERVAL", "OHLC", "WINDOW_SIZE"),
        optional=("CALCULATIONS=MEAN,STDDEV,CORRELATION",),
    ),

    # Fundamental data
    "OVERVIEW": endpoint("Fundamental Data", "Company overview.", ("symbol",)),
    "ETF_PROFILE": endpoint("Fundamental Data", "ETF profile and holdings.", ("symbol",)),
    "DIVIDENDS": endpoint("Fundamental Data", "Historical dividends.", ("symbol",)),
    "SPLITS": endpoint("Fundamental Data", "Historical stock splits.", ("symbol",)),
    "INCOME_STATEMENT": endpoint("Fundamental Data", "Annual and quarterly income statements.", ("symbol",)),
    "BALANCE_SHEET": endpoint("Fundamental Data", "Annual and quarterly balance sheets.", ("symbol",)),
    "CASH_FLOW": endpoint("Fundamental Data", "Annual and quarterly cash flow statements.", ("symbol",)),
    "EARNINGS": endpoint("Fundamental Data", "Annual and quarterly earnings.", ("symbol",)),
    "EARNINGS_CALENDAR": endpoint("Fundamental Data", "Upcoming earnings calendar.", optional=("symbol=<ticker>", "horizon=3month|6month|12month")),
    "IPO_CALENDAR": endpoint("Fundamental Data", "Upcoming IPO calendar."),
    "LISTING_STATUS": endpoint("Fundamental Data", "Active or delisted equities.", optional=("date=YYYY-MM-DD", "state=active|delisted")),
    "EARNINGS_CALL_TRANSCRIPT": endpoint("Fundamental Data", "Earnings call transcript.", ("symbol", "quarter"), (("quarter", "2024Q1"),)),

    # Forex
    "CURRENCY_EXCHANGE_RATE": endpoint("Forex", "Realtime currency exchange rate.", ("from_currency", "to_currency")),
    "FX_INTRADAY": endpoint("Forex", "Intraday forex time series.", ("from_symbol", "to_symbol", "interval"), (("interval", "5min"),), ("outputsize=compact|full", "datatype=json|csv")),
    "FX_DAILY": endpoint("Forex", "Daily forex time series.", ("from_symbol", "to_symbol"), optional=SYMBOL_OPTIONAL),
    "FX_WEEKLY": endpoint("Forex", "Weekly forex time series.", ("from_symbol", "to_symbol"), optional=("datatype=json|csv",)),
    "FX_MONTHLY": endpoint("Forex", "Monthly forex time series.", ("from_symbol", "to_symbol"), optional=("datatype=json|csv",)),

    # Digital and crypto currencies
    "DIGITAL_CURRENCY_DAILY": endpoint("Crypto", "Daily digital currency time series.", ("symbol", "market"), (("market", "USD"),)),
    "DIGITAL_CURRENCY_WEEKLY": endpoint("Crypto", "Weekly digital currency time series.", ("symbol", "market"), (("market", "USD"),)),
    "DIGITAL_CURRENCY_MONTHLY": endpoint("Crypto", "Monthly digital currency time series.", ("symbol", "market"), (("market", "USD"),)),

    # Commodities
    "WTI": endpoint("Commodities", "West Texas Intermediate crude oil.", optional=("interval=daily|weekly|monthly", "datatype=json|csv")),
    "BRENT": endpoint("Commodities", "Brent crude oil.", optional=("interval=daily|weekly|monthly", "datatype=json|csv")),
    "NATURAL_GAS": endpoint("Commodities", "Henry Hub natural gas.", optional=("interval=daily|weekly|monthly", "datatype=json|csv")),
    "COPPER": endpoint("Commodities", "Global copper price.", optional=("interval=monthly|quarterly|annual", "datatype=json|csv")),
    "ALUMINUM": endpoint("Commodities", "Global aluminum price.", optional=("interval=monthly|quarterly|annual", "datatype=json|csv")),
    "WHEAT": endpoint("Commodities", "Global wheat price.", optional=("interval=monthly|quarterly|annual", "datatype=json|csv")),
    "CORN": endpoint("Commodities", "Global corn price.", optional=("interval=monthly|quarterly|annual", "datatype=json|csv")),
    "COTTON": endpoint("Commodities", "Global cotton price.", optional=("interval=monthly|quarterly|annual", "datatype=json|csv")),
    "SUGAR": endpoint("Commodities", "Global sugar price.", optional=("interval=monthly|quarterly|annual", "datatype=json|csv")),
    "COFFEE": endpoint("Commodities", "Global coffee price.", optional=("interval=monthly|quarterly|annual", "datatype=json|csv")),
    "ALL_COMMODITIES": endpoint("Commodities", "Global all-commodities index.", optional=("interval=monthly|quarterly|annual", "datatype=json|csv")),

    # Economic indicators
    "REAL_GDP": endpoint("Economic Indicators", "US real GDP.", optional=("interval=annual|quarterly", "datatype=json|csv")),
    "REAL_GDP_PER_CAPITA": endpoint("Economic Indicators", "US real GDP per capita.", optional=("datatype=json|csv",)),
    "TREASURY_YIELD": endpoint("Economic Indicators", "US Treasury yield.", optional=("interval=daily|weekly|monthly", "maturity=3month|2year|5year|7year|10year|30year", "datatype=json|csv")),
    "FEDERAL_FUNDS_RATE": endpoint("Economic Indicators", "Federal funds rate.", optional=("interval=daily|weekly|monthly", "datatype=json|csv")),
    "CPI": endpoint("Economic Indicators", "Consumer price index.", optional=("interval=monthly|semiannual", "datatype=json|csv")),
    "INFLATION": endpoint("Economic Indicators", "Annual inflation."),
    "INFLATION_EXPECTATION": endpoint("Economic Indicators", "Inflation expectation.", optional=("datatype=json|csv",)),
    "CONSUMER_SENTIMENT": endpoint("Economic Indicators", "Consumer sentiment.", optional=("datatype=json|csv",)),
    "RETAIL_SALES": endpoint("Economic Indicators", "Advance retail sales.", optional=("datatype=json|csv",)),
    "DURABLES": endpoint("Economic Indicators", "Durable goods orders.", optional=("datatype=json|csv",)),
    "UNEMPLOYMENT": endpoint("Economic Indicators", "Unemployment rate.", optional=("datatype=json|csv",)),
    "NONFARM_PAYROLL": endpoint("Economic Indicators", "Nonfarm payroll.", optional=("datatype=json|csv",)),

    # Technical indicators
    "SMA": endpoint("Technical Indicators", "Simple moving average.", ("symbol",), optional=TECHNICAL_OPTIONAL),
    "EMA": endpoint("Technical Indicators", "Exponential moving average.", ("symbol",), optional=TECHNICAL_OPTIONAL),
    "WMA": endpoint("Technical Indicators", "Weighted moving average.", ("symbol",), optional=TECHNICAL_OPTIONAL),
    "DEMA": endpoint("Technical Indicators", "Double exponential moving average.", ("symbol",), optional=TECHNICAL_OPTIONAL),
    "TEMA": endpoint("Technical Indicators", "Triple exponential moving average.", ("symbol",), optional=TECHNICAL_OPTIONAL),
    "TRIMA": endpoint("Technical Indicators", "Triangular moving average.", ("symbol",), optional=TECHNICAL_OPTIONAL),
    "KAMA": endpoint("Technical Indicators", "Kaufman adaptive moving average.", ("symbol",), optional=TECHNICAL_OPTIONAL),
    "MAMA": endpoint("Technical Indicators", "MESA adaptive moving average.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "series_type=open|high|low|close", "fastlimit=<decimal>", "slowlimit=<decimal>", "datatype=json|csv")),
    "VWAP": endpoint("Technical Indicators", "Volume weighted average price.", ("symbol",), optional=(INTERVALS, "datatype=json|csv")),
    "T3": endpoint("Technical Indicators", "Triple exponential moving average T3.", ("symbol",), optional=TECHNICAL_OPTIONAL),
    "MACD": endpoint("Technical Indicators", "Moving average convergence/divergence.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "series_type=open|high|low|close", "fastperiod=<number>", "slowperiod=<number>", "signalperiod=<number>", "datatype=json|csv")),
    "MACDEXT": endpoint("Technical Indicators", "MACD with controllable MA types.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "series_type=open|high|low|close", "fastperiod=<number>", "slowperiod=<number>", "signalperiod=<number>", "fastmatype=<0-8>", "slowmatype=<0-8>", "signalmatype=<0-8>", "datatype=json|csv")),
    "STOCH": endpoint("Technical Indicators", "Stochastic oscillator.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "fastkperiod=<number>", "slowkperiod=<number>", "slowdperiod=<number>", "slowkmatype=<0-8>", "slowdmatype=<0-8>", "datatype=json|csv")),
    "STOCHF": endpoint("Technical Indicators", "Fast stochastic oscillator.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "fastkperiod=<number>", "fastdperiod=<number>", "fastdmatype=<0-8>", "datatype=json|csv")),
    "RSI": endpoint("Technical Indicators", "Relative strength index.", ("symbol",), optional=TECHNICAL_OPTIONAL),
    "STOCHRSI": endpoint("Technical Indicators", "Stochastic RSI.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "time_period=<number>", "series_type=open|high|low|close", "fastkperiod=<number>", "fastdperiod=<number>", "fastdmatype=<0-8>", "datatype=json|csv")),
    "WILLR": endpoint("Technical Indicators", "Williams percent R.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "time_period=<number>", "datatype=json|csv")),
    "ADX": endpoint("Technical Indicators", "Average directional movement index.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "time_period=<number>", "datatype=json|csv")),
    "ADXR": endpoint("Technical Indicators", "Average directional movement rating.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "time_period=<number>", "datatype=json|csv")),
    "APO": endpoint("Technical Indicators", "Absolute price oscillator.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "series_type=open|high|low|close", "fastperiod=<number>", "slowperiod=<number>", "matype=<0-8>", "datatype=json|csv")),
    "PPO": endpoint("Technical Indicators", "Percentage price oscillator.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "series_type=open|high|low|close", "fastperiod=<number>", "slowperiod=<number>", "matype=<0-8>", "datatype=json|csv")),
    "MOM": endpoint("Technical Indicators", "Momentum.", ("symbol",), optional=TECHNICAL_OPTIONAL),
    "BOP": endpoint("Technical Indicators", "Balance of power.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "datatype=json|csv")),
    "CCI": endpoint("Technical Indicators", "Commodity channel index.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "time_period=<number>", "datatype=json|csv")),
    "CMO": endpoint("Technical Indicators", "Chande momentum oscillator.", ("symbol",), optional=TECHNICAL_OPTIONAL),
    "ROC": endpoint("Technical Indicators", "Rate of change.", ("symbol",), optional=TECHNICAL_OPTIONAL),
    "ROCR": endpoint("Technical Indicators", "Rate of change ratio.", ("symbol",), optional=TECHNICAL_OPTIONAL),
    "AROON": endpoint("Technical Indicators", "Aroon.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "time_period=<number>", "datatype=json|csv")),
    "AROONOSC": endpoint("Technical Indicators", "Aroon oscillator.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "time_period=<number>", "datatype=json|csv")),
    "MFI": endpoint("Technical Indicators", "Money flow index.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "time_period=<number>", "datatype=json|csv")),
    "TRIX": endpoint("Technical Indicators", "1-day rate of change of triple smooth EMA.", ("symbol",), optional=TECHNICAL_OPTIONAL),
    "ULTOSC": endpoint("Technical Indicators", "Ultimate oscillator.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "timeperiod1=<number>", "timeperiod2=<number>", "timeperiod3=<number>", "datatype=json|csv")),
    "DX": endpoint("Technical Indicators", "Directional movement index.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "time_period=<number>", "datatype=json|csv")),
    "MINUS_DI": endpoint("Technical Indicators", "Minus directional indicator.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "time_period=<number>", "datatype=json|csv")),
    "PLUS_DI": endpoint("Technical Indicators", "Plus directional indicator.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "time_period=<number>", "datatype=json|csv")),
    "MINUS_DM": endpoint("Technical Indicators", "Minus directional movement.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "time_period=<number>", "datatype=json|csv")),
    "PLUS_DM": endpoint("Technical Indicators", "Plus directional movement.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "time_period=<number>", "datatype=json|csv")),
    "BBANDS": endpoint("Technical Indicators", "Bollinger bands.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "time_period=<number>", "series_type=open|high|low|close", "nbdevup=<decimal>", "nbdevdn=<decimal>", "matype=<0-8>", "datatype=json|csv")),
    "MIDPOINT": endpoint("Technical Indicators", "Midpoint over period.", ("symbol",), optional=TECHNICAL_OPTIONAL),
    "MIDPRICE": endpoint("Technical Indicators", "Midpoint price over period.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "time_period=<number>", "datatype=json|csv")),
    "SAR": endpoint("Technical Indicators", "Parabolic SAR.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "acceleration=<decimal>", "maximum=<decimal>", "datatype=json|csv")),
    "TRANGE": endpoint("Technical Indicators", "True range.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "datatype=json|csv")),
    "ATR": endpoint("Technical Indicators", "Average true range.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "time_period=<number>", "datatype=json|csv")),
    "NATR": endpoint("Technical Indicators", "Normalized average true range.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "time_period=<number>", "datatype=json|csv")),
    "AD": endpoint("Technical Indicators", "Chaikin A/D line.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "datatype=json|csv")),
    "ADOSC": endpoint("Technical Indicators", "Chaikin A/D oscillator.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "fastperiod=<number>", "slowperiod=<number>", "datatype=json|csv")),
    "OBV": endpoint("Technical Indicators", "On balance volume.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "datatype=json|csv")),
    "HT_TRENDLINE": endpoint("Technical Indicators", "Hilbert transform instantaneous trendline.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "series_type=open|high|low|close", "datatype=json|csv")),
    "HT_SINE": endpoint("Technical Indicators", "Hilbert transform sine wave.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "series_type=open|high|low|close", "datatype=json|csv")),
    "HT_TRENDMODE": endpoint("Technical Indicators", "Hilbert transform trend mode.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "series_type=open|high|low|close", "datatype=json|csv")),
    "HT_DCPERIOD": endpoint("Technical Indicators", "Hilbert transform dominant cycle period.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "series_type=open|high|low|close", "datatype=json|csv")),
    "HT_DCPHASE": endpoint("Technical Indicators", "Hilbert transform dominant cycle phase.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "series_type=open|high|low|close", "datatype=json|csv")),
    "HT_PHASOR": endpoint("Technical Indicators", "Hilbert transform phasor components.", ("symbol",), optional=("interval=1min|5min|15min|30min|60min|daily|weekly|monthly", "series_type=open|high|low|close", "datatype=json|csv")),
}


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def load_env_local() -> None:
    env_path = repo_root() / ".env.local"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def categories() -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = {}
    for name, config in sorted(ENDPOINTS.items(), key=lambda item: (item[1].category, item[0])):
        grouped.setdefault(config.category, []).append(name)
    return grouped


def list_endpoints() -> None:
    for category, names in categories().items():
        print(f"\n{category}")
        for name in names:
            print(f"  {name:<32} {ENDPOINTS[name].description}")


def show_endpoint(name: str) -> None:
    config = ENDPOINTS[name]
    print(name)
    print(f"Category: {config.category}")
    print(f"Description: {config.description}")
    if config.required:
        print(f"Required: {', '.join(config.required)}")
    if config.defaults:
        print("Defaults:")
        for key, value in config.defaults:
            print(f"  {key}={value}")
    if config.optional:
        print("Optional:")
        for option in config.optional:
            print(f"  {option}")


def parse_params(values: list[str]) -> dict[str, str]:
    params: dict[str, str] = {}
    for value in values:
        if "=" not in value:
            raise SystemExit(f"Expected --param KEY=VALUE, got: {value}")
        key, raw = value.split("=", 1)
        params[key.strip()] = raw.strip()
    return params


def request_endpoint(args: argparse.Namespace) -> None:
    load_env_local()
    api_key = os.environ.get(API_KEY_NAME)
    if not api_key:
        raise SystemExit(f"Missing {API_KEY_NAME} in {repo_root() / '.env.local'} or the current environment.")

    config = ENDPOINTS[args.function]
    params = {"function": args.function}
    params.update(dict(config.defaults))
    params.update({key: value for key, value in vars(args).items() if key in {
        "symbol",
        "keywords",
        "interval",
        "from_symbol",
        "to_symbol",
        "from_currency",
        "to_currency",
        "market",
    } and value})
    params.update(parse_params(args.param))

    missing = [name for name in config.required if name not in params]
    if missing:
        raise SystemExit(f"Missing required parameter(s) for {args.function}: {', '.join(missing)}")

    params["apikey"] = api_key
    url = f"{API_URL}?{urlencode(params)}"
    request = Request(url, headers={"User-Agent": "FinanceCompanion/1.0"})

    try:
        with urlopen(request, timeout=args.timeout) as response:
            body = response.read().decode("utf-8")
    except HTTPError as exc:
        raise SystemExit(f"Alpha Vantage returned HTTP {exc.code}: {exc.reason}") from exc
    except URLError as exc:
        raise SystemExit(f"Could not reach Alpha Vantage: {exc.reason}") from exc

    if args.raw:
        print(body)
        return

    try:
        print(json.dumps(json.loads(body), indent=2))
    except json.JSONDecodeError:
        print(body)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Explore and call Alpha Vantage endpoints with the repo-level .env.local API key."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("list", help="List supported Alpha Vantage functions grouped by category.")

    show = subparsers.add_parser("show", help="Show required and common optional parameters for a function.")
    show.add_argument("function", choices=sorted(ENDPOINTS))

    call = subparsers.add_parser("request", help="Call an Alpha Vantage function.")
    call.add_argument("function", choices=sorted(ENDPOINTS))
    call.add_argument("--symbol")
    call.add_argument("--keywords")
    call.add_argument("--interval")
    call.add_argument("--from-symbol")
    call.add_argument("--to-symbol")
    call.add_argument("--from-currency")
    call.add_argument("--to-currency")
    call.add_argument("--market")
    call.add_argument("--param", action="append", default=[], help="Extra query parameter as KEY=VALUE. Repeat as needed.")
    call.add_argument("--raw", action="store_true", help="Print raw response instead of pretty JSON.")
    call.add_argument("--timeout", type=float, default=20.0)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "list":
        list_endpoints()
    elif args.command == "show":
        show_endpoint(args.function)
    elif args.command == "request":
        request_endpoint(args)
    else:
        parser.error(f"Unknown command: {args.command}")


if __name__ == "__main__":
    main()
