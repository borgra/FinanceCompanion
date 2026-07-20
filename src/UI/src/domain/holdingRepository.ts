import type {
  Holding,
  CorporateActionImportRow,
  HoldingDraft,
  HoldingImportResult,
  HoldingImportRow,
  PassiveIncomeImportRow,
  SecurityPayoutDetails,
  SecurityDetailsRefreshResult,
  SecurityMetadata,
} from './holding';

export type HoldingRepository = {
  searchSecurities: (query: string) => Promise<SecurityMetadata[]>;
  listHoldings: () => Promise<Holding[]>;
  createHolding: (draft: HoldingDraft) => Promise<Holding>;
  updateHolding: (id: string, draft: HoldingDraft) => Promise<Holding>;
  updateHoldingsBatch: (changes: Array<{ id: string; draft: HoldingDraft }>) => Promise<Holding[]>;
  importHoldingDetails?: (rows: HoldingImportRow[]) => Promise<HoldingImportResult>;
  importManualPayoutDetails?: (rows: PassiveIncomeImportRow[]) => Promise<HoldingImportResult>;
  importCorporateActions?: (rows: CorporateActionImportRow[]) => Promise<HoldingImportResult>;
  purgePaymentData?: () => Promise<Holding[]>;
  deleteHolding: (id: string) => Promise<void>;
  refreshHoldingSecurityDetails: (id: string, options?: { replaceManualPayouts?: boolean }) => Promise<Holding>;
  refreshHeldSecurityDetails: (options?: { replaceManualPayouts?: boolean }) => Promise<SecurityDetailsRefreshResult>;
  updateManualPayoutDetails: (id: string, payouts: SecurityPayoutDetails[]) => Promise<Holding>;
};

const nowIso = () => new Date().toISOString();

