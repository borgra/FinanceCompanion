import { describe, expect, it } from 'vitest';
import type { Account } from '../domain/account';
import { createHoldingImportTemplate, parseHoldingImport } from './HoldingsPage';
import { parsePassiveIncomeImport } from './PassiveIncomePage';

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