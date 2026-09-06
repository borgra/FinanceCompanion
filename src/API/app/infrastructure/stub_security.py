from __future__ import annotations
from dataclasses import replace
from app.domain.models import SecurityMetadata

_FIXTURES = {
    'MSFT': ('Microsoft Corporation', 'NASDAQ', 'Equity', 510.0),
    'SCHD': ('Schwab U.S. Dividend Equity ETF', 'NYSE Arca', 'ETF', 29.0),
    'JEPQ': ('JPMorgan Nasdaq Equity Premium Income ETF', 'NASDAQ', 'ETF', 61.0),
}

class StubSecuritySearchProvider:
    def search(self, query: str) -> list[SecurityMetadata]:
        q = query.strip().upper()
        return [SecurityMetadata(symbol=s, name=n, exchange=e, asset_type=a, currency='USD', price=p) for s,(n,e,a,p) in _FIXTURES.items() if q in s or q in n.upper()][:8]

class StubSecurityDetailsProvider:
    def get_details(self, security: SecurityMetadata) -> SecurityMetadata:
        item = _FIXTURES.get(security.symbol.upper())
        if not item:
            return replace(security, details_status='stub')
        name, exchange, asset_type, price = item
        return replace(security, name=name, exchange=exchange, asset_type=asset_type, currency='USD', price=price, details_status='stub')