const isUpdatedToday = (updatedAt?: string | null) => {
  if (!updatedAt) {
    return false;
  }
  const updatedDate = new Date(updatedAt);
  if (Number.isNaN(updatedDate.getTime())) {
    return false;
  }
  return updatedDate.toISOString().slice(0, 10) === nowIso().slice(0, 10);
};

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
    payoutDetails: [
      { exDividendDate: '2026-06-25', paymentDate: '2026-06-30', amount: 0.26, source: 'seed' },
      { exDividendDate: '2025-12-11', paymentDate: '2025-12-15', amount: 0.25, source: 'seed' },
    ],
  },
  {
    symbol: 'JEPQ',
    name: 'JPMorgan Nasdaq Equity Premium Income ETF',
    exchange: 'NASDAQ',
    assetType: 'ETF',
    currency: 'USD',
    price: 61,
    sector: 'Diversified',
    industry: 'Option Income',
    payoutDetails: [
      { exDividendDate: '2026-07-01', paymentDate: '2026-07-06', amount: 0.63658, source: 'seed' },
      { exDividendDate: '2025-09-02', amount: 0.44195, source: 'seed' },
    ],
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
    importHoldingDetails: async (rows) => {
      const rowsBySymbol = new Map(rows.map((row) => [row.symbol.toLowerCase(), row]));
      const matchedSymbols = new Set(holdings.map((holding) => holding.security.symbol.toLowerCase()));
      const updatedIds = new Set<string>();
      holdings = holdings.map((holding) => {
        const row = rowsBySymbol.get(holding.security.symbol.toLowerCase());
        if (!row) return holding;
        updatedIds.add(holding.id);
        return { ...holding, security: { ...holding.security, name: row.name, price: row.price, detailsStatus: 'manual', detailsUpdatedAt: nowIso() }, accountPositions: row.accountPositions, updatedAt: nowIso() };
      });
      return {
        holdings: holdings.filter((holding) => updatedIds.has(holding.id)).map((holding) => ({ ...holding, security: { ...holding.security } })),
        unmatchedSymbols: rows.filter((row) => !matchedSymbols.has(row.symbol.toLowerCase())).map((row) => row.symbol),
      };
    },
    importManualPayoutDetails: async (rows) => {
      const rowsBySymbol = new Map<string, SecurityPayoutDetails[]>();
      for (const row of rows) {
        const symbol = row.symbol.toLowerCase();
        rowsBySymbol.set(symbol, [...(rowsBySymbol.get(symbol) ?? []), { ...row.payout, mode: 'manual' }]);
      }
      const updatedIds = new Set<string>();
      const matchedSymbols = new Set(holdings.map((holding) => holding.security.symbol.toLowerCase()));
      holdings = holdings.map((holding) => {
        const payouts = rowsBySymbol.get(holding.security.symbol.toLowerCase());
        if (!payouts) return holding;
        updatedIds.add(holding.id);
        return { ...holding, security: { ...holding.security, payoutDetails: payouts, manualPayoutDetails: payouts }, updatedAt: nowIso() };
      });
      return {
        holdings: holdings.filter((holding) => updatedIds.has(holding.id)).map((holding) => ({ ...holding, security: { ...holding.security } })),
        unmatchedSymbols: [...rowsBySymbol.keys()].filter((symbol) => !matchedSymbols.has(symbol)).map((symbol) => symbol.toUpperCase()),
      };
    },
    importCorporateActions: async (rows) => {
      const actionsBySymbol = new Map<string, CorporateActionImportRow[]>();
      for (const row of rows) {
        const symbol = row.symbol.toLowerCase();
        actionsBySymbol.set(symbol, [...(actionsBySymbol.get(symbol) ?? []), row]);
      }
      const updatedIds = new Set<string>();
      const matchedSymbols = new Set(holdings.map((holding) => holding.security.symbol.toLowerCase()));
      holdings = holdings.map((holding) => {
        const rowsForHolding = actionsBySymbol.get(holding.security.symbol.toLowerCase());
        if (!rowsForHolding) return holding;
        updatedIds.add(holding.id);
        const existingActions = holding.security.corporateActions ?? [];
        return {
          ...holding,
          security: {
            ...holding.security,
            corporateActions: [
              ...existingActions,
              ...rowsForHolding.map((row) => ({
                id: `${holding.security.symbol}-${row.action.effectiveDate}-${row.action.type}-${row.action.oldShares}-${row.action.newShares}`,
                ...row.action,
              })),
            ],
          },
          updatedAt: nowIso(),
        };
      });
      return {
        holdings: holdings.filter((holding) => updatedIds.has(holding.id)).map((holding) => ({ ...holding, security: { ...holding.security } })),
        unmatchedSymbols: [...actionsBySymbol.keys()].filter((symbol) => !matchedSymbols.has(symbol)).map((symbol) => symbol.toUpperCase()),
      };
    },
    purgePaymentData: async () => {
      holdings = holdings.map((holding) => ({
        ...holding,
        security: {
          ...holding.security,
          payoutDetails: [],
          manualPayoutDetails: [],
        },
        updatedAt: nowIso(),
      }));
      return holdings.map((holding) => ({ ...holding, security: { ...holding.security } }));
    },    updateHolding: async (id, draft) => {
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
    updateHoldingsBatch: async (changes) => {
      const ids = changes.map((change) => change.id);
      if (ids.length > 100 || ids.length !== new Set(ids).size || ids.some((id) => !holdings.some((holding) => holding.id === id))) {
        throw new Error('Unable to save holdings batch.');
      }
      const changesById = new Map(changes.map((change) => [change.id, change.draft]));
      const timestamp = nowIso();
      const nextHoldings = holdings.map((holding) => {
        const draft = changesById.get(holding.id);
        return draft ? { ...holding, security: { ...draft.security }, accountPositions: draft.accountPositions.map((position) => ({ ...position })), updatedAt: timestamp } : holding;
      });
      holdings = nextHoldings;
      return nextHoldings.filter((holding) => changesById.has(holding.id)).map((holding) => ({ ...holding, security: { ...holding.security }, accountPositions: holding.accountPositions.map((position) => ({ ...position })) }));
    },    deleteHolding: async (id) => {
      const existing = holdings.find((holding) => holding.id === id);
      if (!existing) {
        throw new Error('Holding not found.');
      }
      holdings = holdings.filter((holding) => holding.id !== id);
    },
    refreshHoldingSecurityDetails: async (id, options) => {
      const existing = holdings.find((holding) => holding.id === id);
      if (!existing) {
        throw new Error('Holding not found.');
      }
      if (isUpdatedToday(existing.security.detailsUpdatedAt)) {
        return {
          ...existing,
          security: { ...existing.security },
          accountPositions: existing.accountPositions.map((position) => ({ ...position })),
        };
      }
      const catalogSecurity = securityCatalog.find(
        (item) => item.symbol === existing.security.symbol,
      );
      const updated: Holding = {
        ...existing,
        security: {
          ...existing.security,
          ...catalogSecurity,
          payoutDetails:
            existing.security.manualPayoutDetails?.length && !options?.replaceManualPayouts
              ? existing.security.manualPayoutDetails
              : catalogSecurity?.payoutDetails ?? existing.security.payoutDetails,
          manualPayoutDetails: options?.replaceManualPayouts
            ? []
            : existing.security.manualPayoutDetails,
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
    refreshHeldSecurityDetails: async (options) => {
      const refreshed = await Promise.all(
        holdings.map((holding) => {
          if (isUpdatedToday(holding.security.detailsUpdatedAt)) {
            return holding;
          }
          const catalogSecurity = securityCatalog.find(
            (item) => item.symbol === holding.security.symbol,
          );
          const updated: Holding = {
            ...holding,
            security: {
              ...holding.security,
              ...catalogSecurity,
              payoutDetails:
                holding.security.manualPayoutDetails?.length && !options?.replaceManualPayouts
                  ? holding.security.manualPayoutDetails
                  : catalogSecurity?.payoutDetails ?? holding.security.payoutDetails,
              manualPayoutDetails: options?.replaceManualPayouts
                ? []
                : holding.security.manualPayoutDetails,
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
    updateManualPayoutDetails: async (id, payouts) => {
      const existing = holdings.find((holding) => holding.id === id);
      if (!existing) {
        throw new Error('Holding not found.');
      }
      const updated: Holding = {
        ...existing,
        security: {
          ...existing.security,
          payoutDetails: payouts,
          manualPayoutDetails: payouts,
        },
        updatedAt: nowIso(),
      };
      holdings = holdings.map((holding) => (holding.id === id ? updated : holding));
      return updated;
    },
  };
}

