import { describe, expect, it } from 'vitest';
import type { Account } from '../domain/account';
import { createMockHoldingRepository } from '../domain/holdingRepository';
import { createHoldingImportTemplate, parseCorporateActionImport, parseHoldingImport, parsePassiveIncomeImport } from './HoldingsPage';
import { normalizePayoutAmount } from './PassiveIncomePage';

const investmentAccounts: Account[] = [
  {
    id: 'acc-etrade', name: 'Etrade', type: 'Investment', startingBalance: 0,
    startDate: '2026-01-01', yieldRate: 0, assignedIncomeSourceIds: [],
    investmentAccountType: 'Taxable', manageHoldings: true, yearlyContribution: 0,
    columns: [], monthlyRecords: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'acc-401k', name: 'Audrey 401k', type: 'Investment', startingBalance: 0,
    startDate: '2026-01-01', yieldRate: 0, assignedIncomeSourceIds: [],
    investmentAccountType: '401k', manageHoldings: true, yearlyContribution: 0,
    columns: [], monthlyRecords: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const accountsWithUnmanagedHolding = [
  ...investmentAccounts,
  { ...investmentAccounts[0], id: 'acc-unmanaged', name: 'Unmanaged brokerage', manageHoldings: false },
];

const holdings = [
  {
    id: 'holding-msft',
    security: {
      symbol: 'MSFT', name: 'Microsoft Corporation', price: 510.25,
      exchange: 'NASDAQ', assetType: 'Stock', currency: 'USD',
    },
    accountPositions: [
      { accountId: 'acc-etrade', quantity: 50, costBasis: null },
      { accountId: 'acc-401k', quantity: 75, costBasis: null },
    ],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'holding-vti',
    security: {
      symbol: 'VTI', name: 'Vanguard Total Market', price: 325.25,
      exchange: 'NYSE Arca', assetType: 'ETF', currency: 'USD',
    },
    accountPositions: [{ accountId: 'acc-401k', quantity: 2.5, costBasis: null }],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('createHoldingImportTemplate', () => {
  it('prepopulates every account column with the current holding quantities', () => {
    expect(createHoldingImportTemplate(accountsWithUnmanagedHolding, holdings)).toBe(
      'Ticker,Name,Price,Account: Etrade (acc-etrade),Account: Audrey 401k (acc-401k)\r\n' +
      'MSFT,Microsoft Corporation,510.25,50,75\r\n' +
      'VTI,Vanguard Total Market,325.25,0,2.5\r\n',
    );
  });

  it('creates a valid header-only template when there are no holdings', () => {
    expect(createHoldingImportTemplate(accountsWithUnmanagedHolding, [])).toBe(
      'Ticker,Name,Price,Account: Etrade (acc-etrade),Account: Audrey 401k (acc-401k)\r\n',
    );
  });
});

describe('parseHoldingImport', () => {
  it('accepts a subset of account columns and maps only those positions', () => {
    const rows = parseHoldingImport(
      'Ticker,Name,Price,Account: Audrey 401k (acc-401k)\nVTI,Vanguard Total Market,325.25,43',
      investmentAccounts,
    );

    expect(rows).toEqual([
      {
        symbol: 'VTI',
        name: 'Vanguard Total Market',
        price: 325.25,
        accountPositions: [{ accountId: 'acc-401k', quantity: 43, costBasis: null }],
      },
    ]);
  });
});

describe('parsePassiveIncomeImport', () => {
  it('parses one payment per CSV row and groups multiple payments for a ticker', () => {
    expect(parsePassiveIncomeImport(
      'Ticker,Ex Dividend Date,Payment Date,Amount\nVTI,2026-06-28,2026-07-02,0.45\nVTI,2026-09-28,2026-10-02,0.47',
    )).toEqual([
      { symbol: 'VTI', payout: { exDividendDate: '2026-06-28', paymentDate: '2026-07-02', amount: 0.45, source: 'user', mode: 'manual' } },
      { symbol: 'VTI', payout: { exDividendDate: '2026-09-28', paymentDate: '2026-10-02', amount: 0.47, source: 'user', mode: 'manual' } },
    ]);
  });

  it('rejects duplicate ticker payments on the same date', () => {
    expect(() => parsePassiveIncomeImport(
      'Ticker,Ex Dividend Date,Payment Date,Amount\nVTI,2026-06-28,2026-07-02,0.45\nVTI,2026-06-28,2026-07-02,0.45',
    )).toThrow('Ticker VTI has more than one payment on 2026-07-02.');
  });
});
describe('corporate action imports and normalization', () => {
  it('normalizes a payout before a forward split to the current share basis', () => {
    expect(normalizePayoutAmount(
      { exDividendDate: '2024-02-15', amount: 0.80 },
      [{ id: 'split-msft', effectiveDate: '2024-06-15', type: 'stock_split', oldShares: 1, newShares: 4 }],
    )).toBe(0.2);
  });

  it('normalizes a payout before a reverse split and excludes same-day actions', () => {
    const action = { id: 'reverse-abc', effectiveDate: '2024-09-30', type: 'reverse_stock_split' as const, oldShares: 10, newShares: 1 };
    expect(normalizePayoutAmount({ exDividendDate: '2024-02-15', amount: 0.80 }, [action])).toBe(8);
    expect(normalizePayoutAmount({ exDividendDate: '2024-09-30', amount: 0.80 }, [action])).toBe(0.80);
  });

  it('parses standard split and reverse-split action rows', () => {
    expect(parseCorporateActionImport(
      'Ticker,Effective Date,Action,Old Shares,New Shares\nMSFT,2024-06-15,Stock Split,1,4\nABC,2024-09-30,Reverse Stock Split,10,1',
    )).toEqual([
      { symbol: 'MSFT', action: { effectiveDate: '2024-06-15', type: 'stock_split', oldShares: 1, newShares: 4 } },
      { symbol: 'ABC', action: { effectiveDate: '2024-09-30', type: 'reverse_stock_split', oldShares: 10, newShares: 1 } },
    ]);
  });
});

describe('holding security refresh', () => {
  it('preserves manually owned dividend data for individual and bulk refreshes', async () => {
    const repository = createMockHoldingRepository();
    const payout = { exDividendDate: '2026-07-01', paymentDate: '2026-07-05', amount: 0.31, source: 'user', mode: 'manual' as const };
    const sourcePayout = { exDividendDate: '2025-07-01', paymentDate: '2025-07-05', amount: 0.21, source: 'saved-source', mode: 'source' as const };
    const security = {
      symbol: 'VTI', name: 'Saved VTI', exchange: 'NYSE Arca', assetType: 'ETF', currency: 'USD', price: 300,
      dividendPreviousYear: 1.1, dividendCurrentYear: 1.2, dividendGrowthRate: 0.09,
      estimatedFuturePayout: 1.3, dividendStatus: 'manual', payoutDetails: [payout],
      sourcePayoutDetails: [sourcePayout], manualPayoutDetails: [payout], detailsUpdatedAt: '2026-01-01T00:00:00Z',
    };
    const created = await repository.createHolding({ security, accountPositions: [] });

    const refreshed = await repository.refreshHoldingSecurityDetails(created.id);

    expect(refreshed.security.price).toBe(315);
    expect(refreshed.security).toMatchObject({
      dividendPreviousYear: 1.1,
      dividendCurrentYear: 1.2,
      dividendGrowthRate: 0.09,
      estimatedFuturePayout: 1.3,
      dividendStatus: 'manual',
      payoutDetails: [payout],
      sourcePayoutDetails: [sourcePayout],
      manualPayoutDetails: [payout],
    });

    const bulkSecurity = { ...security, symbol: 'SCHD', name: 'Saved SCHD', price: 28 };
    const bulkHolding = await repository.createHolding({ security: bulkSecurity, accountPositions: [] });
    const bulkResult = await repository.refreshHeldSecurityDetails();
    const bulkRefreshed = bulkResult.holdings.find((holding) => holding.id === bulkHolding.id);

    expect(bulkRefreshed?.security.price).toBe(29);
    expect(bulkRefreshed?.security).toMatchObject({
      dividendPreviousYear: 1.1,
      dividendCurrentYear: 1.2,
      dividendGrowthRate: 0.09,
      estimatedFuturePayout: 1.3,
      dividendStatus: 'manual',
      payoutDetails: [payout],
      sourcePayoutDetails: [sourcePayout],
      manualPayoutDetails: [payout],
    });
  });
});
