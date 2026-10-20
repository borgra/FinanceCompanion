import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Holding } from '../domain/holding';
import { createMockHoldingRepository } from '../domain/holdingRepository';
import { PassiveIncomePage } from './PassiveIncomePage';
import { ApiError } from '../api/httpClient';

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
    expect(screen.getByRole('group', { name: `${currentYear} dividend income by month` })).toBeInTheDocument();
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

describe('PassiveIncomePage distribution research', () => {
  beforeEach(() => vi.setSystemTime(new Date('2026-09-04T12:00:00')));
  afterEach(() => vi.useRealTimers());

  it('loads VOO quarterly distributions after retry and shows income across all three years', async () => {
    vi.setSystemTime(new Date('2026-10-20T12:00:00'));
    const user = userEvent.setup();
    const repository = createMockHoldingRepository();
    const voo: Holding = { ...testHolding, id: 'holding-voo', security: {
      symbol: 'VOO', name: 'Vanguard S&P 500 ETF', exchange: 'NYSE ARCA', assetType: 'ETF', currency: 'USD',
      payoutDetails: [{ exDividendDate: '2025-09-29', paymentDate: '2025-10-01', amount: 1.74, status: 'completed' }],
    } };
    const unavailable: Holding = { ...voo, security: { ...voo.security, dividendResearchStatus: 'unavailable' } };
    const refreshed: Holding = { ...voo, security: { ...voo.security, dividendResearchStatus: 'partial',
      dividendResearchProvider: 'azure_foundry', dividendResearchWarnings: ['Coverage may be incomplete.'],
      payoutDetails: [...voo.security.payoutDetails!,
        { exDividendDate: '2026-03-27', amount: 1.8724, status: 'completed' },
        { exDividendDate: '2026-06-26', amount: 1.9622, status: 'completed' },
        { exDividendDate: '2026-09-28', paymentDate: '2026-09-30', amount: 1.8226, amountPerShare: '1.8226', status: 'completed', sourceUrl: 'https://investor.vanguard.com/investment-products/etfs/profile/voo' },
        { exDividendDate: '2026-12-22', amount: 1.77, status: 'projected' },
        ...['03', '06', '09', '12'].map((month) => ({ exDividendDate: `2027-${month}-22`, amount: 1.77, status: 'projected' as const })),
      ],
    } };
    vi.spyOn(repository, 'listHoldings').mockResolvedValue([voo]);
    repository.reloadHoldings = vi.fn().mockResolvedValueOnce([unavailable]).mockResolvedValue([refreshed]);
    vi.spyOn(repository, 'refreshHoldingDividends').mockResolvedValueOnce(unavailable).mockResolvedValue(refreshed);
    render(<PassiveIncomePage holdingRepository={repository} />);
    await user.click(await screen.findByRole('button', { name: 'Refresh distribution data' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No distributions were imported for VOO');
    await user.click(screen.getByRole('button', { name: 'Retry distribution refresh' }));
    expect(await screen.findByText('1 of 1 securities refreshed.')).toBeInTheDocument();
    expect(screen.getByText('Actual: $56.57 · Announced: $0.00 · Projected: $17.70')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Sep, 1 payment, \$18.23/ }));
    expect(screen.getByText('$1.8226')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'VOO distribution source' })).toHaveAttribute('href', 'https://investor.vanguard.com/investment-products/etfs/profile/voo');
    const year = screen.getByRole('combobox', { name: 'Distribution year' });
    await user.selectOptions(year, '2025');
    expect(screen.getByRole('button', { name: /Sep, 1 payment, \$17.40/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Oct, 0 payments/ })).toBeInTheDocument();
    await user.selectOptions(year, '2027');
    expect(screen.getByText('Actual: $0.00 · Announced: $0.00 · Projected: $70.80')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refreshes one chosen security and exposes safe provider permission errors', async () => {
    const user = userEvent.setup();
    const repository = createMockHoldingRepository();
    vi.spyOn(repository, 'listHoldings').mockResolvedValue([testHolding, { ...testHolding, id: 'other', security: { ...testHolding.security, symbol: 'JEPQ' } }]);
    const refresh = vi.spyOn(repository, 'refreshHoldingDividends').mockRejectedValue(new ApiError('Foundry permission failed. Check the managed identity role assignment.', 503));
    render(<PassiveIncomePage holdingRepository={repository} />);
    await user.click(await screen.findByText('Research status and sources (2 securities)'));
    await user.click(screen.getByRole('button', { name: 'Refresh JEPQ distributions' }));
    expect(await screen.findByText('JEPQ: Foundry permission failed. Check the managed identity role assignment.')).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledExactlyOnceWith('other');
    expect(screen.getByRole('button', { name: /Feb, 2 payments, \$22.00/ })).toBeInTheDocument();
  });

  it('shows exactly the requested year views and preserves ex-date, source, statuses and precision', async () => {
    const user = userEvent.setup();
    const repository = createMockHoldingRepository();
    vi.spyOn(repository, 'listHoldings').mockResolvedValue([{
      ...testHolding, security: { ...testHolding.security, payoutDetails: [
        ...testHolding.security.payoutDetails!,
        { exDividendDate: '2025-12-30', paymentDate: '2026-01-06', amount: 0.123456, mode: 'manual' },
        { exDividendDate: '2026-11-15', amount: 1.2, status: 'announced', sourceUrl: 'https://issuer.example/dividends' },
        { exDividendDate: '2026-12-15', amount: 1.15, status: 'projected', forecastMethod: 'seasonal_median_v1' },
        { exDividendDate: '2027-02-15', amount: 1.15, status: 'projected', forecastMethod: 'seasonal_median_v1' },
      ] },
    }]);
    render(<PassiveIncomePage holdingRepository={repository} />);
    const year = await screen.findByRole('combobox', { name: 'Distribution year' });
    expect(year).toHaveValue('2026');
    expect(within(year).getAllByRole('option')).toHaveLength(3);
    expect(screen.getByText('Actual: $11.00 · Announced: $12.00 · Projected: $11.50')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Nov, 1 payment/ }));
    expect(screen.getByRole('link', { name: 'VTI distribution source' })).toHaveAttribute('href', 'https://issuer.example/dividends');
    expect(screen.getByText('Announced · Income')).toBeInTheDocument();
    await user.selectOptions(year, '2025');
    await user.click(screen.getByRole('button', { name: /Dec, 1 payment/ }));
    const table = screen.getByRole('table', { name: 'Dec distribution details' });
    expect(within(table).getByText('2025-12-30')).toBeInTheDocument();
    expect(within(table).getByText('Pay date: 2026-01-06')).toBeInTheDocument();
    expect(within(table).getByText('$0.123456')).toBeInTheDocument();
    expect(within(table).getByText('User-entered')).toBeInTheDocument();
    await user.selectOptions(year, '2027');
    await user.click(screen.getByRole('button', { name: /Feb, 1 payment/ }));
    expect(screen.getByText('Projected · Income')).toBeInTheDocument();
    expect(screen.getByText(/Method: seasonal_median_v1/)).toBeInTheDocument();
  });

  it('keeps available records on refresh failure and retries with accessible progress', async () => {
    const user = userEvent.setup();
    const repository = createMockHoldingRepository();
    const list = vi.spyOn(repository, 'listHoldings').mockResolvedValue([testHolding]);
    const refresh = vi.spyOn(repository, 'refreshHoldingDividends').mockRejectedValueOnce(new Error('provider timeout')).mockResolvedValue(testHolding);
    render(<PassiveIncomePage holdingRepository={repository} />);
    await user.click(await screen.findByRole('button', { name: 'Refresh distribution data' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('failed for VTI');
    expect(screen.getByRole('button', { name: /Feb, 1 payment, \$11.00/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry distribution refresh' }));
    expect(await screen.findByText('1 of 1 securities refreshed.')).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refreshes a security once and reloads distinct holding manual overrides', async () => {
    const user = userEvent.setup();
    const repository = createMockHoldingRepository();
    const other = { ...testHolding, id: 'other-holding', security: { ...testHolding.security, manualPayoutDetails: [{ exDividendDate: '2026-05-01', amount: 7, mode: 'manual' as const }], payoutDetails: [{ exDividendDate: '2026-05-01', amount: 7, mode: 'manual' as const }] } };
    vi.spyOn(repository, 'listHoldings').mockResolvedValue([testHolding, other]);
    const reload = vi.fn().mockResolvedValue([testHolding, other]);
    repository.reloadHoldings = reload;
    const refresh = vi.spyOn(repository, 'refreshHoldingDividends').mockResolvedValue(testHolding);
    render(<PassiveIncomePage holdingRepository={repository} />);
    await user.click(await screen.findByRole('button', { name: 'Refresh distribution data' }));
    expect(await screen.findByText('1 of 1 securities refreshed.')).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /May, 1 payment, \$70.00/ })).toBeInTheDocument();
  });

  it('separates event currencies without adding unlike amounts', async () => {
    const user = userEvent.setup();
    const repository = createMockHoldingRepository();
    vi.spyOn(repository, 'listHoldings').mockResolvedValue([{ ...testHolding, security: { ...testHolding.security, payoutDetails: [
      { exDividendDate: '2026-02-01', amount: 1, currency: 'USD' },
      { exDividendDate: '2026-02-01', amount: 2, currency: 'CAD' },
    ] } }]);
    render(<PassiveIncomePage holdingRepository={repository} />);
    const currency = await screen.findByRole('combobox', { name: /Currency/ });
    expect(screen.getByText('Actual: $10.00 · Announced: $0.00 · Projected: $0.00')).toBeInTheDocument();
    await user.selectOptions(currency, 'CAD');
    expect(screen.getByText('Actual: CA$20.00 · Announced: CA$0.00 · Projected: CA$0.00')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Future Forecast' }));
    expect(within(screen.getByRole('table', { name: 'Annual dividend forecast values' })).getByRole('row', { name: '2026 CA$20.00' })).toBeInTheDocument();
  });
});
