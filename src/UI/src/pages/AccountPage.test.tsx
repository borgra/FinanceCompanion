import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { BudgetRepository } from '../domain/budgetRepository';
import { createMockAccountRepository } from '../domain/accountRepository';
import type { Account } from '../domain/account';
import type { IncomeSourceRepository } from '../domain/incomeSourceRepository';
import { AccountPage } from './AccountPage';

const renderPage = (initialAccounts?: Account[]) => {
  const repository = createMockAccountRepository({ initialAccounts });
  const mockIncomeRepository: IncomeSourceRepository = {
    listIncomeSources: () => Promise.resolve([
      {
        id: 'income-source-primary',
        name: 'Primary job',
        type: 'Salary',
        cadence: 'Bi-weekly',
        periods: [
          {
            id: 'primary-period',
            startDate: '2026-01-01',
            yearlyGrossAmount: 120000,
            netPercentage: 75,
          }
        ],
        status: 'Active',
        createdAt: '2026-06-30T00:00:00.000Z',
        updatedAt: '2026-06-30T00:00:00.000Z',
      }
    ]),
    createIncomeSource: () => Promise.reject(),
    updateIncomeSource: () => Promise.reject(),
    setIncomeSourceStatus: () => Promise.reject(),
  };

  const mockBudgetRepository: BudgetRepository = {
    listCategoriesWithSubCategories: () => Promise.resolve([
      {
        id: 'cat-housing',
        name: 'Housing',
        colorHex: '#4de3ff',
        createdAt: '2026-06-30T00:00:00.000Z',
        updatedAt: '2026-06-30T00:00:00.000Z',
        subCategories: [
          {
            id: 'sub-house',
            categoryId: 'cat-housing',
            name: 'Rent',
            monthlyAmountUsd: 1350,
            createdAt: '2026-06-30T00:00:00.000Z',
            updatedAt: '2026-06-30T00:00:00.000Z',
          }
        ]
      }
    ]),
    createCategory: () => Promise.reject(),
    updateCategory: () => Promise.reject(),
    deleteCategory: () => Promise.reject(),
    createSubCategory: () => Promise.reject(),
    updateSubCategory: () => Promise.reject(),
    deleteSubCategory: () => Promise.reject(),
  };

  render(
    <AccountPage
      accountRepository={repository}
      budgetRepository={mockBudgetRepository}
      incomeRepository={mockIncomeRepository}
    />,
  );

  return repository;
};

