import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { IncomeSource } from '../../domain/incomeSource';
import { createMockIncomeSourceRepository } from '../../domain/incomeSourceRepository';
import { IncomeSourcesPage } from './IncomeSourcesPage';

const renderPage = (initialSources: IncomeSource[] = []) => {
  const repository = createMockIncomeSourceRepository({ initialSources });
  render(<IncomeSourcesPage repository={repository} />);
  return repository;
};

const source = (
  overrides: Partial<IncomeSource> & Pick<IncomeSource, 'id' | 'name'>,
): IncomeSource => {
  const { id, name, ...rest } = overrides;

  return {
    id,
    name,
    type: 'Salary',
    cadence: 'Bi-weekly',
    periods: [
      {
        id: `${id}-period-1`,
        startDate: '2026-01-01',
        yearlyGrossAmount: 130000,
        netPercentage: 72,
      },
    ],
    status: 'Active',
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
    ...rest,
  };
};

async function fillRequiredCreateFields() {
  await userEvent.type(screen.getByLabelText(/source name/i), 'Main job');
  await userEvent.type(screen.getByLabelText(/start date/i), '2026-01-01');
  await userEvent.type(screen.getByLabelText(/yearly gross pay/i), '130000');
  await userEvent.type(screen.getByLabelText(/net percentage/i), '72');
}

