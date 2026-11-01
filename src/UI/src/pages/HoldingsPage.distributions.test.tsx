import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Account } from '../domain/account';
import { createMockAccountRepository } from '../domain/accountRepository';
import type { Holding, SecurityPayoutDetails } from '../domain/holding';
import { createMockHoldingRepository } from '../domain/holdingRepository';
import { HoldingsPage } from './HoldingsPage';
import { ApiError } from '../api/httpClient';

const account: Account = {
  id: 'account', name: 'Brokerage', type: 'Investment', startingBalance: 0,
  startDate: '2026-01-01', yieldRate: 0, assignedIncomeSourceIds: [],
  investmentAccountType: 'Taxable', manageHoldings: true, yearlyContribution: 0,
  columns: [], monthlyRecords: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};

describe('HoldingsPage dividend management', () => {
  it('shows a server research cooldown while keeping the saved price', async () => {
    const user = userEvent.setup();
    const repository = createMockHoldingRepository();
    await repository.createHolding({
      security: { symbol: 'VTI', name: 'VTI', exchange: 'NYSE', assetType: 'ETF', currency: 'USD', price: 100 },
      accountPositions: [{ accountId: account.id, quantity: 10 }],
    });
    vi.spyOn(repository, 'refreshHoldingSecurityDetails').mockRejectedValue(new ApiError('Price research is temporarily limited. Retry in 60 seconds; saved data was preserved.', 429));
    render(<HoldingsPage accountRepository={createMockAccountRepository({ initialAccounts: [account] })} holdingRepository={repository} />);
    await user.click(await screen.findByRole('button', { name: 'Update VTI holding' }));
    expect(await screen.findByText(/Retry in 60 seconds/)).toBeInTheDocument();
    expect(screen.getByLabelText('VTI price')).toHaveValue('$100.00');
    expect(screen.getByRole('button', { name: 'Update VTI holding' })).toBeEnabled();
  });
  it('serializes settings and table saves across modal close without losing drafts or opt-outs', async () => {
    const user = userEvent.setup();
    const repository = createMockHoldingRepository();
    await repository.createHolding({
      security: { symbol: 'VTI', name: 'VTI', exchange: 'NYSE', assetType: 'ETF', currency: 'USD', price: 100 },
      accountPositions: [{ accountId: account.id, quantity: 10 }],
    });
    let finishSettings!: () => void;
    let finishTable!: () => void;
    const settingsPending = new Promise<void>((resolve) => { finishSettings = resolve; });
    const tablePending = new Promise<void>((resolve) => { finishTable = resolve; });
    const saveSettings = repository.updateHolding;
    const saveTable = repository.updateHoldingsBatch;
    vi.spyOn(repository, 'updateHolding').mockImplementation(async (id, draft) => { await settingsPending; return saveSettings(id, draft); });
    const batch = vi.spyOn(repository, 'updateHoldingsBatch').mockImplementation(async (changes) => { await tablePending; return saveTable(changes); });
    render(<HoldingsPage accountRepository={createMockAccountRepository({ initialAccounts: [account] })} holdingRepository={repository} />);
    const price = await screen.findByLabelText('VTI price');
    await user.clear(price);
    await user.type(price, '222');
    await user.click(screen.getByRole('button', { name: 'View VTI security details' }));
    await user.click(screen.getByRole('checkbox', { name: 'Manage Dividends' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }));
    await user.click(screen.getByRole('button', { name: 'Close security details' }));
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'View VTI security details' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Saving...' }));
    expect(batch).not.toHaveBeenCalled();
    await act(async () => finishSettings());
    await screen.findByText('VTI dividend settings were saved.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('VTI price')).toHaveValue('$222.00');
    expect((await repository.listHoldings())[0]).toMatchObject({ manageDividends: false, security: { price: 100 } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('button', { name: 'View VTI security details' })).toBeDisabled();
    await act(async () => finishTable());
    await screen.findByText('Holdings saved.');
    expect((await repository.listHoldings())[0]).toMatchObject({ manageDividends: false, security: { price: 222 } });
  });

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
      await screen.findByText('VTI dividend settings were saved.');
      await user.click(screen.getByRole('button', { name: 'Close security details' }));
      expect(screen.getByLabelText('VTI price')).toHaveValue('$222.00');
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
      const persisted = (await repository.listHoldings())[0];
      expect(persisted.manageDividends).toBe(false);
      expect(persisted.security.payoutDetails).toEqual([]);
      expect(persisted.security.price).toBe(100);
      expect(persisted.security.dividendGrowthRate).toBe(0.07);
    } finally { confirm.mockRestore(); }
  });

  it('saves Manage Dividends in security details and skips research until re-enabled', async () => {
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
    await screen.findByRole('button', { name: 'View VTI security details' });
    expect(screen.queryByRole('columnheader', { name: 'Manage Dividends' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View VTI security details' }));
    const checkbox = screen.getByRole('checkbox', { name: 'Manage Dividends' });
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }));
    await screen.findByText('VTI dividend settings were saved.');
    expect((await repository.listHoldings())[0]).toMatchObject({
      manageDividends: false,
      security: { payoutDetails: holding.security.payoutDetails },
    });
    await user.click(screen.getByRole('button', { name: 'Close security details' }));
    expect(screen.getByRole('button', { name: 'Update VTI dividends' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    view.unmount();
    render(<HoldingsPage accountRepository={accountRepository} holdingRepository={repository} />);
    await user.click(await screen.findByRole('button', { name: 'View VTI security details' }));
    expect(screen.getByRole('checkbox', { name: 'Manage Dividends' })).not.toBeChecked();
    expect(refresh).not.toHaveBeenCalled();
    await user.click(screen.getByRole('checkbox', { name: 'Manage Dividends' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }));
    await screen.findByText('VTI dividend settings were saved.');
    await user.click(screen.getByRole('button', { name: 'Close security details' }));
    expect(screen.getByRole('button', { name: 'Update VTI dividends' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Update VTI dividends' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledWith(holding.id));
  });

  it('defaults legacy holdings to enabled and retains the modal draft after save failure', async () => {
    const user = userEvent.setup();
    const repository = createMockHoldingRepository();
    const legacy: Holding = {
      id: 'legacy', security: { symbol: 'VTI', name: 'VTI Fund', exchange: 'NYSE', assetType: 'ETF', currency: 'USD' },
      accountPositions: [{ accountId: account.id, quantity: 10 }], createdAt: '', updatedAt: '',
    };
    vi.spyOn(repository, 'listHoldings').mockResolvedValue([legacy]);
    const save = vi.spyOn(repository, 'updateHolding').mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce({ ...legacy, manageDividends: false });
    render(<HoldingsPage accountRepository={createMockAccountRepository({ initialAccounts: [account] })} holdingRepository={repository} />);
    await user.click(await screen.findByRole('button', { name: 'View VTI security details' }));
    const checkbox = screen.getByRole('checkbox', { name: 'Manage Dividends' });
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to save dividend settings.');
    expect(checkbox).not.toBeChecked();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }));
    await screen.findByText('VTI dividend settings were saved.');
    expect(save).toHaveBeenLastCalledWith('legacy', expect.objectContaining({ manageDividends: false }));
  });
});

describe('HoldingsPage distribution inspection', () => {
  it('has no payment editor in the table and keeps saved payments visible in security details', async () => {
    const user = userEvent.setup();
    const repository = createMockHoldingRepository();
    const manual: SecurityPayoutDetails = { exDividendDate: '2026-01-01', amount: 1, mode: 'manual', status: 'completed' };
    await repository.createHolding({
      security: {
        symbol: 'VTI', name: 'VTI Fund', exchange: 'NYSE', assetType: 'ETF', currency: 'USD',
        manualPayoutDetails: [manual], payoutDetails: [manual],
      },
      accountPositions: [{ accountId: account.id, quantity: 10 }],
    });
    const savePayments = vi.spyOn(repository, 'updateManualPayoutDetails');
    render(<HoldingsPage accountRepository={createMockAccountRepository({ initialAccounts: [account] })} holdingRepository={repository} />);
    await screen.findByRole('button', { name: 'View VTI security details' });
    expect(screen.queryByRole('button', { name: 'Edit VTI payments' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add payment' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View VTI security details' }));
    expect(screen.getByText('2026-01-01 · Actual · $1.00 USD per share')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove payments' })).toBeEnabled();
    expect(savePayments).not.toHaveBeenCalled();
    expect((await repository.listHoldings())[0].security.manualPayoutDetails).toEqual([manual]);
  });
});