describe('AccountPage', () => {
  it('updates an account from the edit modal', async () => {
    const repository = renderPage();

    expect(await screen.findByText('Liberty Federal Credit Union')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: /edit liberty federal credit union/i }),
    );

    const nameInput = screen.getByLabelText(/account name/i);
    const balanceInput = screen.getByLabelText(/starting balance/i);

    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Updated Checking');
    await userEvent.clear(balanceInput);
    await userEvent.type(balanceInput, '45000');
    await userEvent.click(screen.getByRole('button', { name: /save account/i }));

    expect(
      await screen.findByRole('button', { name: /edit updated checking/i }),
    ).toBeInTheDocument();

    const accounts = await repository.listAccounts();
    const updatedAccount = accounts.find((account) => account.id === 'acc-lfcu');

    expect(updatedAccount?.name).toBe('Updated Checking');
    expect(updatedAccount?.startingBalance).toBe(45000);
  });

  it('opens add account with a fresh draft instead of editing an existing account', async () => {
    const repository = renderPage();

    expect(await screen.findByText('Liberty Federal Credit Union')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: /edit liberty federal credit union/i }),
    );
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await userEvent.click(screen.getByRole('button', { name: /^add account$/i }));

    expect(screen.getByRole('heading', { name: /add new account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/account name/i)).toHaveValue('');

    await userEvent.type(screen.getByLabelText(/account name/i), 'Travel Savings');
    await userEvent.type(screen.getByLabelText(/starting balance/i), '1200');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(
      await screen.findByRole('button', { name: /edit travel savings/i }),
    ).toBeInTheDocument();

    const accounts = await repository.listAccounts();

    expect(accounts).toHaveLength(4);
    expect(accounts.some((account) => account.name === 'Liberty Federal Credit Union')).toBe(true);
    expect(accounts.some((account) => account.name === 'Travel Savings')).toBe(true);
    expect(accounts.find((account) => account.name === 'Travel Savings')?.columns).toEqual([]);
  });

  it('shows account metadata as read-only labels in the workspace', async () => {
    renderPage();

    expect(await screen.findByText('Liberty Federal Credit Union')).toBeInTheDocument();

    expect(screen.getByLabelText(/account details/i)).toBeInTheDocument();
    expect(screen.getByText('Start Month')).toBeInTheDocument();
    expect(screen.getByText('Yield / APY')).toBeInTheDocument();
    expect(screen.queryByText('Account Name')).not.toBeInTheDocument();
    expect(screen.queryByText('Start Balance')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/edit account name/i)).not.toBeInTheDocument();
  });

  it('keeps selector current balance tied to the account current-month net total', async () => {
    renderPage();

    const primaryName = await screen.findByText('Liberty Federal Credit Union');
    const primarySelector = primaryName.closest('.account-selector-item');

    expect(primarySelector).toHaveTextContent('Current Balance: ($6,985.00)');

    await userEvent.click(screen.getByText('High-Yield Savings'));

    expect(primarySelector).toHaveTextContent('Current Balance: ($6,985.00)');
  });

  it('does not credit income to accounts without an assigned income source', async () => {
    renderPage();

    await screen.findByText('Liberty Federal Credit Union');
    await userEvent.click(screen.getByText('Secondary Checking'));

    expect(screen.getByText('Total Credits (Year)').nextElementSibling).toHaveTextContent(/\$\s*-/);
  });

  it('enforces account name and starting balance limits in the modal', async () => {
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /^add account$/i }));

    const nameInput = screen.getByLabelText(/account name/i) as HTMLInputElement;
    const balanceInput = screen.getByLabelText(/starting balance/i) as HTMLInputElement;
    const saveButton = screen.getByRole('button', { name: /create account/i });

    expect(nameInput.maxLength).toBe(100);
    expect(balanceInput.maxLength).toBe(14);

    await userEvent.type(nameInput, 'Bounded account');
    await userEvent.type(balanceInput, '1000000000');

    expect(saveButton).toBeDisabled();

    await userEvent.clear(balanceInput);
    await userEvent.type(balanceInput, '999999999.99');

    expect(saveButton).toBeEnabled();
  });

  it('only allows an income source to be credited to one account', async () => {
    renderPage();

    expect(await screen.findByText('Liberty Federal Credit Union')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /edit liberty federal credit union/i }));

    expect(screen.getByLabelText(/primary job/i)).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await userEvent.click(screen.getByRole('button', { name: /^add account$/i }));

    expect(screen.getByLabelText(/primary job/i)).toBeDisabled();
    expect(screen.getByText(/assigned to liberty federal credit union/i)).toBeInTheDocument();
  });

  it('lets account columns be added and moved in the ledger table', async () => {
    const repository = renderPage();

    expect(await screen.findByText('Liberty Federal Credit Union')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/new account column name/i), 'Travel');
    await userEvent.click(screen.getByRole('button', { name: /add column/i }));

    expect(screen.getByRole('columnheader', { name: /travel/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /move travel left/i }));
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    const accounts = await repository.listAccounts();
    const updatedAccount = accounts.find((account) => account.id === 'acc-lfcu');
    const columnNames = updatedAccount?.columns.map((column) => column.name);

    expect(columnNames?.slice(-2)).toEqual(['Travel', 'Misc']);
  });

  it('moves focus to the same ledger column in the next row when pressing Enter', async () => {
    renderPage();

    expect(await screen.findByText('Liberty Federal Credit Union')).toBeInTheDocument();

    const firstInvestCell = document.querySelector<HTMLInputElement>('[data-ledger-cell="invest-0"]');
    const secondInvestCell = document.querySelector<HTMLInputElement>('[data-ledger-cell="invest-1"]');

    expect(firstInvestCell).not.toBeNull();
    expect(secondInvestCell).not.toBeNull();

    await userEvent.click(firstInvestCell!);
    await userEvent.keyboard('{Enter}');

    await waitFor(() => expect(document.activeElement).toBe(secondInvestCell));
  });

  it('shows the starting balance as current balance when an account has no monthly rows', async () => {
    renderPage([
      {
        id: 'acc-empty',
        name: 'Sparse Checking',
        type: 'Checking',
        startingBalance: 100,
        startDate: '2026-07-01',
        yieldRate: 0,
        assignedIncomeSourceIds: [],
        columns: [],
        monthlyRecords: [],
        createdAt: '2026-06-30T00:00:00.000Z',
        updatedAt: '2026-06-30T00:00:00.000Z',
      },
    ]);

    const accountName = await screen.findByText('Sparse Checking');
    const selector = accountName.closest('.account-selector-item');

    expect(selector).toHaveTextContent('Current Balance: $100.00');
  });

  it('auto-populates an editable ledger value down through future rows', async () => {
    const repository = renderPage();

    expect(await screen.findByText('Liberty Federal Credit Union')).toBeInTheDocument();

    const januaryInvestCell = document.querySelector<HTMLInputElement>('[data-ledger-cell="invest-0"]');
    expect(januaryInvestCell).not.toBeNull();

    await userEvent.click(januaryInvestCell!);
    await userEvent.clear(januaryInvestCell!);
    await userEvent.type(januaryInvestCell!, '500');
    await userEvent.click(
      screen.getByRole('button', { name: /auto-populate invest from jan-26 down/i }),
    );
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    const accounts = await repository.listAccounts();
    const updatedAccount = accounts.find((account) => account.id === 'acc-lfcu');

    expect(updatedAccount?.monthlyRecords.map((record) => record.invest)).toEqual(
      Array(12).fill(500),
    );
  });

  it('auto-populates an account column value down through future rows', async () => {
    const repository = renderPage();

    expect(await screen.findByText('Liberty Federal Credit Union')).toBeInTheDocument();

    const januaryHouseCell = document.querySelector<HTMLInputElement>('[data-ledger-cell="outflow-house-0"]');
    expect(januaryHouseCell).not.toBeNull();

    await userEvent.click(januaryHouseCell!);
    await userEvent.clear(januaryHouseCell!);
    await userEvent.type(januaryHouseCell!, '500');
    await userEvent.click(
      screen.getByRole('button', { name: /auto-populate house from jan-26 down/i }),
    );
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    const accounts = await repository.listAccounts();
    const updatedAccount = accounts.find((account) => account.id === 'acc-lfcu');

    expect(updatedAccount?.monthlyRecords.map((record) => record.outflows.house)).toEqual(
      Array(12).fill(500),
    );
  });
});