describe('IncomeSourcesPage', () => {
  it('starts from an empty state and creates an income source', async () => {
    renderPage();

    expect(await screen.findByText(/no income sources yet/i)).toBeInTheDocument();

    await userEvent.click(
      screen.getAllByRole('button', { name: /add income source/i })[0],
    );
    await fillRequiredCreateFields();
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText('Main job')).toBeInTheDocument();
    expect(screen.getByText('$10,833.33')).toBeInTheDocument();
    expect(screen.getByText('$130,000.00')).toBeInTheDocument();
    expect(screen.getByText('$7,800.00')).toBeInTheDocument();
    expect(screen.getByText('$93,600.00')).toBeInTheDocument();
    expect(screen.getByText('72%')).toBeInTheDocument();
    expect(screen.getByText(/1 period/i)).toBeInTheDocument();
  });

  it('blocks blank required fields and invalid period values', async () => {
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: /add income source/i }),
    );
    await userEvent.type(screen.getByLabelText(/yearly gross pay/i), '-1');
    await userEvent.type(screen.getByLabelText(/net percentage/i), '101');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(screen.getByText(/enter a source name/i)).toBeInTheDocument();
    expect(screen.getByText(/enter a start date/i)).toBeInTheDocument();
    expect(screen.getByText(/enter a positive yearly gross amount/i)).toBeInTheDocument();
    expect(screen.getByText(/enter a net percentage from 1 to 100/i)).toBeInTheDocument();
  });

  it('keeps salary type and bi-weekly cadence fixed', async () => {
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: /add income source/i }),
    );

    expect(screen.getByText('Salary')).toBeInTheDocument();
    expect(screen.getByText('Bi-weekly')).toBeInTheDocument();
    expect(screen.queryByLabelText(/source type/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /cadence/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/payment timing note/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/notes/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/end date/i)).toBeInTheDocument();
  });

  it('adds multiple non-overlapping periods under one source', async () => {
    const repository = renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: /add income source/i }),
    );
    await fillRequiredCreateFields();
    await userEvent.type(screen.getByLabelText(/end date/i), '2026-12-31');
    await userEvent.click(screen.getByRole('button', { name: /add period/i }));

    const startDates = screen.getAllByLabelText(/start date/i);
    const yearlyGrossFields = screen.getAllByLabelText(/yearly gross pay/i);
    const netPercentageFields = screen.getAllByLabelText(/net percentage/i);

    await userEvent.type(startDates[1], '2027-01-01');
    await userEvent.type(yearlyGrossFields[1], '140000');
    await userEvent.type(netPercentageFields[1], '73');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText('Main job')).toBeInTheDocument();
    expect(screen.getByText(/2 periods/i)).toBeInTheDocument();
    const [savedSource] = await repository.listIncomeSources();
    expect(savedSource.periods).toHaveLength(2);
  });

  it('blocks overlapping periods for the same source', async () => {
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: /add income source/i }),
    );
    await fillRequiredCreateFields();
    await userEvent.type(screen.getByLabelText(/end date/i), '2026-12-31');
    await userEvent.click(screen.getByRole('button', { name: /add period/i }));

    const startDates = screen.getAllByLabelText(/start date/i);
    const yearlyGrossFields = screen.getAllByLabelText(/yearly gross pay/i);
    const netPercentageFields = screen.getAllByLabelText(/net percentage/i);

    await userEvent.type(startDates[1], '2026-06-01');
    await userEvent.type(yearlyGrossFields[1], '140000');
    await userEvent.type(netPercentageFields[1], '73');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(
      screen.getAllByText(/periods cannot overlap for the same source/i),
    ).toHaveLength(2);
  });

  it('sorts active sources first and filters by status', async () => {
    renderPage([
      source({ id: '2', name: 'Zoo side work', status: 'Inactive' }),
      source({ id: '1', name: 'Alpha job', status: 'Active' }),
      source({ id: '3', name: 'Beta job', status: 'Active' }),
    ]);

    await screen.findByText('Alpha job');
    const rows = screen.getAllByRole('article');
    expect(within(rows[0]).getByText('Alpha job')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Beta job')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Inactive' }));
    expect(screen.getByText('Zoo side work')).toBeInTheDocument();
    expect(screen.queryByText('Alpha job')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(screen.getByText('Alpha job')).toBeInTheDocument();
    expect(screen.getByText('Zoo side work')).toBeInTheDocument();
  });

  it('edits an income source without changing identity', async () => {
    const repository = renderPage([
      source({ id: 'stable-id', name: 'Old name' }),
    ]);

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    await userEvent.clear(screen.getByLabelText(/source name/i));
    await userEvent.type(screen.getByLabelText(/source name/i), 'New name');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText('New name')).toBeInTheDocument();
    const [savedSource] = await repository.listIncomeSources();
    expect(savedSource.id).toBe('stable-id');
  });

  it('deactivates and reactivates sources across filters', async () => {
    renderPage([source({ id: '1', name: 'Main job' })]);

    await userEvent.click(
      await screen.findByRole('button', { name: /mark inactive/i }),
    );
    expect(await screen.findByText(/no active sources/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Inactive' }));
    await userEvent.click(screen.getByRole('button', { name: /reactivate/i }));
    expect(await screen.findByText('Main job')).toBeInTheDocument();
    expect(within(screen.getByRole('article')).getByText('Active')).toBeInTheDocument();
  });

  it('preserves values after save failure and allows retry', async () => {
    let shouldFail = true;
    const repository = createMockIncomeSourceRepository({
      shouldFail: () => shouldFail,
    });
    render(<IncomeSourcesPage repository={repository} />);

    await userEvent.click(
      await screen.findByRole('button', { name: /add income source/i }),
    );
    await fillRequiredCreateFields();
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to save/i);
    expect(screen.getByDisplayValue('Main job')).toBeInTheDocument();

    shouldFail = false;
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(await screen.findByText('Main job')).toBeInTheDocument();
  });

  it('warns before discarding unsaved form changes', async () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: /add income source/i }),
    );
    await userEvent.type(screen.getByLabelText(/source name/i), 'Draft source');
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByDisplayValue('Draft source')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(await screen.findByText(/no income sources yet/i)).toBeInTheDocument();
  });

  it('keeps filter controls keyboard reachable', async () => {
    renderPage([source({ id: '1', name: 'Main job' })]);
    await screen.findByText('Main job');

    await userEvent.tab();
    expect(screen.getByRole('button', { name: /add income source/i })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('tab', { name: 'All' })).toHaveFocus();
  });
});
