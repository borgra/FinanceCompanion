import type { SecurityMetadata } from './holding';

const normalized = (value: string) => value.trim().toUpperCase().replace(/\s+/g, ' ');

export const securityListingKey = (security: SecurityMetadata) => {
  const exchange = normalized(security.exchange).replace(/\.$/, '');
  const aliases: Record<string, string> = {
    XNAS: 'NASDAQ', NASDAQGS: 'NASDAQ', NASDAQGM: 'NASDAQ', NASDAQCM: 'NASDAQ',
    'NASDAQ GLOBAL SELECT': 'NASDAQ', XNYS: 'NYSE', ARCX: 'NYSE ARCA', NYSEARCA: 'NYSE ARCA',
    'NYSE ARCA, INC': 'NYSE ARCA', 'NYSE ARCA INC': 'NYSE ARCA', 'NYSE MKT': 'NYSE AMERICAN',
  };
  const assetType = normalized(security.assetType);
  const assetAliases: Record<string, string> = {
    STOCK: 'EQUITY', 'COMMON STOCK': 'EQUITY', ETFS: 'ETF', 'EXCHANGE TRADED FUND': 'ETF',
    'EXCHANGE-TRADED FUND': 'ETF', MUTUALFUND: 'MUTUAL FUND', 'MUTUAL FUNDS': 'MUTUAL FUND',
  };
  const asset = assetAliases[assetType] ?? assetType;
  return JSON.stringify([
    normalized(security.symbol), aliases[exchange] ?? exchange, asset,
    normalized(security.currency), asset === 'MUTUAL FUND' ? normalized(security.name) : '',
  ]);
};

export const needsSecurityRefresh = (updatedAt?: string | null, now = Date.now()) => {
  const timestamp = updatedAt ? Date.parse(updatedAt) : NaN;
  return !Number.isFinite(timestamp) || timestamp > now || now - timestamp >= 48 * 60 * 60 * 1000;
};
