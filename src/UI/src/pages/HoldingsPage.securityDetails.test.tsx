import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Account } from '../domain/account';
import { createMockAccountRepository } from '../domain/accountRepository';
import type { Holding } from '../domain/holding';
import { createMockHoldingRepository } from '../domain/holdingRepository';
import { HoldingsPage } from './HoldingsPage';

const account: Account = {
  id: 'brokerage', name: 'Brokerage', type: 'Investment', startingBalance: 0,
  startDate: '2026-01-01', yieldRate: 0, assignedIncomeSourceIds: [],
  investmentAccountType: 'Taxable', manageHoldings: true, yearlyContribution: 0,
  columns: [], monthlyRecords: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};

const holding = (id: string, symbol = 'MSFT'): Holding => ({
  id, manageDividends: false,
  security: { symbol, name: `${symbol} saved`, exchange: 'NASDAQ', assetType: 'Equity', currency: 'USD', price: 100, sector: 'Saved sector', detailsStatus: 'manual' },
  accountPositions: [{ accountId: 'brokerage', quantity: 5, costBasis: 250 }],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
});

const setup = (saved: Holding[]) => {
  const repository = createMockHoldingRepository();
  vi.spyOn(repository, 'listHoldings').mockImplementation(async () => structuredClone(saved));
  const reload = vi.fn(async () => structuredClone(saved));
  repository.reloadHoldings = reload;
  render(<HoldingsPage accountRepository={createMockAccountRepository({ initialAccounts: [account] })} holdingRepository={repository} />);
  return { repository, reload };
};

const accepted = (value: Holding, price = 123): Holding => ({
  ...value, security: { ...value.security, price, detailsStatus: 'partial', detailsUpdatedAt: new Date().toISOString() },
});

