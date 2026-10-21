import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Holding } from '../../domain/holding';
import { createMockHoldingRepository } from '../../domain/holdingRepository';
import { DistributionResearchPanel } from './DistributionResearchPanel';

const researchHoldings: Holding[] = ['JEPQ', 'JEPI', 'VTI'].map((symbol) => ({
  id: symbol, security: { symbol, name: symbol, exchange: 'NASDAQ', assetType: 'ETF', currency: 'USD' },
  accountPositions: [{ accountId: 'account', quantity: 10 }], createdAt: '', updatedAt: '',
}));

describe('DistributionResearchPanel', () => {
  afterEach(() => vi.useRealTimers());
  it('distinguishes Vanguard identity from the history used for VYM distributions', async () => {
    const user = userEvent.setup();
    const historyUrl = 'https://stockanalysis.com/etf/vym/dividend/';
    const holding: Holding = {
      id: 'VYM', security: { symbol: 'VYM', name: 'Vanguard High Dividend Yield ETF', exchange: 'NYSE ARCA', assetType: 'ETF', currency: 'USD',
        dividendResearchSourceUrl: 'https://investor.vanguard.com/investment-products/etfs/profile/vym',
        sourcePayoutDetails: [
          { exDividendDate: '2026-06-18', amount: 0.9795, status: 'completed', sourceUrl: historyUrl },
          { exDividendDate: '2026-09-18', amount: 0.8869, status: 'completed', sourceUrl: historyUrl },
          { exDividendDate: '2026-12-18', amount: 0.9, status: 'projected', sourceUrl: 'https://example.com/estimate' },
          { exDividendDate: '2026-03-20', amount: 0.8, status: 'superseded', sourceUrl: 'https://example.com/old' },
          { exDividendDate: '2026-03-20', amount: 0.8, mode: 'manual', sourceUrl: 'https://example.com/manual' },
          { exDividendDate: '2026-03-20', amount: 0.8, status: 'completed', sourceUrl: 'javascript:alert(1)' },
        ] },
      accountPositions: [{ accountId: 'account', quantity: 10 }], createdAt: '', updatedAt: '',
    };
    render(<DistributionResearchPanel holdings={[holding]} repository={createMockHoldingRepository()} onRefreshed={vi.fn()} />);
    await user.click(screen.getByText('Research status and sources (1 securities)'));
    expect(screen.getByRole('link', { name: 'VYM identity source' })).toHaveAttribute('href', holding.security.dividendResearchSourceUrl);
    expect(screen.getByRole('link', { name: 'VYM distribution history source 1' })).toHaveAttribute('href', historyUrl);
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('reports unavailable VOO research and offers retry even when the request succeeds', async () => {
    const user = userEvent.setup();
    const holding: Holding = {
      id: 'VOO', security: { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', exchange: 'NYSE ARCA', assetType: 'ETF', currency: 'USD' },
      accountPositions: [{ accountId: 'account', quantity: 10 }], createdAt: '', updatedAt: '',
    };
    const unavailable = { ...holding, security: { ...holding.security, dividendResearchStatus: 'unavailable' as const, payoutDetails: [] } };
    const repository = createMockHoldingRepository();
    const refresh = vi.spyOn(repository, 'refreshHoldingDividends').mockResolvedValueOnce(unavailable)
      .mockResolvedValue({ ...holding, security: { ...holding.security, dividendResearchStatus: 'partial', payoutDetails: [
        { exDividendDate: '2026-09-28', amount: 1.8226, status: 'completed' },
      ] } });
    repository.reloadHoldings = vi.fn().mockResolvedValue([unavailable]);
    render(<DistributionResearchPanel holdings={[holding]} repository={repository} onRefreshed={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Refresh distribution data' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No distributions were imported for VOO');
    expect(screen.getByRole('status')).toHaveTextContent('0 of 1 securities refreshed.');
    await user.click(screen.getByRole('button', { name: 'Retry distribution refresh' }));
    expect(await screen.findByText('1 of 1 securities refreshed.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('starts immediately, waits 15 seconds after each attempt, and finishes without a terminal wait', async () => {
    vi.useFakeTimers();
    const holdings = researchHoldings;
    const repository = createMockHoldingRepository();
    const complete: (() => void)[] = [];
    const refresh = vi.spyOn(repository, 'refreshHoldingDividends').mockImplementation((id) =>
      new Promise<Holding>((resolve) => { complete.push(() => resolve(holdings.find((holding) => holding.id === id)!)); }));
    repository.reloadHoldings = vi.fn().mockResolvedValue(holdings);
    const onRefreshed = vi.fn();
    render(<DistributionResearchPanel holdings={holdings} repository={repository} onRefreshed={onRefreshed} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh distribution data' }));
    expect(refresh).toHaveBeenCalledExactlyOnceWith('JEPQ');
    expect(screen.getByRole('status')).toHaveTextContent('Researching 0 of 3 securities');
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => complete[0]());
    expect(screen.getByRole('status')).toHaveTextContent('Researched 1 of 3 securities. Waiting 15 seconds');
    expect(screen.getByRole('button', { name: 'Refreshing distribution data…' })).toBeDisabled();
    await act(async () => vi.advanceTimersByTimeAsync(14_999));
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(refresh).toHaveBeenNthCalledWith(2, 'JEPI');
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(refresh).toHaveBeenCalledTimes(2);
    await act(async () => complete[1]());
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(refresh).toHaveBeenCalledTimes(3);
    await act(async () => complete[2]());
    expect(screen.getByRole('status')).toHaveTextContent('3 of 3 securities refreshed.');
    expect(onRefreshed).toHaveBeenCalledWith(holdings);
    expect(screen.getByRole('button', { name: 'Refresh distribution data' })).toBeEnabled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the full delay after failures and unavailable research and retains retry feedback', async () => {
    vi.useFakeTimers();
    const repository = createMockHoldingRepository();
    const refresh = vi.spyOn(repository, 'refreshHoldingDividends')
      .mockRejectedValueOnce(new Error('provider timeout'))
      .mockResolvedValueOnce({ ...researchHoldings[1], security: { ...researchHoldings[1].security, dividendResearchStatus: 'unavailable' } })
      .mockResolvedValueOnce(researchHoldings[2]);
    repository.reloadHoldings = vi.fn().mockResolvedValue(researchHoldings);
    render(<DistributionResearchPanel holdings={researchHoldings} repository={repository} onRefreshed={vi.fn()} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Refresh distribution data' })));
    expect(screen.getByRole('status')).toHaveTextContent('Waiting 15 seconds');
    await act(async () => vi.advanceTimersByTimeAsync(14_999));
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent('Researched 2 of 3 securities. Waiting 15 seconds');
    await act(async () => vi.advanceTimersByTimeAsync(14_999));
    expect(refresh).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(screen.getByText(/Distribution refresh failed for JEPQ/)).toBeInTheDocument();
    expect(screen.getByText(/No distributions were imported for JEPI/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 of 3 securities refreshed.');
    expect(screen.getByRole('button', { name: 'Retry distribution refresh' })).toBeEnabled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('skips disabled holdings before deduplicating securities and defaults existing holdings to enabled', async () => {
    const repository = createMockHoldingRepository();
    const eligible = researchHoldings[0];
    const holdings = [
      { ...eligible, id: 'disabled-duplicate', manageDividends: false },
      { ...researchHoldings[1], manageDividends: false },
      eligible,
      { ...eligible, id: 'enabled-duplicate', manageDividends: true, security: { ...eligible.security, symbol: 'jepq', exchange: 'nasdaq' } },
    ];
    const refresh = vi.spyOn(repository, 'refreshHoldingDividends').mockResolvedValue(eligible);
    repository.reloadHoldings = vi.fn().mockResolvedValue(holdings);
    render(<DistributionResearchPanel holdings={holdings} repository={repository} onRefreshed={vi.fn()} />);
    expect(screen.getByText('Research status and sources (1 securities)')).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Refresh distribution data' })));
    expect(refresh).toHaveBeenCalledExactlyOnceWith(eligible.id);
    expect(screen.getByRole('status')).toHaveTextContent('1 of 1 securities refreshed.');
  });

  it('disables distribution research when every holding has Manage Dividends turned off', () => {
    render(<DistributionResearchPanel holdings={researchHoldings.map((holding) => ({ ...holding, manageDividends: false }))}
      repository={createMockHoldingRepository()} onRefreshed={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Refresh distribution data' })).toBeDisabled();
    expect(screen.getByText(/Enable Manage Dividends/)).toBeInTheDocument();
    expect(screen.queryByText(/Research status and sources/)).not.toBeInTheDocument();
  });

  it('clears the cooldown and stops queued requests when unmounted', async () => {
    vi.useFakeTimers();
    const repository = createMockHoldingRepository();
    const refresh = vi.spyOn(repository, 'refreshHoldingDividends').mockResolvedValue(researchHoldings[0]);
    repository.reloadHoldings = vi.fn();
    const onRefreshed = vi.fn();
    const { unmount } = render(<DistributionResearchPanel holdings={researchHoldings} repository={repository} onRefreshed={onRefreshed} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Refresh distribution data' })));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(repository.reloadHoldings).not.toHaveBeenCalled();
    expect(onRefreshed).not.toHaveBeenCalled();
  });

  it('does not queue more requests when an in-flight attempt completes after unmount', async () => {
    vi.useFakeTimers();
    const repository = createMockHoldingRepository();
    let complete!: (holding: Holding) => void;
    const refresh = vi.spyOn(repository, 'refreshHoldingDividends').mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    repository.reloadHoldings = vi.fn();
    const { unmount } = render(<DistributionResearchPanel holdings={researchHoldings} repository={repository} onRefreshed={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh distribution data' }));
    unmount();
    await act(async () => complete(researchHoldings[0]));
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(repository.reloadHoldings).not.toHaveBeenCalled();
  });
});
