import { render, screen, within } from '@testing-library/react';
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
  it('shows monthly posture and a master category list', async () => {
    render(
      <BudgetPage
        budgetRepository={createMockBudgetRepository()}
        incomeRepository={createMockIncomeSourceRepository({
          initialSources: [incomeSource()],
        })}
      />,
    );

    expect(await screen.findByText('Monthly Posture')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Expand Housing category/i })).toBeInTheDocument();
    expect(screen.getByText('Essential Budget: $2,620.00')).toBeInTheDocument();
    expect(screen.getByText('Total Budget: $2,900.00')).toBeInTheDocument();
    expect(screen.getByText('Budget category list')).toBeInTheDocument();
    expect(screen.getByText('Master categories')).toBeInTheDocument();
    expect(screen.queryByLabelText('Sort categories')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Essential', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Discretionary', level: 3 })).toBeInTheDocument();
    expect(screen.getByLabelText('Budget allocation')).toBeInTheDocument();
    expect(screen.queryByText('Yearly Budget')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Expand Housing category/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('expands a category accordion and shows its components', async () => {
    render(
      <BudgetPage
        budgetRepository={createMockBudgetRepository()}
        incomeRepository={createMockIncomeSourceRepository({
          initialSources: [incomeSource()],
        })}
      />,
    );

    expect(await screen.findByRole('button', { name: /Expand Housing category/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Expand Utilities category/i }));

    expect(await screen.findByDisplayValue('Electricity')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Internet')).toBeInTheDocument();
    expect(screen.getByText('Components')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Collapse Utilities category/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('can collapse an expanded category accordion', async () => {
    const user = userEvent.setup();

    render(
      <BudgetPage
        budgetRepository={createMockBudgetRepository()}
        incomeRepository={createMockIncomeSourceRepository({
          initialSources: [incomeSource()],
        })}
      />,
    );

    const expandUtilities = await screen.findByRole('button', {
      name: /Expand Utilities category/i,
    });

    await user.click(expandUtilities);
    expect(await screen.findByDisplayValue('Electricity')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Collapse Utilities category/i }));

    expect(screen.queryByDisplayValue('Electricity')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Expand Utilities category/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('keeps category groups amount-descending and exposes allocation details from the legend', async () => {
    const user = userEvent.setup();
    render(
      <BudgetPage
        budgetRepository={createMockBudgetRepository()}
        incomeRepository={createMockIncomeSourceRepository({ initialSources: [incomeSource()] })}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Essential', level: 3 })).toBeInTheDocument();
    expect(screen.queryByLabelText('Sort categories')).not.toBeInTheDocument();

    await user.hover(screen.getByRole('button', { name: /Housing: \$1,450\.00/i }));
    expect(within(screen.getByLabelText('Budget allocation')).getByText('50.0%')).toBeInTheDocument();
  });

  it('updates essential coverage when a category is reclassified', async () => {
    const user = userEvent.setup();
    render(
      <BudgetPage
        budgetRepository={createMockBudgetRepository()}
        incomeRepository={createMockIncomeSourceRepository({ initialSources: [incomeSource()] })}
      />,
    );

    await user.click(await screen.findByRole('button', { name: /Expand Lifestyle category/i }));
    const classification = screen.getByRole('checkbox');
    expect(classification).not.toBeChecked();

    await user.click(classification);
    expect(classification).toBeChecked();
    expect(screen.getAllByText('Essential Budget: $2,900.00')).toHaveLength(1);
  });
});
