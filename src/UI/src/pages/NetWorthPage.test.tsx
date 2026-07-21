import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { defaultMonthlyRecords, type Account } from '../domain/account';
import { createMockAccountRepository } from '../domain/accountRepository';
import { createMockHoldingRepository } from '../domain/holdingRepository';
import { createMockIncomeSourceRepository } from '../domain/incomeSourceRepository';
import { createMockNetWorthRepository } from '../domain/netWorthRepository';
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
  it('groups accounts, edits investment snapshots, and charts variance from the debug baseline', async () => {
    const user = userEvent.setup();
    const netWorthRepository = createMockNetWorthRepository(15000);
    const saveSnapshot = vi.spyOn(netWorthRepository, 'putInvestmentSnapshots');
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
        netWorthRepository={netWorthRepository}
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
    expect(within(summary).getByText('$100,000.00')).toBeInTheDocument();
    expect(within(summary).getByText('($84,600.00)')).toBeInTheDocument();
    expect(within(summary).getByText('-84.6%')).toBeInTheDocument();

    const chart = screen.getByRole('img', { name: /annual net worth graph/i });
    expect(chart).toBeInTheDocument();
    expect(within(chart).getByText('$100K reference')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Primary Checking.*snapshot/i })).not.toBeInTheDocument();

    const saveChanges = screen.getByRole('button', { name: 'Save changes' });
    expect(saveChanges).toBeDisabled();

    const taxableSnapshot = screen.getByRole('textbox', { name: 'Fidelity Taxable Jul-26 snapshot' });
    const retirementSnapshot = screen.getByRole('textbox', { name: 'Fidelity 401k Jul-26 snapshot' });
    const hsaSnapshot = screen.getByRole('textbox', { name: 'Fidelity HSA Jul-26 snapshot' });

    await user.clear(taxableSnapshot);
    await user.type(taxableSnapshot, '5000');
    expect(saveSnapshot).not.toHaveBeenCalled();
    expect(within(summary).getByText('$16,400.00')).toBeInTheDocument();
    await user.tab();
    expect(saveSnapshot).not.toHaveBeenCalled();

    await user.clear(retirementSnapshot);
    await user.type(retirementSnapshot, '7100{Enter}');
    expect(saveSnapshot).not.toHaveBeenCalled();

    await user.clear(hsaSnapshot);
    await user.type(hsaSnapshot, '1000');
    expect(within(summary).getByText('$16,600.00')).toBeInTheDocument();
    await user.tab();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(saveSnapshot).toHaveBeenCalledTimes(1));
    expect(saveSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      taxable: expect.objectContaining({ 'Jul-26': 5000 }),
      retirement: expect.objectContaining({ 'Jul-26': 7100 }),
      hsa: expect.objectContaining({ 'Jul-26': 1000 }),
    }));

    expect(within(summary).getByText('($83,400.00)')).toBeInTheDocument();
    expect(within(summary).getByText('-83.4%')).toBeInTheDocument();
  });

  it('retains dirty snapshot drafts when the batch save fails so it can be retried', async () => {
    const user = userEvent.setup();
    const putInvestmentSnapshots = vi.fn().mockRejectedValueOnce(new Error('save failed')).mockResolvedValueOnce({
      beginningNetWorth: 100000,
      investmentSnapshots: { taxable: { 'Jul-26': 6000 } },
      updatedAt: '2026-01-01T00:00:00Z',
    });
    const netWorthRepository = {
      get: async () => ({ beginningNetWorth: 100000, investmentSnapshots: {}, updatedAt: '2026-01-01T00:00:00Z' }),
      put: async (beginningNetWorth: number) => ({ beginningNetWorth, investmentSnapshots: {}, updatedAt: '2026-01-01T00:00:00Z' }),
      putInvestmentSnapshots,
    };
    render(<NetWorthPage accountRepository={createMockAccountRepository({ initialAccounts: [account({ id: 'taxable', name: 'Fidelity Taxable', type: 'Investment', startingBalance: 4000, investmentAccountType: 'Taxable', manageHoldings: true, yearlyContribution: 0 })] })} incomeRepository={createMockIncomeSourceRepository()} holdingRepository={createMockHoldingRepository()} netWorthRepository={netWorthRepository} />);
    const snapshot = await screen.findByRole('textbox', { name: 'Fidelity Taxable Jul-26 snapshot' });
    await user.clear(snapshot);
    await user.type(snapshot, '6000');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your edits are still here');
    expect(snapshot).toHaveValue('$6,000.00');
    const retry = screen.getByRole('button', { name: 'Save changes' });
    expect(retry).toBeEnabled();
    await user.click(retry);
    await waitFor(() => expect(putInvestmentSnapshots).toHaveBeenCalledTimes(2));
    expect(retry).toBeDisabled();
  });
});

















