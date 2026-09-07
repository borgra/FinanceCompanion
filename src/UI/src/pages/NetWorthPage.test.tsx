import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => vi.useRealTimers());

  it('groups accounts, edits monthly account values, and charts variance from the configured baseline', async () => {
    vi.setSystemTime(new Date(2026, 6, 1, 12));
    const user = userEvent.setup();
    const netWorthRepository = createMockNetWorthRepository(15000);
    const saveValues = vi.spyOn(netWorthRepository, 'putMonthlyAccountValues');
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
    expect(screen.getByRole('columnheader', { name: 'Fidelity HSA' })).toHaveClass('net-worth-category-retirement');
    const bankingHeader = screen.getByRole('columnheader', { name: 'Banking' });
    const checkingHeader = screen.getByRole('columnheader', { name: 'Primary Checking' });
    const savingsHeader = screen.getByRole('columnheader', { name: 'High Yield Savings' });
    expect(bankingHeader.style.getPropertyValue('--net-worth-category-color')).toBe('#4f8cff');
    expect(checkingHeader.style.getPropertyValue('--net-worth-category-color')).toBe('#4f8cff');
    expect(savingsHeader.style.getPropertyValue('--net-worth-category-color')).toBe('#4f8cff');
    expect(screen.getByRole('columnheader', { name: 'Investing Taxable' }).style.getPropertyValue('--net-worth-category-color')).toBe('#9b7aff');
    expect(screen.getByRole('columnheader', { name: 'Fidelity Taxable' }).style.getPropertyValue('--net-worth-category-color')).toBe('#9b7aff');
    expect(screen.getByRole('columnheader', { name: 'Investing Retirement' }).style.getPropertyValue('--net-worth-category-color')).toBe('#e98b49');
    expect(screen.getByRole('columnheader', { name: 'Fidelity 401k' }).style.getPropertyValue('--net-worth-category-color')).toBe('#e98b49');
    expect(screen.getByRole('columnheader', { name: 'Investing HSA' }).style.getPropertyValue('--net-worth-category-color')).toBe('#e98b49');
    expect(screen.getByRole('columnheader', { name: 'Fidelity HSA' }).style.getPropertyValue('--net-worth-category-color')).toBe('#e98b49');

    const summary = screen.getByLabelText('Net worth summary');
    expect(within(summary).getByText('$15,400.00')).toBeInTheDocument();
    expect(within(summary).getByText('$15,000.00')).toBeInTheDocument();
    expect(within(summary).getByText('$400.00')).toBeInTheDocument();
    expect(summary.querySelector('.net-worth-variance-percent')).toHaveClass('is-positive');
    expect(within(summary).getByText('$400.00').parentElement).toHaveTextContent('$400.00 (+2.7%)');

    const chart = screen.getByRole('img', { name: /net worth by month graph/i });
    expect(chart).toBeInTheDocument();
    expect(within(chart).getByText('$15,000.00 reference')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Net Worth by Month' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Current Month by Account Type' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Net Worth to Goal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Primary Checking.*snapshot/i })).not.toBeInTheDocument();

    const saveChanges = screen.getByRole('button', { name: 'Save changes' });
    expect(saveChanges).toBeDisabled();

    const taxableValue = screen.getByRole('textbox', { name: 'Fidelity Taxable Jul-26 value' });
    const retirementValue = screen.getByRole('textbox', { name: 'Fidelity 401k Jul-26 value' });
    const hsaValue = screen.getByRole('textbox', { name: 'Fidelity HSA Jul-26 value' });
    expect(taxableValue.closest('td')).not.toHaveClass('net-worth-account-cell');

    await user.clear(taxableValue);
    await user.type(taxableValue, '5000');
    expect(saveValues).not.toHaveBeenCalled();
    expect(within(summary).getByText('$16,400.00')).toBeInTheDocument();
    await user.tab();
    expect(saveValues).not.toHaveBeenCalled();

    await user.clear(retirementValue);
    await user.type(retirementValue, '7100{Enter}');
    expect(saveValues).not.toHaveBeenCalled();

    await user.clear(hsaValue);
    await user.type(hsaValue, '1000');
    expect(within(summary).getByText('$16,600.00')).toBeInTheDocument();
    await user.tab();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(saveValues).toHaveBeenCalledTimes(1));
    expect(saveValues).toHaveBeenCalledWith(expect.objectContaining({
      taxable: expect.objectContaining({ 'Jul-26': 5000 }),
      retirement: expect.objectContaining({ 'Jul-26': 7100 }),
      hsa: expect.objectContaining({ 'Jul-26': 1000 }),
    }));

    expect(within(summary).getByText('$1,600.00')).toBeInTheDocument();
    expect(within(summary).getByText('+10.7%')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Snapshot' }));
    expect(screen.getByText(/Jul-26 values updated from Banking and Investing/)).toBeInTheDocument();
  });

  it('retains dirty table values when the batch save fails so it can be retried', async () => {
    const user = userEvent.setup();
    const putMonthlyAccountValues = vi.fn().mockRejectedValueOnce(new Error('save failed')).mockResolvedValueOnce({
      beginningNetWorth: 100000,
      monthlyAccountValues: { taxable: { 'Jul-26': 6000 } },
      updatedAt: '2026-01-01T00:00:00Z',
    });
    const netWorthRepository = {
      get: async () => ({ beginningNetWorth: 100000, monthlyAccountValues: {}, updatedAt: '2026-01-01T00:00:00Z' }),
      put: async (beginningNetWorth: number) => ({ beginningNetWorth, monthlyAccountValues: {}, updatedAt: '2026-01-01T00:00:00Z' }),
      putMonthlyAccountValues,
    };
    render(<NetWorthPage accountRepository={createMockAccountRepository({ initialAccounts: [account({ id: 'taxable', name: 'Fidelity Taxable', type: 'Investment', startingBalance: 4000, investmentAccountType: 'Taxable', manageHoldings: true, yearlyContribution: 0 })] })} incomeRepository={createMockIncomeSourceRepository()} holdingRepository={createMockHoldingRepository()} netWorthRepository={netWorthRepository} />);
    const snapshot = await screen.findByRole('textbox', { name: 'Fidelity Taxable Jul-26 value' });
    await user.clear(snapshot);
    await user.type(snapshot, '6000');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your edits are still here');
    expect(snapshot).toHaveValue('$6,000.00');
    const retry = screen.getByRole('button', { name: 'Save changes' });
    expect(retry).toBeEnabled();
    await user.click(retry);
    await waitFor(() => expect(putMonthlyAccountValues).toHaveBeenCalledTimes(2));
    expect(retry).toBeDisabled();
  });
  it('renders saved pension grid values after HSA without making pension cells editable', async () => {
    const pension = account({
      id: 'pension',
      name: 'City Pension',
      type: 'Investment',
      investmentAccountType: 'Pension',
      startingBalance: 10000,
      yieldRate: 12,
      manageHoldings: false,
      employerName: 'City of Chicago',
    });
    pension.monthlyRecords[0].invest = 100;
    const netWorthRepository = createMockNetWorthRepository(0);
    vi.spyOn(netWorthRepository, 'get').mockResolvedValue({
      beginningNetWorth: 0,
      monthlyAccountValues: { pension: { 'Jan-26': 999999 } },
      trackMortgageInNetWorth: false,
      mortgageSchedule: null,
      updatedAt: '2026-01-01T00:00:00Z',
    });
    const holdingRepository = createMockHoldingRepository();
    vi.spyOn(holdingRepository, 'listHoldings').mockResolvedValue([{
      id: 'legacy-pension-holding',
      security: { symbol: 'BAD', name: 'Ignored', exchange: '', assetType: 'Stock', currency: 'USD', price: 500 },
      accountPositions: [{ accountId: 'pension', quantity: 1000, costBasis: null }],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }]);

    render(<NetWorthPage accountRepository={createMockAccountRepository({ initialAccounts: [pension] })} incomeRepository={createMockIncomeSourceRepository({ initialSources: [] })} holdingRepository={holdingRepository} netWorthRepository={netWorthRepository} />);

    expect(await screen.findByRole('columnheader', { name: 'Pension' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /City Pension.*value/i })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'City Pension' })).toHaveClass('net-worth-category-retirement');
    expect(within(screen.getByRole('row', { name: /Jan-26/ })).getAllByText('$999,999.00')).toHaveLength(2);
    expect(within(screen.getByRole('row', { name: /Feb-26/ })).getAllByText('$10,302.00')[0]).toBeInTheDocument();
  });
  it('uses the current local year and month when calculating captured banking values', async () => {
    vi.setSystemTime(new Date(2027, 7, 15, 12));
    const user = userEvent.setup();
    const checking = account({ id: 'checking', name: 'Checking', startingBalance: 1000 });
    checking.monthlyRecords[7].outflows = { rent: 100 };
    render(<NetWorthPage accountRepository={createMockAccountRepository({ initialAccounts: [checking] })} incomeRepository={createMockIncomeSourceRepository()} holdingRepository={createMockHoldingRepository()} netWorthRepository={createMockNetWorthRepository(0)} />);

    const summary = await screen.findByLabelText('Net worth summary');
    expect(within(summary).getByText('Current Net Worth (Aug-27)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Snapshot' }));
    expect(within(screen.getByRole('row', { name: /Aug-27/ })).getAllByText('$900.00')).toHaveLength(2);
  });
  it('captures a legitimate zero holdings value instead of the investment starting balance', async () => {
    vi.setSystemTime(new Date(2026, 7, 15, 12));
    const user = userEvent.setup();
    const investment = account({ id: 'taxable', name: 'Taxable', type: 'Investment', investmentAccountType: 'Taxable', startingBalance: 5000, manageHoldings: true });
    const holdingRepository = createMockHoldingRepository();
    vi.spyOn(holdingRepository, 'listHoldings').mockResolvedValue([{
      id: 'liquidated',
      security: { symbol: 'ZERO', name: 'Liquidated', exchange: '', assetType: 'Stock', currency: 'USD', price: 100 },
      accountPositions: [{ accountId: 'taxable', quantity: 0, costBasis: null }],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-08-15T00:00:00Z',
    }]);
    render(<NetWorthPage accountRepository={createMockAccountRepository({ initialAccounts: [investment] })} incomeRepository={createMockIncomeSourceRepository()} holdingRepository={holdingRepository} netWorthRepository={createMockNetWorthRepository(0)} />);

    await user.click(await screen.findByRole('button', { name: 'Snapshot' }));
    expect(within(screen.getByRole('row', { name: /Aug-26/ })).getAllByText('$0.00').length).toBeGreaterThan(0);
  });

  it('keeps future saved values out of the entry grid and uses an actual-to-forecast chart boundary', async () => {
    vi.setSystemTime(new Date(2026, 6, 15, 12));
    const netWorthRepository = createMockNetWorthRepository(100);
    vi.spyOn(netWorthRepository, 'get').mockResolvedValue({
      beginningNetWorth: 100,
      monthlyAccountValues: { taxable: { 'Jul-26': 110, 'Aug-26': 9999 } },
      netWorthGoal: 200,
      updatedAt: '2026-01-01T00:00:00Z',
    });
    render(<NetWorthPage accountRepository={createMockAccountRepository({ initialAccounts: [account({ id: 'taxable', name: 'Taxable', type: 'Investment', startingBalance: 100, investmentAccountType: 'Taxable', manageHoldings: true, yearlyContribution: 0 })] })} incomeRepository={createMockIncomeSourceRepository()} holdingRepository={createMockHoldingRepository()} netWorthRepository={netWorthRepository} />);

    expect(await screen.findByRole('textbox', { name: 'Taxable Jul-26 value' })).toHaveValue('$110.00');
    expect(screen.queryByRole('textbox', { name: 'Taxable Aug-26 value' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Taxable Aug-26 forecast hidden')).toHaveTextContent('—');
    expect(screen.getByText(/Aug-26: .* Forecast/)).not.toHaveTextContent('$9,999.00');
    const goal = screen.getByRole('heading', { name: 'Net Worth to Goal' }).parentElement;
    expect(goal).not.toBeNull();
    expect(within(goal as HTMLElement).getByText('$200.00')).toBeInTheDocument();
    expect(within(goal as HTMLElement).getByText('$90.00')).toBeInTheDocument();
    expect(within(goal as HTMLElement).getByText('55.0%')).toBeInTheDocument();
    expect(screen.queryByLabelText('Net worth goal')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Net worth goal progress' }).querySelector('.net-worth-goal-fill')).toHaveStyle({ width: '55%' });
  });

  it('caps over-goal progressbar semantics while retaining the true over-goal amount in accessible text', async () => {
    vi.setSystemTime(new Date(2026, 6, 15, 12));
    const netWorthRepository = createMockNetWorthRepository(0);
    vi.spyOn(netWorthRepository, 'get').mockResolvedValue({
      beginningNetWorth: 0,
      monthlyAccountValues: {},
      netWorthGoal: 100,
      updatedAt: '2026-01-01T00:00:00Z',
    });
    render(<NetWorthPage accountRepository={createMockAccountRepository({ initialAccounts: [account({ id: 'taxable', name: 'Taxable', type: 'Investment', startingBalance: 250, investmentAccountType: 'Taxable', manageHoldings: true, yearlyContribution: 0 })] })} incomeRepository={createMockIncomeSourceRepository()} holdingRepository={createMockHoldingRepository()} netWorthRepository={netWorthRepository} />);

    const progress = await screen.findByRole('progressbar', { name: 'Net worth goal progress' });
    expect(progress).toHaveAttribute('aria-valuemax', '100');
    expect(progress).toHaveAttribute('aria-valuenow', '100');
    expect(progress).toHaveAttribute('aria-valuetext', '$250.00 of $100.00 ($150.00 over goal)');
    expect(progress.querySelector('.net-worth-goal-fill')).toHaveStyle({ width: '100%' });
  });

  it('uses every account category and tracked home equity for net worth goal progress', async () => {
    vi.setSystemTime(new Date(2026, 6, 15, 12));
    const netWorthRepository = createMockNetWorthRepository(0);
    vi.spyOn(netWorthRepository, 'get').mockResolvedValue({
      beginningNetWorth: 0,
      monthlyAccountValues: {},
      trackMortgageInNetWorth: true,
      netWorthGoal: 4000,
      mortgageSchedule: {
        houseValue: 1000,
        startingOutstandingMortgage: 400,
        annualInterestRate: 0,
        monthlyPrincipalPayment: 100,
        monthlyAdditionalPrincipalPayment: 0,
        scheduleStartMonth: '2026-07',
      },
      updatedAt: '2026-01-01T00:00:00Z',
    });
    render(<NetWorthPage
      accountRepository={createMockAccountRepository({ initialAccounts: [
        account({ id: 'checking', name: 'Checking', startingBalance: -100 }),
        account({ id: 'savings', name: 'Savings', type: 'Savings', startingBalance: 200 }),
        account({ id: 'taxable', name: 'Taxable', type: 'Investment', investmentAccountType: 'Taxable', startingBalance: 300 }),
        account({ id: '401k', name: '401k', type: 'Investment', investmentAccountType: '401k', startingBalance: 400 }),
        account({ id: 'ira', name: 'IRA', type: 'Investment', investmentAccountType: 'IRA', startingBalance: 500 }),
        account({ id: 'hsa', name: 'HSA', type: 'Investment', investmentAccountType: 'HSA', startingBalance: 600 }),
        account({ id: 'pension', name: 'Pension', type: 'Investment', investmentAccountType: 'Pension', startingBalance: 700 }),
      ] })}
      incomeRepository={createMockIncomeSourceRepository()}
      holdingRepository={createMockHoldingRepository()}
      netWorthRepository={netWorthRepository}
    />);

    const progress = await screen.findByRole('progressbar', { name: 'Net worth goal progress' });
    expect(progress).toHaveAttribute('aria-valuenow', '3300');
    expect(progress).toHaveAttribute('aria-valuemax', '4000');
    expect(progress).toHaveAttribute('aria-valuetext', '$3,300.00 of $4,000.00 ($700.00 remaining)');
    expect(progress.querySelector('.net-worth-goal-fill')).toHaveStyle({ width: '82.5%' });
    const goalCard = screen.getByRole('heading', { name: 'Net Worth to Goal' }).parentElement;
    expect(within(goalCard as HTMLElement).getByText('Goal')).toBeInTheDocument();
    expect(within(goalCard as HTMLElement).getByText('Difference')).toBeInTheDocument();
    expect(within(goalCard as HTMLElement).getByText('Percentage Complete')).toBeInTheDocument();
    expect(within(goalCard as HTMLElement).getByText('$700.00')).toBeInTheDocument();
    expect(within(goalCard as HTMLElement).getByText('82.5%')).toBeInTheDocument();
  });
  it('renders the visual cards as a shared no-scroll layout contract', async () => {
    vi.setSystemTime(new Date(2026, 6, 15, 12));
    render(<NetWorthPage accountRepository={createMockAccountRepository({ initialAccounts: [account({ id: 'checking', name: 'Checking', startingBalance: 100 })] })} incomeRepository={createMockIncomeSourceRepository()} holdingRepository={createMockHoldingRepository()} netWorthRepository={createMockNetWorthRepository(0)} />);

    const visualGrid = await screen.findByRole('heading', { name: 'Net Worth by Month' });
    const grid = visualGrid.parentElement?.parentElement;
    expect(grid).toHaveClass('net-worth-visual-grid', 'net-worth-visual-grid-chart-only');
    const bodies = Array.from(grid?.querySelectorAll('.net-worth-visual-card-body') ?? []);
    expect(bodies).toHaveLength(1);
    expect(bodies.every((body) => body.classList.contains('net-worth-visual-card-body'))).toBe(true);
    expect(grid?.querySelector('svg')).not.toHaveStyle({ minWidth: '680px' });
  });

  it('snapshots current source values into only the current grid month and preserves missing sources', async () => {
    vi.setSystemTime(new Date(2026, 7, 15, 12));
    const user = userEvent.setup();
    const checking = account({ id: 'checking', name: 'Checking', startingBalance: 1000 });
    checking.monthlyRecords[7].outflows = { rent: 100 };
    const taxable = account({ id: 'taxable', name: 'Taxable', type: 'Investment', investmentAccountType: 'Taxable', startingBalance: 5000, manageHoldings: true });
    const preserved = account({ id: 'preserved', name: 'Preserved', type: 'Investment', investmentAccountType: 'IRA', startingBalance: 3000, manageHoldings: true });
    const missing = account({ id: 'missing', name: 'Missing', type: 'Investment', investmentAccountType: 'HSA', startingBalance: 2000, manageHoldings: true });
    const netWorthRepository = createMockNetWorthRepository(0);
    vi.spyOn(netWorthRepository, 'get').mockResolvedValue({
      beginningNetWorth: 0,
      monthlyAccountValues: {
        preserved: { 'Jan-26': 600, 'Aug-26': 777 },
        taxable: { 'Jul-26': 150 },
      },
      updatedAt: '2026-01-01T00:00:00Z',
    });
    const save = vi.spyOn(netWorthRepository, 'putMonthlyAccountValues');
    const holdingRepository = createMockHoldingRepository();
    vi.spyOn(holdingRepository, 'listHoldings').mockResolvedValue([{
      id: 'taxable-position',
      security: { symbol: 'TAX', name: 'Taxable holding', exchange: 'NYSE', assetType: 'ETF', currency: 'USD', price: 100 },
      accountPositions: [{ accountId: 'taxable', quantity: 2, costBasis: null }],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-08-15T00:00:00Z',
    }]);

    render(<NetWorthPage accountRepository={createMockAccountRepository({ initialAccounts: [checking, taxable, preserved, missing] })} incomeRepository={createMockIncomeSourceRepository()} holdingRepository={holdingRepository} netWorthRepository={netWorthRepository} />);
    await user.click(await screen.findByRole('button', { name: 'Snapshot' }));
    expect(screen.getByText(/Aug-26 values updated from Banking and Investing/)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(save).toHaveBeenCalledWith({
      checking: { 'Aug-26': 900 },
      taxable: { 'Jul-26': 150, 'Aug-26': 200 },
      preserved: { 'Jan-26': 600, 'Aug-26': 777 },
      missing: { 'Aug-26': 0 },
    }));
  });
});

















