import type {
  Holding,
  HoldingDraft,
  SecurityDetailsRefreshResult,
  SecurityMetadata,
} from './holding';

export type HoldingRepository = {
  searchSecurities: (query: string) => Promise<SecurityMetadata[]>;
  listHoldings: () => Promise<Holding[]>;
  createHolding: (draft: HoldingDraft) => Promise<Holding>;
  updateHolding: (id: string, draft: HoldingDraft) => Promise<Holding>;
  refreshHoldingSecurityDetails: (id: string) => Promise<Holding>;
  refreshHeldSecurityDetails: () => Promise<SecurityDetailsRefreshResult>;
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
    peRatio: 24.2,
    thirtyDayYield: 0.013,
    fiftyTwoWeekLow: 255,
    fiftyTwoWeekHigh: 320,
    dividendPreviousYear: 3.55,
    dividendCurrentYear: 3.72,
    dividendGrowthRate: 0.0479,
    estimatedFuturePayout: 3.72,
    sma20: 312,
    sma50: 307,
    sma200: 291,
    payoutDetails: [
      {
        exDividendDate: '2026-06-28',
        amount: 0.45,
        paymentDate: '2026-07-02',
        source: 'dividends',
      },
      {
        exDividendDate: '2025-12-20',
        amount: 0.4,
        paymentDate: '2025-12-27',
        source: 'dividends',
      },
    ],
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
      const existing = holdings.find(
        (holding) => holding.security.symbol.toLowerCase() === draft.security.symbol.toLowerCase(),
      );
      if (existing) {
        const existingPositionByAccount = new Map(
          existing.accountPositions.map((position) => [position.accountId, position]),
        );
        const missingPositions = draft.accountPositions.filter(
          (position) => !existingPositionByAccount.has(position.accountId),
        );
        const updated: Holding = {
          ...existing,
          accountPositions: [
            ...existing.accountPositions.map((position) => ({ ...position })),
            ...missingPositions.map((position) => ({ ...position })),
          ],
          updatedAt: nowIso(),
        };
        holdings = holdings.map((holding) => (holding.id === existing.id ? updated : holding));
        return {
          ...updated,
          security: { ...updated.security },
          accountPositions: updated.accountPositions.map((position) => ({ ...position })),
        };
      }

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
    refreshHoldingSecurityDetails: async (id) => {
      const existing = holdings.find((holding) => holding.id === id);
      if (!existing) {
        throw new Error('Holding not found.');
      }
      const catalogSecurity = securityCatalog.find(
        (item) => item.symbol === existing.security.symbol,
      );
      const updated: Holding = {
        ...existing,
        security: {
          ...existing.security,
          ...catalogSecurity,
          detailsStatus: 'fresh',
          detailsUpdatedAt: nowIso(),
        },
        updatedAt: nowIso(),
      };
      holdings = holdings.map((holding) => (holding.id === id ? updated : holding));
      return {
        ...updated,
        security: { ...updated.security },
        accountPositions: updated.accountPositions.map((position) => ({ ...position })),
      };
    },
    refreshHeldSecurityDetails: async () => {
      const refreshed = await Promise.all(
        holdings.map((holding) => {
          const catalogSecurity = securityCatalog.find(
            (item) => item.symbol === holding.security.symbol,
          );
          const updated: Holding = {
            ...holding,
            security: {
              ...holding.security,
              ...catalogSecurity,
              detailsStatus: 'fresh',
              detailsUpdatedAt: nowIso(),
            },
            updatedAt: nowIso(),
          };
          return updated;
        }),
      );
      holdings = refreshed;
      return {
        holdings: refreshed.map((holding) => ({
          ...holding,
          security: { ...holding.security },
          accountPositions: holding.accountPositions.map((position) => ({ ...position })),
        })),
        failedSymbols: [],
      };
    },
  };
}
