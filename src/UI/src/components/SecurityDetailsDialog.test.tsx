import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SecurityDetailsDialog } from './SecurityDetailsDialog';
import type { SecurityMetadata } from '../domain/holding';

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

const securityWithPayments = { ...security, payoutDetails: [
  { exDividendDate: '2026-06-01', amount: 0.5, status: 'completed' as const, mode: 'manual' as const },
  { exDividendDate: '2027-03-01', amount: 0.55, status: 'projected' as const },
] };

describe('SecurityDetailsDialog', () => {
  afterEach(() => vi.restoreAllMocks());
  it('shows dated AI price evidence, safe source links, and explicitly retained metrics', () => {
    render(<SecurityDetailsDialog security={{ ...security, sector: 'Saved sector', detailsStatus: 'partial', detailsProvenance: {
      schemaVersion: 1, provider: 'azure_foundry', agentName: 'stock-details-agent', deployment: 'gpt-6-luna', promptVersion: 'stock-details-agent-v1',
      agentVersion: '1', executionMode: 'registered_agent',
      retrievedAt: '2026-10-21T12:00:00Z', priceKind: 'nav', authoritative: false,
      sources: [{ id: 'issuer', url: 'https://example.com/fund', title: 'Issuer fund details' }, { id: 'unsafe', url: 'javascript:alert(1)', title: 'Unsafe source' }],
      fieldEvidence: [{ field: 'price', sourceIds: ['issuer', 'unsafe'], asOf: '2026-10-20' }],
      warnings: ['Optional metrics were not available.'],
    } }} onClose={vi.fn()} onSaveCorporateActions={vi.fn()} onSaveDividendSettings={vi.fn()} />);
    const researched = screen.getByRole('region', { name: 'AI-researched details' });
    expect(within(researched).getByText('Registered Azure agent: stock-details-agent · version 1')).toBeInTheDocument();
    expect(within(researched).getByText('2026-10-21T12:00:00Z')).toHaveAttribute('dateTime', '2026-10-21T12:00:00Z');
    expect(within(researched).getByText(/Published NAV · As of/)).toBeInTheDocument();
    expect(within(researched).getByText('2026-10-20')).toHaveAttribute('dateTime', '2026-10-20');
    const source = within(researched).getByRole('link', { name: 'Issuer fund details (opens in new tab)' });
    expect(source).toHaveAttribute('href', 'https://example.com/fund');
    expect(source).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(researched).queryByRole('link', { name: /Unsafe/ })).not.toBeInTheDocument();
    expect(within(researched).getByText('Optional metrics were not available.')).toBeInTheDocument();
    const retained = within(researched).getByText('Saved sector').closest('dd')!;
    expect(retained).toHaveTextContent('Retained saved value · observation date unavailable in this research');
    expect(retained.querySelector('time')).toBeNull();
  });

  it('identifies stub details and preserves legacy unknown observation dates', () => {
    const props = { onClose: vi.fn(), onSaveCorporateActions: vi.fn(), onSaveDividendSettings: vi.fn() };
    const { rerender } = render(<SecurityDetailsDialog security={{ ...security, detailsStatus: 'stub' }} {...props} />);
    expect(screen.getByRole('heading', { name: 'Stub security details' })).toBeInTheDocument();
    expect(screen.queryByText('AI-researched details')).not.toBeInTheDocument();
    rerender(<SecurityDetailsDialog security={security} {...props} />);
    expect(screen.getByText('Source and observation dates are unavailable for these saved values.')).toBeInTheDocument();
  });

  it('traps keyboard focus in the dialog and restores the initiating control', async () => {
    const user = userEvent.setup();
    const trigger = document.createElement('button');
    document.body.appendChild(trigger); trigger.focus();
    const { unmount } = render(<SecurityDetailsDialog security={security} onClose={vi.fn()} onSaveCorporateActions={vi.fn()} onSaveDividendSettings={vi.fn()} />);
    const close = screen.getByRole('button', { name: 'Close security details' });
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByLabelText('Dividend growth rate (%)'));
    await user.tab();
    expect(close).toHaveFocus();
    unmount();
    expect(trigger).toHaveFocus(); trigger.remove();
  });

  it('shows security details and the recorded corporate actions in separate tabs', async () => {
    const user = userEvent.setup();
    render(<SecurityDetailsDialog security={security} onClose={vi.fn()} onSaveCorporateActions={vi.fn()} onSaveDividendSettings={vi.fn()} />);

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
    render(<SecurityDetailsDialog security={security} onClose={vi.fn()} onSaveCorporateActions={onSaveCorporateActions} onSaveDividendSettings={vi.fn()} />);

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
    render(<SecurityDetailsDialog security={security} onClose={onClose} onSaveCorporateActions={vi.fn()} onSaveDividendSettings={vi.fn()} />);

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('prefills, resets, and saves the dividend growth rate in percent units', async () => {
    const user = userEvent.setup();
    const onSaveDividendSettings = vi.fn().mockResolvedValue(undefined);
    render(<SecurityDetailsDialog security={security} onClose={vi.fn()} onSaveCorporateActions={vi.fn()} onSaveDividendSettings={onSaveDividendSettings} />);

    const input = screen.getByRole('spinbutton', { name: 'Dividend growth rate (%)' });
    expect(input).toHaveValue(4.79);

    await user.clear(input);
    await user.type(input, '6.25');
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(input).toHaveValue(4.79);

    await user.clear(input);
    await user.type(input, '6.25');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSaveDividendSettings).toHaveBeenCalledWith(0.0625, true);
  });

  it('saves a blank dividend growth rate as an explicit clear', async () => {
    const user = userEvent.setup();
    const onSaveDividendSettings = vi.fn().mockResolvedValue(undefined);
    render(<SecurityDetailsDialog security={security} onClose={vi.fn()} onSaveCorporateActions={vi.fn()} onSaveDividendSettings={onSaveDividendSettings} />);

    await user.clear(screen.getByRole('spinbutton', { name: 'Dividend growth rate (%)' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSaveDividendSettings).toHaveBeenCalledWith(null, true);
  });

  it('defaults legacy Manage Dividends to on and saves a toggle-only change with the existing growth rate', async () => {
    const user = userEvent.setup();
    const onSaveDividendSettings = vi.fn().mockResolvedValue(undefined);
    const onRemovePayments = vi.fn();
    render(<SecurityDetailsDialog security={securityWithPayments} onClose={vi.fn()} onSaveCorporateActions={vi.fn()} onSaveDividendSettings={onSaveDividendSettings} onRemovePayments={onRemovePayments} />);
    const checkbox = screen.getByRole('checkbox', { name: 'Manage Dividends' });
    expect(checkbox).toBeChecked();
    expect(checkbox).toHaveAccessibleDescription('When off, distribution research is skipped for this holding. Saved payments are kept.');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await user.click(checkbox);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSaveDividendSettings).toHaveBeenCalledExactlyOnceWith(0.0479, false);
    expect(onRemovePayments).not.toHaveBeenCalled();
    expect(screen.getByText('2026-06-01 · Actual · $0.50 USD per share')).toBeInTheDocument();
  });

  it('prefills saved false, resets both dividend settings, and closes without saving drafts', async () => {
    const user = userEvent.setup();
    const onSaveDividendSettings = vi.fn();
    const onClose = vi.fn();
    render(<SecurityDetailsDialog security={security} manageDividends={false} onClose={onClose} onSaveCorporateActions={vi.fn()} onSaveDividendSettings={onSaveDividendSettings} />);
    const checkbox = screen.getByRole('checkbox', { name: 'Manage Dividends' });
    const rate = screen.getByLabelText('Dividend growth rate (%)');
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    await user.clear(rate);
    await user.type(rate, '6.25');
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(checkbox).not.toBeChecked();
    expect(rate).toHaveValue(4.79);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: 'Close security details' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSaveDividendSettings).not.toHaveBeenCalled();
  });

  it('saves both dividend settings together and prevents duplicate or conflicting mutations while pending', async () => {
    const user = userEvent.setup();
    let complete!: () => void;
    const onSaveDividendSettings = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { complete = resolve; }));
    const onRemovePayments = vi.fn();
    const onSaveCorporateActions = vi.fn();
    const props = { onClose: vi.fn(), onSaveCorporateActions, onSaveDividendSettings, onRemovePayments };
    const { rerender } = render(<SecurityDetailsDialog security={securityWithPayments} {...props} />);
    await user.click(screen.getByRole('checkbox', { name: 'Manage Dividends' }));
    await user.clear(screen.getByLabelText('Dividend growth rate (%)'));
    await user.type(screen.getByLabelText('Dividend growth rate (%)'), '6.25');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSaveDividendSettings).toHaveBeenCalledExactlyOnceWith(0.0625, false);
    expect(screen.getByRole('checkbox', { name: 'Manage Dividends' })).toBeDisabled();
    expect(screen.getByLabelText('Dividend growth rate (%)')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove payments' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('tabpanel'));
    await user.click(screen.getByRole('tab', { name: 'Corporate actions (1)' }));
    expect(screen.getByLabelText('Old shares')).toBeDisabled();
    fireEvent.submit(screen.getByRole('tabpanel'));
    expect(onSaveCorporateActions).not.toHaveBeenCalled();
    expect(onRemovePayments).not.toHaveBeenCalled();
    expect(onSaveDividendSettings).toHaveBeenCalledOnce();
    await act(async () => complete());
    rerender(<SecurityDetailsDialog security={{ ...securityWithPayments, dividendGrowthRate: 0.0625 }} manageDividends={false} {...props} />);
    await user.click(screen.getByRole('tab', { name: 'Details' }));
    expect(screen.getByRole('status')).toHaveTextContent('Dividend settings saved.');
    expect(screen.getByRole('checkbox', { name: 'Manage Dividends' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('preserves both dividend setting drafts after a failed save and supports retry', async () => {
    const user = userEvent.setup();
    const onSaveDividendSettings = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(undefined);
    render(<SecurityDetailsDialog security={security} manageDividends={false} onClose={vi.fn()} onSaveCorporateActions={vi.fn()} onSaveDividendSettings={onSaveDividendSettings} />);
    await user.click(screen.getByRole('checkbox', { name: 'Manage Dividends' }));
    await user.clear(screen.getByLabelText('Dividend growth rate (%)'));
    await user.type(screen.getByLabelText('Dividend growth rate (%)'), '6.25');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to save dividend settings.');
    expect(screen.getByRole('checkbox', { name: 'Manage Dividends' })).toBeChecked();
    expect(screen.getByLabelText('Dividend growth rate (%)')).toHaveValue(6.25);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSaveDividendSettings).toHaveBeenNthCalledWith(1, 0.0625, true);
    expect(onSaveDividendSettings).toHaveBeenNthCalledWith(2, 0.0625, true);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Dividend settings saved.');
  });

  it('shows an accessible inline error for a dividend growth rate below -100%', async () => {
    const user = userEvent.setup();
    const onSaveDividendSettings = vi.fn().mockResolvedValue(undefined);
    render(<SecurityDetailsDialog security={security} onClose={vi.fn()} onSaveCorporateActions={vi.fn()} onSaveDividendSettings={onSaveDividendSettings} />);

    const input = screen.getByRole('spinbutton', { name: 'Dividend growth rate (%)' });
    await user.clear(input);
    await user.type(input, '-100.01');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('-100% or greater');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(onSaveDividendSettings).not.toHaveBeenCalled();
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
    }} onClose={vi.fn()} onSaveCorporateActions={vi.fn()} onSaveDividendSettings={vi.fn()} />);

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
    ] }} onClose={vi.fn()} onSaveCorporateActions={vi.fn()} onSaveDividendSettings={vi.fn()} />);
    expect(screen.queryByRole('link', { hidden: true })).not.toBeInTheDocument();
    expect(screen.getByText('Source unavailable')).toBeInTheDocument();
    rerender(<SecurityDetailsDialog security={security} onClose={vi.fn()} onSaveCorporateActions={vi.fn()} onSaveDividendSettings={vi.fn()} />);
    expect(screen.getByText('No distribution events are available.')).toBeInTheDocument();
  });

  it('confirms removal, shows success, and preserves unsaved dividend and corporate action drafts', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onRemovePayments = vi.fn().mockResolvedValue(undefined);
    const props = { onClose: vi.fn(), onSaveCorporateActions: vi.fn(), onSaveDividendSettings: vi.fn(), onRemovePayments };
    const { rerender } = render(<SecurityDetailsDialog security={securityWithPayments} {...props} />);
    await user.clear(screen.getByLabelText('Dividend growth rate (%)'));
    await user.type(screen.getByLabelText('Dividend growth rate (%)'), '6.25');
    await user.click(screen.getByRole('checkbox', { name: 'Manage Dividends' }));
    await user.click(screen.getByRole('tab', { name: 'Corporate actions (1)' }));
    await user.clear(screen.getByLabelText('Old shares'));
    await user.type(screen.getByLabelText('Old shares'), '2');
    await user.click(screen.getByRole('tab', { name: 'Details' }));
    const remove = screen.getByRole('button', { name: 'Remove payments' });
    expect(remove).toHaveAttribute('type', 'button');
    expect(remove).toHaveClass('link-button-danger');
    await user.click(remove);
    expect(confirm).toHaveBeenCalledExactlyOnceWith('Remove all source, manual, and projected payments for SCHD? Holdings and dividend settings are kept. Refreshing distributions can load source payments again.');
    expect(onRemovePayments).toHaveBeenCalledOnce();
    rerender(<SecurityDetailsDialog security={security} {...props} />);
    expect(screen.getByRole('status')).toHaveTextContent('Payments removed.');
    expect(screen.getByText('No distribution events are available.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove payments' })).toBeDisabled();
    expect(screen.getByLabelText('Dividend growth rate (%)')).toHaveValue(6.25);
    expect(screen.getByRole('checkbox', { name: 'Manage Dividends' })).not.toBeChecked();
    await user.click(screen.getByRole('tab', { name: 'Corporate actions (1)' }));
    expect(screen.getByLabelText('Old shares')).toHaveValue(2);
    expect(props.onSaveCorporateActions).not.toHaveBeenCalled();
    expect(props.onSaveDividendSettings).not.toHaveBeenCalled();
  });

  it('keeps payments when the confirmation is cancelled', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onRemovePayments = vi.fn();
    render(<SecurityDetailsDialog security={securityWithPayments} onClose={vi.fn()} onSaveCorporateActions={vi.fn()} onSaveDividendSettings={vi.fn()} onRemovePayments={onRemovePayments} />);
    await user.click(screen.getByRole('button', { name: 'Remove payments' }));
    expect(onRemovePayments).not.toHaveBeenCalled();
    expect(screen.getByText('2026-06-01 · Actual · $0.50 USD per share')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('blocks duplicate removal and other mutation controls while removal is pending', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let complete!: () => void;
    const onRemovePayments = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { complete = resolve; }));
    const onSaveDividendSettings = vi.fn();
    const onSaveCorporateActions = vi.fn();
    render(<SecurityDetailsDialog security={securityWithPayments} onClose={vi.fn()} onSaveCorporateActions={onSaveCorporateActions} onSaveDividendSettings={onSaveDividendSettings} onRemovePayments={onRemovePayments} />);
    await user.clear(screen.getByLabelText('Dividend growth rate (%)'));
    await user.type(screen.getByLabelText('Dividend growth rate (%)'), '6.25');
    await user.click(screen.getByRole('button', { name: 'Remove payments' }));
    const remove = screen.getByRole('button', { name: 'Removing payments…' });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAttribute('aria-busy', 'true');
    await user.click(remove);
    expect(confirm).toHaveBeenCalledOnce();
    expect(onRemovePayments).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Dividend growth rate (%)')).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Manage Dividends' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('tabpanel'));
    await user.click(screen.getByRole('tab', { name: 'Corporate actions (1)' }));
    expect(screen.getByLabelText('Old shares')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete corporate action dated 2024-10-10' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('tabpanel'));
    expect(onSaveDividendSettings).not.toHaveBeenCalled();
    expect(onSaveCorporateActions).not.toHaveBeenCalled();
    await act(async () => complete());
    expect(screen.getByLabelText('Old shares')).toBeEnabled();
  });

  it('keeps records and shows an accessible error on failure, then allows retry', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onRemovePayments = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(undefined);
    render(<SecurityDetailsDialog security={securityWithPayments} onClose={vi.fn()} onSaveCorporateActions={vi.fn()} onSaveDividendSettings={vi.fn()} onRemovePayments={onRemovePayments} />);
    await user.click(screen.getByRole('button', { name: 'Remove payments' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to remove payments. Existing records are still shown. Try again.');
    expect(screen.getByText('2026-06-01 · Actual · $0.50 USD per share')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove payments' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Remove payments' }));
    expect(onRemovePayments).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Payments removed.');
  });

  it('hides removal without a callback and disables it when no saved payment or research data exists', () => {
    const props = { onClose: vi.fn(), onSaveCorporateActions: vi.fn(), onSaveDividendSettings: vi.fn() };
    const { rerender } = render(<SecurityDetailsDialog security={securityWithPayments} {...props} />);
    expect(screen.queryByRole('button', { name: 'Remove payments' })).not.toBeInTheDocument();
    rerender(<SecurityDetailsDialog security={{ ...security, dividendResearchSnapshot: {}, dividendResearchWarnings: [], payoutDetails: [], sourcePayoutDetails: [], manualPayoutDetails: [], payoutAuditDetails: [] }} {...props} onRemovePayments={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Remove payments' })).toBeDisabled();
  });

  it.each<Partial<SecurityMetadata>>([
    { dividendResearchRetrievedAt: '2026-10-21T12:00:00Z' },
    { dividendResearchSnapshot: { evidence: ['Saved research'] } },
    { dividendPreviousYear: 0.5 },
    { dividendCurrentYear: 0.6 },
    { estimatedFuturePayout: 0.7 },
    { dividendStatus: 'paid' },
    { sourcePayoutDetails: [{ exDividendDate: '2026-06-01', amount: 1 }] },
    { manualPayoutDetails: [{ exDividendDate: '2026-06-01', amount: 1, mode: 'manual' }] },
    { payoutAuditDetails: [{ exDividendDate: '2026-06-01', amount: 1, status: 'superseded' }] },
  ])('allows removal when saved metadata exists without visible distribution events (%j)', (savedData) => {
    render(<SecurityDetailsDialog security={{ ...security, ...savedData }} onClose={vi.fn()} onSaveCorporateActions={vi.fn()} onSaveDividendSettings={vi.fn()} onRemovePayments={vi.fn()} />);
    expect(screen.getByText('No distribution events are available.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove payments' })).toBeEnabled();
  });
});

