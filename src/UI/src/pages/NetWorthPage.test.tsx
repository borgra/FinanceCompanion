import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import { defaultMonthlyRecords, type Account } from '../domain/account';
import { createMockAccountRepository } from '../domain/accountRepository';
import { createMockHoldingRepository } from '../domain/holdingRepository';
import { createMockIncomeSourceRepository } from '../domain/incomeSourceRepository';
import { beginningNetWorthStorageKey } from '../domain/netWorthConfiguration';
import { NetWorthPage } from './NetWorthPage';

const account = (overrides: Partial<Account>): Account => ({
  id: 'acc-test',
  name: 'Test Account',
  type: 'Checking',
  startingBalance: 0,
  startDate: '2026-01-01',
  yieldRate: 0,
  assignedIncomeSourceIds: [],
  columns: [],
  monthlyRecords: defaultMonthlyRecords(),
  createdAt: '2026-06-30T00:00:00.000Z',
  updatedAt: '2026-06-30T00:00:00.000Z',
  ...overrides,
});

describe('NetWorthPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(beginningNetWorthStorageKey, '15000');
  });

  it('groups banking and investing accounts and calculates variance from the configured baseline', async () => {
    render(
      <NetWorthPage
        accountRepository={createMockAccountRepository({
          initialAccounts: [
            account({ id: 'banking-checking', name: 'Primary Checking', startingBalance: 1000 }),
            account({ id: 'banking-savings', name: 'High Yield Savings', type: 'Savings', startingBalance: 2500 }),
            account({
              id: 'taxable',
              name: 'Fidelity Taxable',
              type: 'Investment',
              startingBalance: 4000,
              investmentAccountType: 'Taxable',
              manageHoldings: true,
              yearlyContribution: 0,
            }),
            account({
              id: 'retirement',
              name: 'Fidelity 401k',
              type: 'Investment',
              startingBalance: 7000,
              investmentAccountType: '401k',
              manageHoldings: true,
              yearlyContribution: 0,
            }),
            account({
              id: 'hsa',
              name: 'Fidelity HSA',
              type: 'Investment',
              startingBalance: 900,
              investmentAccountType: 'HSA',
              manageHoldings: true,
              yearlyContribution: 0,
            }),
          ],
        })}
        incomeRepository={createMockIncomeSourceRepository()}
        holdingRepository={createMockHoldingRepository()}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Net Worth' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Jan-26' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Banking' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Investing Taxable' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Investing Retirement' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Investing HSA' })).toBeInTheDocument();
    expect(screen.getByText('Primary Checking')).toBeInTheDocument();
    expect(screen.getByText('High Yield Savings')).toBeInTheDocument();
    expect(screen.getByText('Fidelity Taxable')).toBeInTheDocument();
    expect(screen.getByText('Fidelity 401k')).toBeInTheDocument();
    expect(screen.getByText('Fidelity HSA')).toBeInTheDocument();

    const summary = screen.getByLabelText('Net worth summary');
    expect(within(summary).getByText('$15,400.00')).toBeInTheDocument();
    expect(within(summary).getByText('$400.00')).toBeInTheDocument();
    expect(within(summary).getByText('+2.7%')).toBeInTheDocument();
  });
});
