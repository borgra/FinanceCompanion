import type {
  Holding,
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
  purgePaymentData?: () => Promise<Holding[]>;
  deleteHolding: (id: string) => Promise<void>;
  refreshHoldingSecurityDetails: (id: string) => Promise<Holding>;
  refreshHoldingDividends: (id: string) => Promise<Holding>;
  refreshHeldSecurityDetails: () => Promise<SecurityDetailsRefreshResult>;
  updateManualPayoutDetails: (id: string, payouts: SecurityPayoutDetails[]) => Promise<Holding>;
};

const mergeRefreshedSecurity = (
  current: SecurityMetadata,
  refreshed: SecurityMetadata,
): SecurityMetadata => ({
  ...current,
  ...refreshed,
  dividendPreviousYear: current.dividendPreviousYear,
  dividendCurrentYear: current.dividendCurrentYear,
  dividendGrowthRate: current.dividendGrowthRate,
  estimatedFuturePayout: current.estimatedFuturePayout,
  dividendStatus: current.dividendStatus,
  payoutDetails: current.payoutDetails,
  sourcePayoutDetails: current.sourcePayoutDetails,
  manualPayoutDetails: current.manualPayoutDetails,
});

const nowIso = () => new Date().toISOString();

const mergeDividendPayouts = (
  source: SecurityPayoutDetails[],
  manual: SecurityPayoutDetails[],
) => {
  const merged = [...source];
  manual.forEach((payout) => {
    let matchIndex = merged.findIndex((candidate) =>
      candidate.mode !== 'manual'
      && candidate.exDividendDate === payout.exDividendDate
      && candidate.paymentDate === payout.paymentDate);
    if (matchIndex < 0) {
      matchIndex = merged.findIndex((candidate) =>
        candidate.mode !== 'manual' && candidate.exDividendDate === payout.exDividendDate);
    }
    if (matchIndex < 0) merged.push(payout);
    else merged[matchIndex] = payout;
  });
  return merged.sort((left, right) =>
    (left.paymentDate || left.exDividendDate).localeCompare(right.paymentDate || right.exDividendDate));
};

const needsSecurityRefresh = (updatedAt?: string | null) => {
  if (!updatedAt) {
    return false;
  }
  const updatedDate = new Date(updatedAt);
  if (Number.isNaN(updatedDate.getTime())) {
    return false;
  }
  return Date.now() - updatedDate.getTime() > 48 * 60 * 60 * 1000;
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
        return {
          ...holding,
          security: {
            ...holding.security,
            name: row.name,
            price: row.price,
            ...('dividendGrowthRate' in row ? { dividendGrowthRate: row.dividendGrowthRate } : {}),
            detailsStatus: 'manual',
            detailsUpdatedAt: nowIso(),
          },
          accountPositions: row.accountPositions,
          updatedAt: nowIso(),
        };
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
        return { ...holding, security: { ...holding.security, payoutDetails: mergeDividendPayouts(holding.security.sourcePayoutDetails ?? [], payouts), manualPayoutDetails: payouts }, updatedAt: nowIso() };
      });
      return {
        holdings: holdings.filter((holding) => updatedIds.has(holding.id)).map((holding) => ({ ...holding, security: { ...holding.security } })),
        unmatchedSymbols: [...rowsBySymbol.keys()].filter((symbol) => !matchedSymbols.has(symbol)).map((symbol) => symbol.toUpperCase()),
      };
    },
    purgePaymentData: async () => {
      holdings = holdings.map((holding) => ({
        ...holding,
        security: {
          ...holding.security,
          payoutDetails: [],
          sourcePayoutDetails: [],
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
    refreshHoldingSecurityDetails: async (id) => {
      const existing = holdings.find((holding) => holding.id === id);
      if (!existing) {
        throw new Error('Holding not found.');
      }
      const catalogSecurity = securityCatalog.find(
        (item) => item.symbol === existing.security.symbol,
      );
      if (!catalogSecurity || !Number.isFinite(catalogSecurity.price) || !catalogSecurity.price || catalogSecurity.price <= 0) {
        return { ...existing, security: { ...existing.security }, accountPositions: existing.accountPositions.map((position) => ({ ...position })) };
      }
      const updated: Holding = {
        ...existing,
        security: {
          ...mergeRefreshedSecurity(existing.security, catalogSecurity),
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
    refreshHoldingDividends: async (id) => {
      const existing = holdings.find((holding) => holding.id === id);
      if (!existing) throw new Error('Holding not found.');
      const today = new Date();
      const year = today.getFullYear();
      const sourceUrl = 'https://example.test/finance-companion/stub-dividends';
      const sourcePayoutDetails: SecurityPayoutDetails[] = [];
      for (const [targetYear, amount] of [[year - 2, 0.35], [year - 1, 0.38], [year, 0.415]] as const) {
        for (const month of [2, 5, 8, 11]) {
          const date = `${targetYear}-${String(month).padStart(2, '0')}-15`;
          sourcePayoutDetails.push({
            exDividendDate: date,
            paymentDate: `${targetYear}-${String(month).padStart(2, '0')}-22`,
            amount,
            mode: 'source',
            source: 'stub',
            sourceUrl,
            status: targetYear === year && month > today.getMonth() + 1 ? 'announced' : 'completed',
          });
        }
      }
      const manual = existing.security.manualPayoutDetails ?? [];
      const updated: Holding = {
        ...existing,
        security: {
          ...existing.security,
          payoutDetails: mergeDividendPayouts(sourcePayoutDetails, manual),
          sourcePayoutDetails,
          corporateActions: [{ id: `research-action-1-${year - 2}-06-01`, effectiveDate: `${year - 2}-06-01`, type: 'stock_split', oldShares: 1, newShares: 2 }],
          dividendStatus: 'stub',
          dividendResearchRetrievedAt: `${today.toISOString().slice(0, 10)}T00:00:00Z`,
          dividendResearchProvider: 'stub',
          dividendResearchSourceUrl: sourceUrl,
          dividendResearchAuthoritative: false,
          dividendResearchSchemaVersion: 1,
          dividendResearchAdjustmentBasis: 'current_share_basis',
          dividendResearchWarnings: ['Stub data is deterministic and non-authoritative.'],
        },
        updatedAt: nowIso(),
      };
      holdings = holdings.map((holding) => holding.id === id ? updated : holding);
      return { ...updated, security: { ...updated.security } };
    },
    refreshHeldSecurityDetails: async () => {
      const refreshed = await Promise.all(
        holdings.map((holding) => {
          if (!needsSecurityRefresh(holding.security.detailsUpdatedAt)) {
            return holding;
          }
          const catalogSecurity = securityCatalog.find(
            (item) => item.symbol === holding.security.symbol,
          );
          if (!catalogSecurity || !Number.isFinite(catalogSecurity.price) || !catalogSecurity.price || catalogSecurity.price <= 0) {
            return holding;
          }
          const updated: Holding = {
            ...holding,
            security: {
              ...mergeRefreshedSecurity(holding.security, catalogSecurity),
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
          payoutDetails: mergeDividendPayouts(existing.security.sourcePayoutDetails ?? [], payouts),
          manualPayoutDetails: payouts,
        },
        updatedAt: nowIso(),
      };
      holdings = holdings.map((holding) => (holding.id === id ? updated : holding));
      return updated;
    },
  };
}

