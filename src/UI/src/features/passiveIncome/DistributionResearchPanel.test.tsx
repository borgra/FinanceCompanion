import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Holding } from '../../domain/holding';
import { createMockHoldingRepository } from '../../domain/holdingRepository';
import { DistributionResearchPanel } from './DistributionResearchPanel';

describe('DistributionResearchPanel', () => {
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

  it('bounds concurrent web research and announces completion progress', async () => {
    const user = userEvent.setup();
    const holdings: Holding[] = ['JEPQ', 'JEPI', 'VTI'].map((symbol) => ({
      id: symbol, security: { symbol, name: symbol, exchange: 'NASDAQ', assetType: 'ETF', currency: 'USD' },
      accountPositions: [{ accountId: 'account', quantity: 10 }], createdAt: '', updatedAt: '',
    }));
    const repository = createMockHoldingRepository();
    const complete: (() => void)[] = [];
    const refresh = vi.spyOn(repository, 'refreshHoldingDividends').mockImplementation((id) =>
      new Promise<Holding>((resolve) => { complete.push(() => resolve(holdings.find((holding) => holding.id === id)!)); }));
    repository.reloadHoldings = vi.fn().mockResolvedValue(holdings);
    const onRefreshed = vi.fn();
    render(<DistributionResearchPanel holdings={holdings} repository={repository} onRefreshed={onRefreshed} />);
    await user.click(screen.getByRole('button', { name: 'Refresh distribution data' }));
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent('Researching 0 of 3 securities');
    await act(async () => complete[0]());
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('status')).toHaveTextContent('Researched 1 of 3 securities');
    await act(async () => { complete[1](); complete[2](); });
    expect(screen.getByRole('status')).toHaveTextContent('3 of 3 securities refreshed.');
    expect(onRefreshed).toHaveBeenCalledWith(holdings);
    expect(screen.getByRole('button', { name: 'Refresh distribution data' })).toBeEnabled();
  });
});
