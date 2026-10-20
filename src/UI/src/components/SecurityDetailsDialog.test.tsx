import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SecurityDetailsDialog } from './SecurityDetailsDialog';

const security = {
  symbol: 'SCHD',
  name: 'Schwab U.S. Dividend Equity ETF',
  exchange: 'NYSE Arca',
  assetType: 'ETF',
  currency: 'USD',
  price: 29,
  dividendGrowthRate: 0.0479,
  corporateActions: [
    { id: 'schd-split-2024', effectiveDate: '2024-10-10', type: 'stock_split' as const, oldShares: 1, newShares: 3 },
  ],
};

describe('SecurityDetailsDialog', () => {
  it('shows security details and the recorded corporate actions in separate tabs', async () => {
    const user = userEvent.setup();
    render(<SecurityDetailsDialog security={security} onClose={vi.fn()} onSaveCorporateActions={vi.fn()} onSaveDividendGrowthRate={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'SCHD security details' })).toBeInTheDocument();
    expect(screen.getByText('NYSE Arca')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Corporate actions (1)' }));

    expect(screen.getByLabelText('Effective date')).toHaveValue('2024-10-10');
    expect(screen.getByLabelText('Action')).toHaveValue('stock_split');
    expect(screen.getByLabelText('Old shares')).toHaveValue(1);
    expect(screen.getByLabelText('New shares')).toHaveValue(3);
  });

  it('edits and deletes actions before saving the updated action set', async () => {
    const user = userEvent.setup();
    const onSaveCorporateActions = vi.fn().mockResolvedValue(undefined);
    render(<SecurityDetailsDialog security={security} onClose={vi.fn()} onSaveCorporateActions={onSaveCorporateActions} onSaveDividendGrowthRate={vi.fn()} />);

    await user.click(screen.getByRole('tab', { name: 'Corporate actions (1)' }));
    await user.clear(screen.getByLabelText('Old shares'));
    await user.type(screen.getByLabelText('Old shares'), '2');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSaveCorporateActions).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'schd-split-2024', oldShares: 2, newShares: 3 }),
    ]);

    await user.click(screen.getByRole('button', { name: 'Delete corporate action dated 2024-10-10' }));
    expect(screen.getByText('No corporate actions are recorded for this security.')).toBeInTheDocument();
  });
  it('closes when Escape is pressed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SecurityDetailsDialog security={security} onClose={onClose} onSaveCorporateActions={vi.fn()} onSaveDividendGrowthRate={vi.fn()} />);

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('prefills, resets, and saves the dividend growth rate in percent units', async () => {
    const user = userEvent.setup();
    const onSaveDividendGrowthRate = vi.fn().mockResolvedValue(undefined);
    render(<SecurityDetailsDialog security={security} onClose={vi.fn()} onSaveCorporateActions={vi.fn()} onSaveDividendGrowthRate={onSaveDividendGrowthRate} />);

    const input = screen.getByRole('spinbutton', { name: 'Dividend growth rate (%)' });
    expect(input).toHaveValue(4.79);

    await user.clear(input);
    await user.type(input, '6.25');
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(input).toHaveValue(4.79);

    await user.clear(input);
    await user.type(input, '6.25');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSaveDividendGrowthRate).toHaveBeenCalledWith(0.0625);
  });

  it('saves a blank dividend growth rate as an explicit clear', async () => {
    const user = userEvent.setup();
    const onSaveDividendGrowthRate = vi.fn().mockResolvedValue(undefined);
    render(<SecurityDetailsDialog security={security} onClose={vi.fn()} onSaveCorporateActions={vi.fn()} onSaveDividendGrowthRate={onSaveDividendGrowthRate} />);

    await user.clear(screen.getByRole('spinbutton', { name: 'Dividend growth rate (%)' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSaveDividendGrowthRate).toHaveBeenCalledWith(null);
  });

  it('shows an accessible inline error for a dividend growth rate below -100%', async () => {
    const user = userEvent.setup();
    const onSaveDividendGrowthRate = vi.fn().mockResolvedValue(undefined);
    render(<SecurityDetailsDialog security={security} onClose={vi.fn()} onSaveCorporateActions={vi.fn()} onSaveDividendGrowthRate={onSaveDividendGrowthRate} />);

    const input = screen.getByRole('spinbutton', { name: 'Dividend growth rate (%)' });
    await user.clear(input);
    await user.type(input, '-100.01');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('-100% or greater');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(onSaveDividendGrowthRate).not.toHaveBeenCalled();
  });

  it('distinguishes active distributions and exposes their source, basis, and forecast details', () => {
    render(<SecurityDetailsDialog security={{
      ...security,
      dividendResearchProvider: 'stub',
      dividendResearchRetrievedAt: '2026-10-19T12:00:00Z',
      dividendResearchStatus: 'partial',
      dividendResearchWarnings: ['Limited source coverage.'],
      payoutDetails: [
        { eventId: 'actual', exDividendDate: '2026-06-01', paymentDate: '2026-06-07', amount: 0.5, status: 'completed', mode: 'manual' },
        { eventId: 'announced', exDividendDate: '2026-12-01', amount: 0.6, status: 'announced', source: 'Issuer', sourceUrl: 'https://example.com/distributions', shareBasis: 'as_of:2026-10-19', rawAmount: '1.8', distributionType: 'return_of_capital' },
        { eventId: 'projected', exDividendDate: '2027-03-01', amount: 0.55, status: 'projected', currency: 'CAD', forecastMethod: 'seasonal_median_v1', forecastRange: { min: '0.5', max: '0.6' } },
        { eventId: 'old', exDividendDate: '2026-11-30', amount: 9, status: 'superseded' },
        { eventId: 'conflict', exDividendDate: '2026-12-02', amount: 0.7, status: 'announced', excludedFromTotals: true },
      ],
    }} onClose={vi.fn()} onSaveCorporateActions={vi.fn()} onSaveDividendGrowthRate={vi.fn()} />);

    const distributions = screen.getByRole('region', { name: 'Distributions' });
    expect(within(distributions).getByText('2026-06-01 · Actual · $0.50 USD per share')).toBeInTheDocument();
    expect(within(distributions).getByText('2026-12-01 · Announced · $0.60 USD per share')).toBeInTheDocument();
    expect(within(distributions).getByText(/2027-03-01 · Projected · .* CAD per share/)).toBeInTheDocument();
    expect(within(distributions).queryByText(/2026-11-30/)).not.toBeInTheDocument();
    expect(within(distributions).getByText(/2026-12-02 · Announced · Conflicting event · excluded from totals/)).toBeInTheDocument();
    expect(within(distributions).getByText('User-entered')).toBeInTheDocument();
    expect(within(distributions).getByRole('link', { name: 'Issuer (opens in new tab)', hidden: true })).toHaveAttribute('href', 'https://example.com/distributions');
    expect(within(distributions).getByText('Split-adjusted to 2026-10-19')).toBeInTheDocument();
    expect(within(distributions).getByText(/Original amount: 1.8 USD/)).toBeInTheDocument();
    expect(within(distributions).getByText('seasonal median v1')).toBeInTheDocument();
    expect(within(distributions).getByText(/not a confidence interval/)).toBeInTheDocument();
    expect(within(distributions).getByText('Limited source coverage.')).toBeInTheDocument();
  });

  it('does not render unsafe source links and gives unavailable distributions an empty state', () => {
    const { rerender } = render(<SecurityDetailsDialog security={{ ...security, payoutDetails: [
      { exDividendDate: '2026-06-01', amount: 1, sourceUrl: 'javascript:alert(1)' },
    ] }} onClose={vi.fn()} onSaveCorporateActions={vi.fn()} onSaveDividendGrowthRate={vi.fn()} />);
    expect(screen.queryByRole('link', { hidden: true })).not.toBeInTheDocument();
    expect(screen.getByText('Source unavailable')).toBeInTheDocument();
    rerender(<SecurityDetailsDialog security={security} onClose={vi.fn()} onSaveCorporateActions={vi.fn()} onSaveDividendGrowthRate={vi.fn()} />);
    expect(screen.getByText('No distribution events are available.')).toBeInTheDocument();
  });
});

