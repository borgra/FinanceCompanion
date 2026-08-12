import { render, screen } from '@testing-library/react';
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
});

