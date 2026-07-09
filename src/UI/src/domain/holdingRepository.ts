import type { Holding, HoldingDraft, SecurityMetadata } from './holding';

export type HoldingRepository = {
  searchSecurities: (query: string) => Promise<SecurityMetadata[]>;
  listHoldings: () => Promise<Holding[]>;
  createHolding: (draft: HoldingDraft) => Promise<Holding>;
  updateHolding: (id: string, draft: HoldingDraft) => Promise<Holding>;
};

const nowIso = () => new Date().toISOString();

const securityCatalog: SecurityMetadata[] = [
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    exchange: 'NASDAQ',
    assetType: 'Equity',
    currency: 'USD',
    price: 235,
    sector: 'Technology',
    industry: 'Consumer Electronics',
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    exchange: 'NASDAQ',
    assetType: 'Equity',
    currency: 'USD',
    price: 510,
    sector: 'Technology',
    industry: 'Software',
  },
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    exchange: 'NASDAQ',
    assetType: 'Equity',
    currency: 'USD',
    price: 165,
    sector: 'Technology',
    industry: 'Semiconductors',
  },
  {
    symbol: 'VTI',
    name: 'Vanguard Total Stock Market ETF',
    exchange: 'NYSE Arca',
    assetType: 'ETF',
    currency: 'USD',
    price: 315,
    sector: 'Diversified',
    industry: 'Broad Market',
  },
  {
    symbol: 'SCHD',
    name: 'Schwab US Dividend Equity ETF',
    exchange: 'NYSE Arca',
    assetType: 'ETF',
    currency: 'USD',
    price: 29,
    sector: 'Diversified',
    industry: 'Dividend Equity',
  },
];

export function createMockHoldingRepository(): HoldingRepository {
  let holdings: Holding[] = [];

  return {
    searchSecurities: async (query) => {
      const normalized = query.trim().toLowerCase();
      if (!normalized) {
        return [];
      }
      return securityCatalog.filter(
        (item) =>
          item.symbol.toLowerCase().includes(normalized) ||
          item.name.toLowerCase().includes(normalized),
      );
    },
    listHoldings: async () =>
      holdings.map((holding) => ({
        ...holding,
        security: { ...holding.security },
        accountPositions: holding.accountPositions.map((position) => ({ ...position })),
      })),
    createHolding: async (draft) => {
      const timestamp = nowIso();
      const next: Holding = {
        id: `holding-${crypto.randomUUID().slice(0, 8)}`,
        security: { ...draft.security },
        accountPositions: draft.accountPositions.map((position) => ({ ...position })),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      holdings = [...holdings, next];
      return { ...next };
    },
    updateHolding: async (id, draft) => {
      const existing = holdings.find((holding) => holding.id === id);
      if (!existing) {
        throw new Error('Holding not found.');
      }
      const updated: Holding = {
        ...existing,
        security: { ...draft.security },
        accountPositions: draft.accountPositions.map((position) => ({ ...position })),
        updatedAt: nowIso(),
      };
      holdings = holdings.map((holding) => (holding.id === id ? updated : holding));
      return { ...updated };
    },
  };
}
