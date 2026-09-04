import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Holding } from '../domain/holding';
import { createMockHoldingRepository } from '../domain/holdingRepository';
import { PassiveIncomePage } from './PassiveIncomePage';

const currentYear = 2026;
const testHolding: Holding = {
  id: 'holding-vti',
  security: {
    symbol: 'VTI', name: 'VTI Fund', exchange: 'NYSE', assetType: 'ETF', currency: 'USD', dividendGrowthRate: 0.1,
    payoutDetails: [
      { exDividendDate: '2025-02-15', paymentDate: '2025-02-22', amount: 1, status: 'completed' },
      { exDividendDate: '2026-02-15', paymentDate: '2026-02-22', amount: 1.1, status: 'completed' },
    ],
  },
  accountPositions: [{ accountId: 'account', quantity: 10 }],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};

describe('PassiveIncomePage', () => {
  beforeEach(() => vi.setSystemTime(new Date('2026-09-04T12:00:00')));
  afterEach(() => vi.useRealTimers());

  it('renders annual summaries and twelve month badges grouped into four quarters', async () => {
    const repository = createMockHoldingRepository();
    vi.spyOn(repository, 'listHoldings').mockResolvedValue([testHolding]);
    render(<PassiveIncomePage holdingRepository={repository} />);

    expect(await screen.findByText('Annual Dividend Income')).toBeInTheDocument();
    expect(screen.getByText('Average Monthly Dividend Income')).toBeInTheDocument();
    for (const label of ['Q1', 'Q2', 'Q3', 'Q4']) expect(screen.getByRole('region', { name: label })).toBeInTheDocument();
    const monthRegion = screen.getByRole('region', { name: `${currentYear} dividend income months` });
    expect(within(monthRegion).getAllByRole('button')).toHaveLength(12);
    expect(within(monthRegion).getByRole('button', { name: /Feb, 1 payment, \$11\.00, actual/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: `${currentYear} dividend income by month` })).toBeInTheDocument();
  });

  it('supports keyboard tab navigation and an accessible annual forecast through 2040', async () => {
    const user = userEvent.setup();
    const repository = createMockHoldingRepository();
    vi.spyOn(repository, 'listHoldings').mockResolvedValue([testHolding]);
    render(<PassiveIncomePage holdingRepository={repository} />);
    const incomeTab = await screen.findByRole('tab', { name: 'Income' });
    incomeTab.focus();
    await user.keyboard('{ArrowRight}');

    const forecastTab = screen.getByRole('tab', { name: 'Future Forecast' });
    expect(forecastTab).toHaveFocus();
    expect(forecastTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Forecast through year')).toHaveValue(2040);
    const table = screen.getByRole('table', { name: 'Annual dividend forecast values' });
    expect(within(table).getByRole('row', { name: /2040/ })).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Forecast through year'));
    await user.type(screen.getByLabelText('Forecast through year'), '2025');
    expect(screen.getByRole('alert')).toHaveTextContent('2026 or later');
  });

  it('flags an invalid saved growth rate and does not render a misleading forecast', async () => {
    const user = userEvent.setup();
    const repository = createMockHoldingRepository();
    vi.spyOn(repository, 'listHoldings').mockResolvedValue([{
      ...testHolding,
      security: { ...testHolding.security, dividendGrowthRate: -1.01 },
    }]);
    render(<PassiveIncomePage holdingRepository={repository} />);
    await user.click(await screen.findByRole('tab', { name: 'Future Forecast' }));
    expect(screen.getByRole('alert')).toHaveTextContent('invalid saved growth rate');
    expect(screen.queryByRole('table', { name: 'Annual dividend forecast values' })).not.toBeInTheDocument();
  });
});
