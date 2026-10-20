import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Holding } from '../../domain/holding';
import { createMockHoldingRepository } from '../../domain/holdingRepository';
import { DistributionResearchPanel } from './DistributionResearchPanel';

describe('DistributionResearchPanel', () => {
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
