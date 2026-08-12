import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '../domain/account';
import { defaultMonthlyRecords } from '../domain/account';
import type { MonthlyNetWorthSnapshots } from '../domain/netWorth';
import { NetWorthSnapshotPanel } from './NetWorthSnapshotPanel';

const account = (id: string, name: string): Account => ({
  id,
  name,
  type: 'Checking',
  startingBalance: 0,
  startDate: '2026-01-01',
  yieldRate: 0,
  assignedIncomeSourceIds: [],
  columns: [],
  monthlyRecords: defaultMonthlyRecords(),
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const formatMoney = (value: number) => `$${value.toFixed(2)}`;

describe('NetWorthSnapshotPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('captures the displayed values with the local date and saves edited values', async () => {
    vi.setSystemTime(new Date(2026, 7, 11, 22, 30));
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue({ beginningNetWorth: 0, monthlySnapshots: {}, updatedAt: '' });
    render(<NetWorthSnapshotPanel
      accounts={[account('checking', 'Checking'), account('savings', 'Savings')]}
      currentValues={new Map([['checking', 1200], ['savings', 3000]])}
      homeEquity={50000}
      includeHomeEquity
      monthlySnapshots={{}}
      formatMoney={formatMoney}
      onSave={onSave}
    />);

    await user.click(screen.getByRole('button', { name: 'Take August 2026 snapshot' }));
    expect(screen.getByText('Captured August 11, 2026. Changes here update this snapshot only, not your live accounts.')).toBeInTheDocument();
    const checking = screen.getByRole('textbox', { name: 'Checking snapshot value' });
    await user.clear(checking);
    await user.type(checking, '1500');
    await user.click(screen.getByRole('button', { name: 'Save snapshot' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('2026-08', expect.objectContaining({
      asOfDate: '2026-08-11',
      homeEquity: 50000,
      accountValues: {
        checking: { accountName: 'Checking', value: 1500 },
        savings: { accountName: 'Savings', value: 3000 },
      },
    })));
  });

  it('requires confirmation and atomically submits fresh values when replacing the same month', async () => {
    vi.setSystemTime(new Date(2026, 7, 20, 9));
    const user = userEvent.setup();
    const existing: MonthlyNetWorthSnapshots = {
      '2026-08': { asOfDate: '2026-08-03', accountValues: { old: { accountName: 'Removed account', value: 999 } } },
      '2026-07': { asOfDate: '2026-07-10', accountValues: { checking: { accountName: 'Checking', value: 1000 } } },
    };
    const onSave = vi.fn().mockResolvedValue({ beginningNetWorth: 0, monthlySnapshots: existing, updatedAt: '' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<NetWorthSnapshotPanel
      accounts={[account('checking', 'Checking')]}
      currentValues={new Map([['checking', 2200]])}
      homeEquity={0}
      includeHomeEquity={false}
      monthlySnapshots={existing}
      formatMoney={formatMoney}
      onSave={onSave}
    />);

    await user.click(screen.getByRole('button', { name: 'Update August 2026 snapshot' }));
    await user.click(screen.getByRole('button', { name: 'Replace snapshot' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Replace snapshot' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('2026-08', {
      asOfDate: '2026-08-20',
      accountValues: { checking: { accountName: 'Checking', value: 2200 } },
    }));
  });

  it('keeps an edited draft available when saving fails', async () => {
    vi.setSystemTime(new Date(2026, 7, 11, 12));
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error('save failed'));
    render(<NetWorthSnapshotPanel accounts={[account('checking', 'Checking')]} currentValues={new Map([['checking', 1000]])} homeEquity={0} includeHomeEquity={false} monthlySnapshots={{}} formatMoney={formatMoney} onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Take August 2026 snapshot' }));
    const checking = screen.getByRole('textbox', { name: 'Checking snapshot value' });
    await user.clear(checking);
    await user.type(checking, '1750');
    await user.click(screen.getByRole('button', { name: 'Save snapshot' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your changes are still here');
    expect(checking).toHaveValue('$1750.00');
    expect(screen.getByRole('button', { name: 'Save snapshot' })).toBeEnabled();
  });
  it('announces invalid values, blocks save, and restores focus after cancel', async () => {
    vi.setSystemTime(new Date(2026, 7, 11, 12));
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<NetWorthSnapshotPanel accounts={[account('checking', 'Checking')]} currentValues={new Map([['checking', 1000]])} homeEquity={0} includeHomeEquity={false} monthlySnapshots={{}} formatMoney={formatMoney} onSave={onSave} />);
    const trigger = screen.getByRole('button', { name: 'Take August 2026 snapshot' });
    await user.click(trigger);
    expect(screen.getByRole('heading', { name: 'August 2026 snapshot' })).toHaveFocus();
    const checking = screen.getByRole('textbox', { name: 'Checking snapshot value' });
    await user.clear(checking);
    expect(checking).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Enter a valid amount.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save snapshot' })).toBeDisabled();
    await user.type(checking, '2000');
    expect(checking).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByRole('button', { name: 'Save snapshot' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});