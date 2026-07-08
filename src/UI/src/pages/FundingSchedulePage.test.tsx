import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { defaultMonthlyRecords, type Account } from '../domain/account';
import { createMockAccountRepository } from '../domain/accountRepository';
import type { IncomeSource } from '../domain/incomeSource';
import { createMockIncomeSourceRepository } from '../domain/incomeSourceRepository';
import { FundingSchedulePage } from './FundingSchedulePage';

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

const incomeSource = (overrides: Partial<IncomeSource> = {}): IncomeSource => ({
  id: 'income-source-primary',
  name: 'Primary Employer',
  type: 'Salary',
  cadence: 'Bi-weekly',
  periods: [
    {
      id: 'period-1',
      startDate: '2025-01-01',
      yearlyGrossAmount: 80000,
      netPercentage: 75,
    },
  ],
  status: 'Active',
  createdAt: '2026-06-30T00:00:00.000Z',
  updatedAt: '2026-06-30T00:00:00.000Z',
  ...overrides,
});

describe('FundingSchedulePage', () => {
  it('creates and deletes investment accounts from the investing workflow', async () => {
    const repository = createMockAccountRepository({
      initialAccounts: [
        account({
          id: 'checking-one',
          name: 'Primary Checking',
          type: 'Checking',
        }),
      ],
    });
    const incomeRepository = createMockIncomeSourceRepository({
      initialSources: [incomeSource()],
    });

    render(
      <FundingSchedulePage
        accountRepository={repository}
        incomeRepository={incomeRepository}
      />,
    );

    expect(
      await screen.findByRole('heading', { name: 'After-Tax Accounts' }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /add account/i }));
    await userEvent.type(screen.getByLabelText(/account name/i), 'Company 401k');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /investment account type/i }),
      '401k',
    );
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /brokerage/i }), 'eTrade');
    await userEvent.type(screen.getByLabelText(/yearly contribution/i), '12000');
    await userEvent.selectOptions(screen.getByLabelText(/^employer$/i), 'income-source-primary');
    await userEvent.clear(screen.getByLabelText(/match rate/i));
    await userEvent.type(screen.getByLabelText(/match rate/i), '50');
    await userEvent.clear(screen.getByLabelText(/match cap/i));
    await userEvent.type(screen.getByLabelText(/match cap/i), '6');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('heading', { name: 'Before-Tax Accounts' })).toBeInTheDocument();
    expect(screen.getAllByText('Company 401k')[0]).toBeInTheDocument();

    let accounts = await repository.listAccounts();
    const createdAccount = accounts.find((item) => item.name === 'Company 401k');
    expect(createdAccount?.type).toBe('Investment');
    expect(createdAccount?.investmentAccountType).toBe('401k');
    expect(createdAccount?.investmentBrokerage).toBe('eTrade');
    expect(createdAccount?.startingBalance).toBe(0);
    expect(createdAccount?.yearlyContribution).toBe(12000);
    expect(createdAccount?.employerIncomeSourceId).toBe('income-source-primary');
    expect(createdAccount?.employerMatchRatePercent).toBe(50);
    expect(createdAccount?.employerMatchCapPercent).toBe(6);
    expect(createdAccount?.employerMatchStartDate).toBe('2026-01-01');

    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    await userEvent.click(screen.getByRole('button', { name: /delete company 401k/i }));

    await waitFor(() => {
      expect(screen.queryByText('Company 401k')).not.toBeInTheDocument();
    });
    accounts = await repository.listAccounts();
    expect(accounts.some((item) => item.name === 'Company 401k')).toBe(false);
  });

  it('aggregates checking investment amounts and saves non-payroll allocations', async () => {
    const checkingOne = account({
      id: 'checking-one',
      name: 'Primary Checking',
      type: 'Checking',
    });
    checkingOne.monthlyRecords[8].invest = 2000;
    const checkingTwo = account({
      id: 'checking-two',
      name: 'Secondary Checking',
      type: 'Checking',
    });
    checkingTwo.monthlyRecords[8].invest = 2000;

    const taxable = account({
      id: 'taxable',
      name: 'Brokerage',
      type: 'Investment',
      investmentAccountType: 'Taxable',
    });
    const ira = account({
      id: 'ira',
      name: 'Roth IRA',
      type: 'Investment',
      investmentAccountType: 'IRA',
    });
    const hsa = account({
      id: 'hsa',
      name: 'Health HSA',
      type: 'Investment',
      investmentAccountType: 'HSA',
      yearlyContribution: 3600,
      employerIncomeSourceId: 'income-source-primary',
      employerMatchRatePercent: 50,
      employerMatchCapPercent: 6,
      employerMatchStartDate: '2026-01-01',
    });

    const repository = createMockAccountRepository({
      initialAccounts: [checkingOne, checkingTwo, taxable, ira, hsa],
    });
    const incomeRepository = createMockIncomeSourceRepository({
      initialSources: [incomeSource()],
    });

    render(
      <FundingSchedulePage
        accountRepository={repository}
        incomeRepository={incomeRepository}
      />,
    );

    expect((await screen.findAllByText('Brokerage'))[0]).toBeInTheDocument();
    expect(screen.queryAllByText('Health HSA')).toHaveLength(0);
    expect(screen.getByRole('tab', { name: 'After-Tax Accounts' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Before-Tax Accounts' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'HSA' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'After-Tax Accounts' })).toBeInTheDocument();
    expect(screen.getAllByText(/Current Contributions:/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText('$4,000.00')[0]).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('% Income (Gross)')).toBeInTheDocument();
    expect(screen.getByText('% Income (Net)')).toBeInTheDocument();
    expect(screen.getByLabelText('Brokerage Sep-26 allocation')).toBeInTheDocument();
    expect(screen.getByLabelText('Roth IRA Sep-26 allocation')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Brokerage Sep-26 allocation'), '3500');
    await userEvent.type(screen.getByLabelText('Roth IRA Sep-26 allocation'), '1000');

    await userEvent.click(screen.getByRole('tab', { name: 'Before-Tax Accounts' }));
    expect(screen.getByRole('heading', { name: 'Before-Tax Accounts' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Roth IRA Sep-26 allocation')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Brokerage Sep-26 allocation')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /remaining/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'HSA' }));
    expect(screen.getByRole('heading', { name: 'HSA Accounts' })).toBeInTheDocument();
    expect(
      screen.getByText((_, element) =>
        element?.textContent === 'Current Contributions: $3,150.00',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: /health hsa employee/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: /health hsa employer match/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /remaining/i })).not.toBeInTheDocument();
    expect(screen.getAllByText('$300.00')[0]).toBeInTheDocument();
    expect(screen.getAllByText('$150.00')[0]).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save changes/i })).not.toBeDisabled();
    });

    const accounts = await repository.listAccounts();
    expect(
      accounts.find((item) => item.id === 'taxable')?.monthlyRecords[8].invest,
    ).toBe(3500);
    expect(accounts.find((item) => item.id === 'ira')?.monthlyRecords[8].invest).toBe(500);
  });

  it('supports shared table column movement and allocation fill-down', async () => {
    const checking = account({
      id: 'checking-one',
      name: 'Primary Checking',
      type: 'Checking',
    });
    checking.monthlyRecords = defaultMonthlyRecords().map((record) => ({
      ...record,
      invest: 1200,
    }));

    const taxable = account({
      id: 'taxable',
      name: 'Brokerage',
      type: 'Investment',
      investmentAccountType: 'Taxable',
    });
    const ira = account({
      id: 'ira',
      name: 'Roth IRA',
      type: 'Investment',
      investmentAccountType: 'IRA',
    });

    const repository = createMockAccountRepository({
      initialAccounts: [checking, taxable, ira],
    });
    const incomeRepository = createMockIncomeSourceRepository({
      initialSources: [incomeSource()],
    });

    render(
      <FundingSchedulePage
        accountRepository={repository}
        incomeRepository={incomeRepository}
      />,
    );

    expect((await screen.findAllByText('Brokerage'))[0]).toBeInTheDocument();

    let columnHeaders = screen.getAllByRole('columnheader');
    expect(columnHeaders[2]).toHaveTextContent('Brokerage');
    expect(columnHeaders[3]).toHaveTextContent('Roth IRA');

    await userEvent.hover(columnHeaders[3]);
    await userEvent.click(screen.getByRole('button', { name: /move roth ira left/i }));

    columnHeaders = screen.getAllByRole('columnheader');
    expect(columnHeaders[2]).toHaveTextContent('Roth IRA');
    expect(columnHeaders[3]).toHaveTextContent('Brokerage');

    const januaryBrokerageCell = screen.getByLabelText('Brokerage Jan-26 allocation');
    await userEvent.click(januaryBrokerageCell);
    await userEvent.clear(januaryBrokerageCell);
    await userEvent.type(januaryBrokerageCell, '500');
    await userEvent.click(
      screen.getByRole('button', {
        name: /auto-populate brokerage from jan-26 down/i,
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    const accounts = await repository.listAccounts();
    expect(accounts.find((item) => item.id === 'taxable')?.monthlyRecords.map(
      (record) => record.invest,
    )).toEqual(Array(12).fill(500));
  });

  it('splits before-tax payroll accounts into employee and employer match columns', async () => {
    const payroll401k = account({
      id: 'payroll-401k',
      name: 'Company 401k',
      type: 'Investment',
      investmentAccountType: '401k',
      yearlyContribution: 12000,
      employerIncomeSourceId: 'income-source-primary',
      employerMatchRatePercent: 50,
      employerMatchCapPercent: 6,
      employerMatchStartDate: '2026-01-01',
    });

    const repository = createMockAccountRepository({
      initialAccounts: [payroll401k],
    });
    const incomeRepository = createMockIncomeSourceRepository({
      initialSources: [incomeSource()],
    });

    render(
      <FundingSchedulePage
        accountRepository={repository}
        incomeRepository={incomeRepository}
      />,
    );

    await userEvent.click(await screen.findByRole('tab', { name: 'Before-Tax Accounts' }));

    expect(
      screen.getByRole('columnheader', { name: /company 401k employee/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: /company 401k employer match/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /remaining/i })).not.toBeInTheDocument();
    expect(screen.getAllByText('$1,000.00')[0]).toBeInTheDocument();
    expect(screen.getAllByText('$200.00')[0]).toBeInTheDocument();
  });
});
