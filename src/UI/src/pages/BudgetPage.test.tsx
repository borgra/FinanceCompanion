import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { IncomeSource } from '../domain/incomeSource';
import { createMockBudgetRepository } from '../domain/budgetRepository';
import { createMockIncomeSourceRepository } from '../domain/incomeSourceRepository';
import { BudgetPage } from './BudgetPage';

const incomeSource = (overrides: Partial<IncomeSource> = {}): IncomeSource => ({
  id: 'income-1',
  name: 'Primary Salary',
  type: 'Salary',
  cadence: 'Bi-weekly',
  periods: [
    {
      id: 'period-1',
      startDate: '2026-01-01',
      yearlyGrossAmount: 120000,
      netPercentage: 75,
    },
  ],
  status: 'Active',
  createdAt: '2026-06-30T00:00:00.000Z',
  updatedAt: '2026-06-30T00:00:00.000Z',
  ...overrides,
});

describe('BudgetPage', () => {
  it('shows monthly posture and a clearer category workspace', async () => {
    render(
      <BudgetPage
        budgetRepository={createMockBudgetRepository()}
        incomeRepository={createMockIncomeSourceRepository({
          initialSources: [incomeSource()],
        })}
      />,
    );

    expect(await screen.findByText('Monthly Posture')).toBeInTheDocument();
    expect(await screen.findByText('Housing')).toBeInTheDocument();
    expect(screen.getByText('Income Budgeted')).toBeInTheDocument();
    expect(screen.getByText('What needs money every month?')).toBeInTheDocument();
    expect(screen.getByText('Yearly Budget')).toBeInTheDocument();
  });

  it('switches category cards and updates the workspace summary', async () => {
    render(
      <BudgetPage
        budgetRepository={createMockBudgetRepository()}
        incomeRepository={createMockIncomeSourceRepository({
          initialSources: [incomeSource()],
        })}
      />,
    );

    expect(await screen.findByText('Housing')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Utilities'));

    expect(await screen.findByDisplayValue('Electricity')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Internet')).toBeInTheDocument();
    expect(screen.getByText('Line items')).toBeInTheDocument();
  });
});
