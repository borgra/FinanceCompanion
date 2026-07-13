import { describe, expect, it } from 'vitest';
import type { Account } from '../domain/account';
import { parseHoldingImport } from './HoldingsPage';

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
