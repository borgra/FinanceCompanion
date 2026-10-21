import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Account } from '../domain/account';
import { createMockAccountRepository } from '../domain/accountRepository';
import type { Holding, SecurityPayoutDetails } from '../domain/holding';
import { createMockHoldingRepository } from '../domain/holdingRepository';
import { HoldingsPage } from './HoldingsPage';

const account: Account = {
  id: 'account', name: 'Brokerage', type: 'Investment', startingBalance: 0,
  startDate: '2026-01-01', yieldRate: 0, assignedIncomeSourceIds: [],
  investmentAccountType: 'Taxable', manageHoldings: true, yearlyContribution: 0,
  columns: [], monthlyRecords: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};

describe('HoldingsPage dividend management', () => {
  it('waits for the holding refresh to finish before allowing payment removal in details', async () => {
    const user = userEvent.setup();
    const repository = createMockHoldingRepository();
    const holding = await repository.createHolding({
      security: { symbol: 'VTI', name: 'VTI', exchange: 'NYSE', assetType: 'ETF', currency: 'USD', payoutDetails: [{ exDividendDate: '2026-01-01', amount: 1 }] },
      accountPositions: [{ accountId: account.id, quantity: 10 }],
    });
    let complete!: () => void;
    const pending = new Promise<void>((resolve) => { complete = resolve; });
    vi.spyOn(repository, 'refreshHoldingDividends').mockImplementation(async () => { await pending; return holding; });
    const remove = vi.spyOn(repository, 'removeHoldingPayments');
    render(<HoldingsPage accountRepository={createMockAccountRepository({ initialAccounts: [account] })} holdingRepository={repository} />);
    await user.click(await screen.findByRole('button', { name: 'Update VTI dividends' }));
    const details = screen.getByRole('button', { name: 'View VTI security details' });
    expect(details).toBeDisabled();
    await user.click(details);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
    await act(async () => complete());
    expect(details).toBeEnabled();
    await user.click(details);
    expect(screen.getByRole('button', { name: 'Remove payments' })).toBeEnabled();
  });

  it.each([false, true])('keeps the current dialog selection after a pending removal (open another: %s)', async (openAnother) => {
    const user = userEvent.setup();
    const repository = createMockHoldingRepository();
    const security = {
      symbol: 'VTI', name: 'VTI Fund', exchange: 'NYSE', assetType: 'ETF', currency: 'USD',
      payoutDetails: [{ exDividendDate: '2026-01-01', amount: 1 }],
    };
    await repository.createHolding({ security, accountPositions: [{ accountId: account.id, quantity: 10 }] });
    await repository.createHolding({ security: { ...security, symbol: 'OTHER' }, accountPositions: [{ accountId: account.id, quantity: 3 }] });
    let complete!: () => void;
    const pending = new Promise<void>((resolve) => { complete = resolve; });
    const remove = repository.removeHoldingPayments!;
    vi.spyOn(repository, 'removeHoldingPayments').mockImplementation(async (id) => { await pending; return remove(id); });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      render(<HoldingsPage accountRepository={createMockAccountRepository({ initialAccounts: [account] })} holdingRepository={repository} />);
      await user.click(await screen.findByRole('button', { name: 'View VTI security details' }));
      await user.click(screen.getByRole('button', { name: 'Remove payments' }));
      expect(screen.getByRole('button', { name: 'Removing payments…' })).toBeDisabled();
      await user.click(screen.getByRole('button', { name: 'Close security details' }));
      if (openAnother) await user.click(screen.getByRole('button', { name: 'View OTHER security details' }));
      await act(async () => complete());
      await screen.findByText('VTI payments were removed.');
      expect(screen.queryByRole('dialog', { name: 'VTI security details' })).not.toBeInTheDocument();
      if (openAnother) expect(screen.getByRole('dialog', { name: 'OTHER security details' })).toBeInTheDocument();
      else expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    } finally { confirm.mockRestore(); }
  });

  it('removes payments from the selected security modal and keeps unsaved holding changes', async () => {
    const user = userEvent.setup();
    const repository = createMockHoldingRepository();
    const payout: SecurityPayoutDetails = { exDividendDate: '2026-01-01', amount: 1, mode: 'manual' };
    const holding = await repository.createHolding({
      security: {
        symbol: 'VTI', name: 'VTI Fund', exchange: 'NYSE', assetType: 'ETF', currency: 'USD', price: 100,
        dividendGrowthRate: 0.05, payoutDetails: [payout], manualPayoutDetails: [payout],
      },
      accountPositions: [{ accountId: account.id, quantity: 10 }],
      manageDividends: false,
    });
    const remove = vi.spyOn(repository, 'removeHoldingPayments');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      render(<HoldingsPage accountRepository={createMockAccountRepository({ initialAccounts: [account] })} holdingRepository={repository} />);
      const price = await screen.findByLabelText('VTI price');
      await user.clear(price);
      await user.type(price, '222');
      await user.click(screen.getByRole('button', { name: 'View VTI security details' }));
      expect(screen.getByText('2026-01-01 · Actual · $1.00 USD per share')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Remove payments' }));
      await screen.findByText('No distribution events are available.');
      expect(remove).toHaveBeenCalledExactlyOnceWith(holding.id);
      expect(screen.getByLabelText('Dividend growth rate (%)')).toHaveValue(5);
      expect((await repository.listHoldings())[0].security.price).toBe(100);
      await user.clear(screen.getByLabelText('Dividend growth rate (%)'));
      await user.type(screen.getByLabelText('Dividend growth rate (%)'), '7');
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }));
      await screen.findByText('VTI dividend growth rate was saved.');
      await user.click(screen.getByRole('button', { name: 'Close security details' }));
      expect(screen.getByLabelText('VTI price')).toHaveValue('$222.00');
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
      const persisted = (await repository.listHoldings())[0];
      expect(persisted.manageDividends).toBe(false);
      expect(persisted.security.payoutDetails).toEqual([]);
      expect(persisted.security.price).toBe(222);
      expect(persisted.security.dividendGrowthRate).toBe(0.07);
    } finally { confirm.mockRestore(); }
  });

  it('saves the setting, keeps saved payments, and skips refresh until re-enabled and saved', async () => {
    const user = userEvent.setup();
    const repository = createMockHoldingRepository();
    const holding = await repository.createHolding({
      security: {
        symbol: 'VTI', name: 'VTI Fund', exchange: 'NYSE', assetType: 'ETF', currency: 'USD',
        payoutDetails: [{ exDividendDate: '2026-01-01', amount: 1, mode: 'manual' }],
      },
      accountPositions: [{ accountId: account.id, quantity: 10 }],
    });
    const refresh = vi.spyOn(repository, 'refreshHoldingDividends');
    const accountRepository = createMockAccountRepository({ initialAccounts: [account] });
    const view = render(<HoldingsPage accountRepository={accountRepository} holdingRepository={repository} />);
    const checkbox = await screen.findByRole('checkbox', { name: 'Manage Dividends for VTI' });
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(screen.getByRole('button', { name: 'Update VTI dividends' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Holdings saved.');
    expect((await repository.listHoldings())[0]).toMatchObject({
      manageDividends: false,
      security: { payoutDetails: holding.security.payoutDetails },
    });
    view.unmount();
    render(<HoldingsPage accountRepository={accountRepository} holdingRepository={repository} />);
    expect(await screen.findByRole('checkbox', { name: 'Manage Dividends for VTI' })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Update VTI dividends' }));
    expect(refresh).not.toHaveBeenCalled();
    await user.click(screen.getByRole('checkbox', { name: 'Manage Dividends for VTI' }));
    expect(screen.getByRole('button', { name: 'Update VTI dividends' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Holdings saved.');
    expect(screen.getByRole('button', { name: 'Update VTI dividends' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Update VTI dividends' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledWith(holding.id));
  });

  it('defaults legacy holdings to enabled and retains the edited setting after save failure', async () => {
    const user = userEvent.setup();
    const repository = createMockHoldingRepository();
    const legacy: Holding = {
      id: 'legacy', security: { symbol: 'VTI', name: 'VTI Fund', exchange: 'NYSE', assetType: 'ETF', currency: 'USD' },
      accountPositions: [{ accountId: account.id, quantity: 10 }], createdAt: '', updatedAt: '',
    };
    vi.spyOn(repository, 'listHoldings').mockResolvedValue([legacy]);
    const save = vi.spyOn(repository, 'updateHoldingsBatch').mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce([{ ...legacy, manageDividends: false }]);
    render(<HoldingsPage accountRepository={createMockAccountRepository({ initialAccounts: [account] })} holdingRepository={repository} />);
    const checkbox = await screen.findByRole('checkbox', { name: 'Manage Dividends for VTI' });
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to save holdings.');
    expect(checkbox).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Holdings saved.');
    expect(save).toHaveBeenLastCalledWith([expect.objectContaining({ draft: expect.objectContaining({ manageDividends: false }) })]);
  });
});

describe('HoldingsPage manual distributions', () => {
  it.each([true, false])('preserves only manual records when editing payouts (explicit list: %s)', async (explicitList) => {
    const user = userEvent.setup();
    const manual: SecurityPayoutDetails = { exDividendDate: '2026-01-01', amount: 1, mode: 'manual', status: 'completed' };
    const holding: Holding = {
      id: 'holding',
      security: {
        symbol: 'VTI', name: 'VTI Fund', exchange: 'NYSE', assetType: 'ETF', currency: 'USD',
        manualPayoutDetails: explicitList ? [manual] : undefined,
        payoutDetails: [
          manual,
          { exDividendDate: '2026-03-01', amount: 2, mode: 'source', status: 'completed' },
          { exDividendDate: '2026-12-01', amount: 3, status: 'projected' },
          { exDividendDate: '2026-11-30', amount: 4, status: 'superseded' },
        ],
      },
      accountPositions: [{ accountId: account.id, quantity: 10 }],
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    };
    const repository = createMockHoldingRepository();
    vi.spyOn(repository, 'listHoldings').mockResolvedValue([holding]);
    const save = vi.spyOn(repository, 'updateManualPayoutDetails').mockResolvedValue(holding);
    render(<HoldingsPage accountRepository={createMockAccountRepository({ initialAccounts: [account] })} holdingRepository={repository} />);

    await user.click(await screen.findByRole('button', { name: 'Edit VTI payments' }));
    expect(screen.getAllByLabelText('Ex-date')).toHaveLength(1);
    expect(screen.getByLabelText('Ex-date')).toHaveValue('2026-01-01');
    await user.click(screen.getByRole('button', { name: 'Save payments' }));
    expect(save).toHaveBeenCalledWith('holding', [manual]);
  });

  it('shows an edited manual amount after discarding stale research and adjustment metadata', async () => {
    const user = userEvent.setup();
    const manual: SecurityPayoutDetails = {
      exDividendDate: '2026-01-01', amount: 1, mode: 'manual', status: 'completed',
      amountPerShare: '1.0000', rawAmount: '3', shareBasis: 'as_of:2026-10-19', appliedActionIds: ['old-split'],
      forecastMethod: 'seasonal_median_v1', forecastRange: { min: '0.5', max: '1.5' },
      forecastInputEventIds: ['old-input'], forecastAsOf: '2026-10-19', supersedesEventId: 'old-projection',
      source: 'Issuer', sourceUrl: 'https://example.com/old', evidenceRef: 'old-evidence',
    };
    const holding: Holding = {
      id: 'holding', security: {
        symbol: 'VTI', name: 'VTI Fund', exchange: 'NYSE', assetType: 'ETF', currency: 'USD',
        manualPayoutDetails: [manual], payoutDetails: [manual],
      },
      accountPositions: [{ accountId: account.id, quantity: 10 }],
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    };
    const repository = createMockHoldingRepository();
    vi.spyOn(repository, 'listHoldings').mockResolvedValue([holding]);
    const save = vi.spyOn(repository, 'updateManualPayoutDetails').mockImplementation(async (_id, payouts) => ({
      ...holding, security: { ...holding.security, payoutDetails: payouts, manualPayoutDetails: payouts },
    }));
    render(<HoldingsPage accountRepository={createMockAccountRepository({ initialAccounts: [account] })} holdingRepository={repository} />);
    await user.click(await screen.findByRole('button', { name: 'Edit VTI payments' }));
    await user.clear(screen.getByLabelText('Per share'));
    await user.type(screen.getByLabelText('Per share'), '2.75');
    await user.click(screen.getByRole('button', { name: 'Save payments' }));
    expect(save).toHaveBeenCalledWith('holding', [expect.objectContaining({
      amount: 2.75, amountPerShare: null, rawAmount: null, shareBasis: null, appliedActionIds: [],
      forecastMethod: null, forecastRange: null, forecastInputEventIds: [], forecastAsOf: null,
      supersedesEventId: null, source: 'user', sourceUrl: null, evidenceRef: null,
    })]);
    await user.click(await screen.findByRole('button', { name: 'View VTI security details' }));
    expect(screen.getByText('2026-01-01 · Actual · $2.75 USD per share')).toBeInTheDocument();
    expect(screen.queryByText('Forecast method')).not.toBeInTheDocument();
    expect(screen.queryByText(/Original amount: 3/)).not.toBeInTheDocument();
  });
});