describe('HoldingsPage security research', () => {
  it('displays a sourced name and does not claim missing metrics when research has full coverage', async () => {
    const user = userEvent.setup();
    const saved = [holding('first')];
    const { repository } = setup(saved);
    vi.spyOn(repository, 'refreshHoldingSecurityDetails').mockImplementation(async () => {
      saved[0] = accepted(saved[0]);
      saved[0].security = { ...saved[0].security, name: 'Microsoft Corporation', sector: 'Technology', industry: 'Software',
        peRatio: 20, thirtyDayYield: 0, fiftyTwoWeekLow: 80, fiftyTwoWeekHigh: 140, sma20: 121, sma50: 115, sma200: 100,
        detailsProvenance: { schemaVersion: 1, provider: 'azure_foundry', agentName: 'stock-details-agent', deployment: 'luna',
          promptVersion: 'stock-details-agent-v1', retrievedAt: new Date().toISOString(), priceKind: 'close', authoritative: false,
          sources: [{ id: 's1', title: 'Synthetic source', url: 'https://example.com/quote' }],
          fieldEvidence: (['identity', 'price', 'sector', 'industry', 'pe_ratio', 'thirty_day_yield', 'fifty_two_week_low', 'fifty_two_week_high', 'sma20', 'sma50', 'sma200'] as const)
            .map((field) => ({ field, sourceIds: ['s1'], asOf: '2026-10-21' })), warnings: [] } };
      return saved[0];
    });
    await user.click(await screen.findByRole('button', { name: 'Update all holdings' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^Holdings were updated\.$/));
    expect(screen.getByRole('button', { name: 'View MSFT security details' })).toHaveTextContent('Microsoft Corporation');
  });

  it('deduplicates listing aliases, announces sequential progress, reloads fan-out, and preserves unsaved quantities', async () => {
    const user = userEvent.setup();
    const saved = [holding('first'), holding('duplicate'), holding('other', 'NVDA')];
    saved[1].security.exchange = 'XNAS';
    saved[1].security.assetType = 'Stock';
    const { repository, reload } = setup(saved);
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const refresh = vi.spyOn(repository, 'refreshHoldingSecurityDetails').mockImplementation(async (id) => {
      await pending;
      const match = saved.find((entry) => entry.id === id)!;
      for (let index = 0; index < saved.length; index++) {
        if (saved[index].security.symbol === match.security.symbol) saved[index] = accepted(saved[index]);
      }
      return saved.find((entry) => entry.id === id)!;
    });
    await screen.findByRole('button', { name: 'Update all holdings' });
    const quantities = await screen.findAllByLabelText('MSFT quantity for Brokerage');
    await user.clear(quantities[0]);
    await user.type(quantities[0], '42');
    await user.click(screen.getByRole('button', { name: 'Update all holdings' }));
    expect(screen.getByRole('status')).toHaveTextContent('Updating 1 of 2 holdings…');
    expect(screen.getByRole('button', { name: 'Update all holdings' })).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Update all holdings' }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getAllByLabelText('MSFT price')[0]).toHaveValue('$100.00');
    await act(async () => finish());
    await screen.findByText('Holdings were updated. Some saved metrics could not be refreshed.');
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenNthCalledWith(2, 'other');
    expect(reload).toHaveBeenCalledOnce();
    expect(screen.getAllByLabelText('MSFT price').map((input) => (input as HTMLInputElement).value)).toEqual(['$123.00', '$123.00']);
    expect(screen.getAllByLabelText('MSFT quantity for Brokerage')[0]).toHaveValue('42');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    expect(saved[0].accountPositions).toEqual([{ accountId: 'brokerage', quantity: 5, costBasis: 250 }]);
  });

  it('keeps saved details on failure, displays per-listing failures, and retains successful listings', async () => {
    const user = userEvent.setup();
    const saved = [holding('first'), holding('other', 'NVDA')];
    const before = structuredClone(saved[0]);
    const { repository } = setup(saved);
    vi.spyOn(repository, 'refreshHoldingSecurityDetails').mockImplementation(async (id) => {
      if (id === 'first') throw new Error('provider unavailable');
      saved[1] = accepted(saved[1]); return saved[1];
    });
    await user.click(await screen.findByRole('button', { name: 'Update all holdings' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to update MSFT. Saved details were kept; try again. Other holdings were updated.');
    expect(saved[0]).toEqual(before);
    expect(screen.getByLabelText('MSFT price')).toHaveValue('$100.00');
    expect(screen.getByLabelText('NVDA price')).toHaveValue('$123.00');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('forces individual refreshes for recent holdings and rejects a returned unavailable result', async () => {
    const user = userEvent.setup();
    const saved = [holding('first')];
    saved[0].security.detailsUpdatedAt = new Date().toISOString();
    const { repository } = setup(saved);
    const refresh = vi.spyOn(repository, 'refreshHoldingSecurityDetails').mockResolvedValue({
      ...saved[0], security: { ...saved[0].security, price: null, detailsStatus: 'unavailable' },
    });
    await user.click(await screen.findByRole('button', { name: 'Update all holdings' }));
    expect(screen.getByRole('status')).toHaveTextContent('All holdings were updated within the last 48 hours.');
    expect(refresh).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Update MSFT holding' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to update MSFT. Saved details were kept; try again.');
    expect(refresh).toHaveBeenCalledExactlyOnceWith('first');
    expect(screen.getByLabelText('MSFT price')).toHaveValue('$100.00');
    await user.click(screen.getByRole('button', { name: 'View MSFT security details' }));
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Saved security details' })).toBeInTheDocument();
  });

  it('researches missing, invalid and future timestamps, skips Cash, and keeps distinct exchanges separate', async () => {
    const user = userEvent.setup();
    const saved = [holding('missing'), holding('invalid', 'NVDA'), holding('future'), holding('cash', 'CASH')];
    saved[1].security.detailsUpdatedAt = 'invalid';
    saved[2].security.exchange = 'NYSE';
    saved[2].security.detailsUpdatedAt = new Date(Date.now() + 86400000).toISOString();
    saved[3].security.assetType = 'Cash';
    const { repository } = setup(saved);
    const refresh = vi.spyOn(repository, 'refreshHoldingSecurityDetails').mockImplementation(async (id) => {
      const index = saved.findIndex((entry) => entry.id === id); saved[index] = accepted(saved[index]); return saved[index];
    });
    await user.click(await screen.findByRole('button', { name: 'Update all holdings' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(3));
    expect(refresh.mock.calls.map(([id]) => id)).toEqual(['missing', 'invalid', 'future']);
    await screen.findByText('Holdings were updated. Some saved metrics could not be refreshed.');
  });
});
