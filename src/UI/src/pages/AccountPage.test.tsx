import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { BudgetRepository } from '../domain/budgetRepository';
import { createMockAccountRepository } from '../domain/accountRepository';
import type { IncomeSourceRepository } from '../domain/incomeSourceRepository';
import { AccountPage } from './AccountPage';

const renderPage = () => {
  const repository = createMockAccountRepository();
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

    await userEvent.click(screen.getByRole('button', { name: /add new account/i }));

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
  });

  it('shows account metadata as read-only labels in the workspace', async () => {
    renderPage();

    expect(await screen.findByText('Liberty Federal Credit Union')).toBeInTheDocument();

    expect(screen.getByLabelText(/account details/i)).toBeInTheDocument();
    expect(screen.getByText('Start Date')).toBeInTheDocument();
    expect(screen.getByText('Yield / APY')).toBeInTheDocument();
    expect(screen.queryByText('Account Name')).not.toBeInTheDocument();
    expect(screen.queryByText('Start Balance')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/edit account name/i)).not.toBeInTheDocument();
  });

  it('enforces account name and starting balance limits in the modal', async () => {
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /add new account/i }));

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
});
