import { render, screen } from '@testing-library/react';
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
