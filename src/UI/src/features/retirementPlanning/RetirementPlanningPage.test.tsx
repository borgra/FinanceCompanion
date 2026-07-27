import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Account } from '../../domain/account';
import type { AccountRepository } from '../../domain/accountRepository';
import type { Holding } from '../../domain/holding';
import type { HoldingRepository } from '../../domain/holdingRepository';
import { createDefaultRetirementPlan, type RetirementPlan } from '../../domain/retirementPlan';
import type { RetirementPlanRepository } from '../../domain/retirementPlanRepository';
import { RetirementPlanningPage } from './RetirementPlanningPage';

const taxableAccount: Account = {
  id: 'taxable', name: 'Taxable brokerage', type: 'Investment', investmentAccountType: 'Taxable',
  startingBalance: 0, startDate: '2026-01-01', yieldRate: 0, assignedIncomeSourceIds: [], columns: [], monthlyRecords: [],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};

const usdHolding: Holding = {
  id: 'vti', security: { symbol: 'VTI', name: 'VTI', exchange: 'NYSE', assetType: 'ETF', currency: 'USD', price: 100, detailsUpdatedAt: '2026-07-20T12:00:00Z' },
  accountPositions: [{ accountId: 'taxable', quantity: 1000 }], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};

const savedPlan = (): RetirementPlan => ({
  ...createDefaultRetirementPlan(), annualRoiPercent: 5, currentAge: 40, retirementAge: 60, longevityAge: 62,
  annualRetirementExpense: 12000,
  taxableContribution: { monthlyAmount: 0, annualIncreasePercent: 0, endAge: 60 },
  retirementContribution: { monthlyAmount: 0, annualIncreasePercent: 0, endAge: 60 },
  socialSecurity: { enabled: false, claimAge: 62, monthlyBenefit: 0, annualColaPercent: 0 },
  updatedAt: '2026-07-20T12:00:00Z',
});

const accountRepository = (listAccounts = vi.fn(async () => [taxableAccount])) => ({ listAccounts } as unknown as AccountRepository);
const holdingRepository = (listHoldings = vi.fn(async () => [usdHolding])) => ({ listHoldings } as unknown as HoldingRepository);
const planRepository = (options: { get?: RetirementPlanRepository['get']; put?: RetirementPlanRepository['put'] } = {}) => ({
  get: options.get ?? vi.fn(async () => undefined),
  put: options.put ?? vi.fn(async (plan: RetirementPlan) => ({ ...plan, updatedAt: '2026-07-26T12:00:00Z' })),
});

const assumptionPanel = (name: string) => screen.getByText(name, { selector: 'summary' }).closest('details') as HTMLDetailsElement;

const renderPage = (options: {
  accounts?: AccountRepository;
  holdings?: HoldingRepository;
  plans?: RetirementPlanRepository;
  onAddHoldings?: () => void;
} = {}) => render(<RetirementPlanningPage
  accountRepository={options.accounts ?? accountRepository()}
  holdingRepository={options.holdings ?? holdingRepository()}
  retirementPlanRepository={options.plans ?? planRepository()}
  onAddHoldings={options.onAddHoldings}
/>);

describe('RetirementPlanningPage', () => {
  it('uses independently controlled native accordions with the first two panels open', async () => {
    const { container } = renderPage();
    await screen.findByRole('heading', { name: 'Plan assumptions' });

    const form = container.querySelector('form.retirement-assumptions');
    const panels = [...(form?.querySelectorAll('details.retirement-assumption-section') ?? [])];
    expect(panels).toHaveLength(5);
    expect(panels.map((panel) => panel.querySelector('summary')?.textContent)).toEqual([
      'About you', 'Growth and withdrawals', 'Monthly contributions', 'Social Security', 'Expense changes',
    ]);
    expect(panels.map((panel) => panel.hasAttribute('open'))).toEqual([true, true, false, false, false]);

    await userEvent.click(screen.getByText('Monthly contributions'));
    expect(panels[0]).toHaveAttribute('open');
    expect(panels[1]).toHaveAttribute('open');
    expect(panels[2]).toHaveAttribute('open');
  });

  it('removes the retirement snapshot and keeps valuation status with plan assumptions', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Plan assumptions' });
    expect(screen.queryByText('Retirement planning snapshot')).not.toBeInTheDocument();
    expect(screen.queryByText('Saved scenario · Base Plan')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Portfolio valuation status')).toHaveTextContent('Price freshness:');
    expect(screen.getByLabelText('Portfolio valuation status')).toHaveTextContent('All assigned supported USD holdings');
  });

  it('loads an unconfigured plan with blank ROI and focuses an actionable error summary', async () => {
    const plans = planRepository();
    renderPage({ plans });
    const roi = await screen.findByLabelText('Annual ROI (%)');
    expect(roi).toHaveValue(null);
    await userEvent.click(screen.getByRole('button', { name: 'Calculate Plan' }));
    const summary = await screen.findByRole('alert');
    expect(summary).toHaveTextContent('Enter an ROI from -100% to 100%');
    await waitFor(() => expect(summary).toHaveFocus());
    expect(plans.put).not.toHaveBeenCalled();
  });

  it('shows only Annual ROI and an annual dollar withdrawal in Growth and withdrawals', async () => {
    renderPage({ plans: planRepository({ get: vi.fn(async () => savedPlan()) }) });
    await screen.findByText('Balance at retirement:');
    const growth = assumptionPanel('Growth and withdrawals');

    expect(within(growth).getByLabelText('Annual ROI (%)')).toBeInTheDocument();
    expect(within(growth).getByLabelText('Annual withdrawal ($)')).toBeInTheDocument();
    expect(within(growth).getByText('Social Security reduces the amount drawn from your portfolio.')).toBeInTheDocument();
    expect(within(growth).queryByLabelText(/Withdrawal-rate target/i)).not.toBeInTheDocument();
    expect(within(growth).queryByLabelText(/Withdrawal mode/i)).not.toBeInTheDocument();
    expect(within(growth).getAllByRole('spinbutton')).toHaveLength(2);
  });

  it('opens only Growth and withdrawals for an invalid annual expense', async () => {
    renderPage({ plans: planRepository({ get: vi.fn(async () => savedPlan()) }) });
    await screen.findByText('Balance at retirement:');
    const growth = assumptionPanel('Growth and withdrawals');
    const contributions = assumptionPanel('Monthly contributions');
    const socialSecurity = assumptionPanel('Social Security');
    await userEvent.click(screen.getByText('Growth and withdrawals', { selector: 'summary' }));
    expect(growth).not.toHaveAttribute('open');

    fireEvent.change(screen.getByLabelText(/Annual withdrawal/), { target: { value: '-1' } });
    await userEvent.click(screen.getByRole('button', { name: 'Calculate Plan' }));

    await screen.findAllByText('Annual withdrawal must be a non-negative amount.');
    expect(growth).toHaveAttribute('open');
    expect(contributions).not.toHaveAttribute('open');
    expect(socialSecurity).not.toHaveAttribute('open');
    expect(screen.getByLabelText(/Annual withdrawal/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/Taxable monthly contribution/)).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText(/Retirement monthly contribution/)).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText(/Monthly Social Security benefit/)).toHaveAttribute('aria-invalid', 'false');
  });

  it('opens only Monthly contributions for an invalid contribution amount', async () => {
    renderPage({ plans: planRepository({ get: vi.fn(async () => savedPlan()) }) });
    await screen.findByText('Balance at retirement:');
    await userEvent.click(screen.getByText('About you', { selector: 'summary' }));
    await userEvent.click(screen.getByText('Growth and withdrawals', { selector: 'summary' }));

    fireEvent.change(screen.getByLabelText('Taxable monthly contribution'), { target: { value: '-1' } });
    await userEvent.click(screen.getByRole('button', { name: 'Calculate Plan' }));

    await screen.findAllByText('Taxable monthly contribution must be a non-negative amount.');
    expect(assumptionPanel('About you')).not.toHaveAttribute('open');
    expect(assumptionPanel('Growth and withdrawals')).not.toHaveAttribute('open');
    expect(assumptionPanel('Monthly contributions')).toHaveAttribute('open');
    expect(assumptionPanel('Social Security')).not.toHaveAttribute('open');
    expect(assumptionPanel('Expense changes')).not.toHaveAttribute('open');
    expect(screen.getByLabelText(/Taxable monthly contribution/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/Retirement monthly contribution/)).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText(/Annual withdrawal/)).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText(/Monthly Social Security benefit/)).toHaveAttribute('aria-invalid', 'false');
  });

  it('opens only Social Security for an invalid benefit amount', async () => {
    renderPage({ plans: planRepository({ get: vi.fn(async () => savedPlan()) }) });
    await screen.findByText('Balance at retirement:');
    await userEvent.click(screen.getByText('About you', { selector: 'summary' }));
    await userEvent.click(screen.getByText('Growth and withdrawals', { selector: 'summary' }));

    fireEvent.change(screen.getByLabelText('Monthly Social Security benefit'), { target: { value: '-1' } });
    await userEvent.click(screen.getByRole('button', { name: 'Calculate Plan' }));

    await screen.findAllByText('Monthly Social Security benefit must be a non-negative amount.');
    expect(assumptionPanel('About you')).not.toHaveAttribute('open');
    expect(assumptionPanel('Growth and withdrawals')).not.toHaveAttribute('open');
    expect(assumptionPanel('Monthly contributions')).not.toHaveAttribute('open');
    expect(assumptionPanel('Social Security')).toHaveAttribute('open');
    expect(assumptionPanel('Expense changes')).not.toHaveAttribute('open');
    expect(screen.getByLabelText(/Monthly Social Security benefit/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/Annual withdrawal/)).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText(/Taxable monthly contribution/)).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText(/Retirement monthly contribution/)).toHaveAttribute('aria-invalid', 'false');
  });

  it('offers retry and requests all three data sources again after a load failure', async () => {
    const get = vi.fn<RetirementPlanRepository['get']>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const listAccounts = vi.fn(async () => [] as Account[]);
    const listHoldings = vi.fn(async () => [] as Holding[]);
    renderPage({ plans: planRepository({ get }), accounts: accountRepository(listAccounts), holdings: holdingRepository(listHoldings) });
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Plan assumptions' })).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
    expect(listAccounts).toHaveBeenCalledTimes(2);
    expect(listHoldings).toHaveBeenCalledTimes(2);
  });

  it('keeps a zero-balance scenario usable and links to Add holdings', async () => {
    const onAddHoldings = vi.fn();
    renderPage({ accounts: accountRepository(vi.fn(async () => [])), holdings: holdingRepository(vi.fn(async () => [])), onAddHoldings });
    expect(await screen.findByText(/zero-balance scenario/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add holdings' }));
    expect(onAddHoldings).toHaveBeenCalledOnce();
  });

  it('shows saved-plan summaries and marks the result stale after an assumption changes', async () => {
    renderPage({ plans: planRepository({ get: vi.fn(async () => savedPlan()) }) });
    expect(await screen.findByText('Balance at retirement:')).toBeInTheDocument();
    expect(screen.getByText('First retirement-year need:')).toBeInTheDocument();
    const expense = screen.getByLabelText(/Annual withdrawal/);
    fireEvent.change(expense, { target: { value: '24000' } });
    expect(screen.getByRole('status')).toHaveTextContent('Not recalculated');
  });

  it('labels excluded positions and its resulting projection as incomplete', async () => {
    const cad = { ...usdHolding, id: 'cad', security: { ...usdHolding.security, symbol: 'CAD', currency: 'CAD' } };
    renderPage({ plans: planRepository({ get: vi.fn(async () => savedPlan()) }), holdings: holdingRepository(vi.fn(async () => [cad])) });
    expect(await screen.findByText(/Incomplete valuation/)).toBeInTheDocument();
    expect(screen.getByText(/Incomplete projection/)).toBeInTheDocument();
    expect(screen.getByText(/currency conversion is not supported/)).toBeInTheDocument();
  });

  it('blocks persistence and shows a claim-age field error when disabled Social Security has an invalid age', async () => {
    const plans = planRepository({ get: vi.fn(async () => savedPlan()) });
    renderPage({ plans });
    await screen.findByText('Balance at retirement:');
    const socialSecurityPanel = screen.getByText('Social Security', { selector: 'summary' }).closest('details');
    expect(socialSecurityPanel).not.toHaveAttribute('open');
    fireEvent.change(screen.getByLabelText('Social Security claim age'), { target: { value: '61' } });
    await userEvent.click(screen.getByRole('button', { name: 'Calculate Plan' }));
    expect(await screen.findAllByText('Social Security claim age must be a whole age of 62 or later within the plan.')).toHaveLength(2);
    expect(screen.getByRole('spinbutton', { name: /Social Security claim age/ })).toHaveAttribute('aria-invalid', 'true');
    expect(socialSecurityPanel).toHaveAttribute('open');
    expect(plans.put).not.toHaveBeenCalled();
  });
  it('retains the last result and reports a save failure', async () => {
    const put = vi.fn<RetirementPlanRepository['put']>().mockRejectedValue(new Error('offline'));
    renderPage({ plans: planRepository({ get: vi.fn(async () => savedPlan()), put }) });
    expect(await screen.findByText('Balance at retirement:')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Annual withdrawal/), { target: { value: '24000' } });
    await userEvent.click(screen.getByRole('button', { name: 'Calculate Plan' }));
    expect(await screen.findByText(/last valid result is still shown/)).toBeInTheDocument();
    expect(screen.getByText('Balance at retirement:')).toBeInTheDocument();
  });

  it('reports exact depletion separately from a funding gap', async () => {
    const depletedPlan: RetirementPlan = {
      ...savedPlan(),
      currentAge: 60,
      retirementAge: 60,
      longevityAge: 62,
      annualRoiPercent: 0,
      annualRetirementExpense: 300,
      taxableContribution: { monthlyAmount: 0, annualIncreasePercent: 0, endAge: 60 },
      retirementContribution: { monthlyAmount: 0, annualIncreasePercent: 0, endAge: 60 },
      socialSecurity: { enabled: false, claimAge: 62, monthlyBenefit: 0, annualColaPercent: 0 },
    };
    const depletionHolding: Holding = {
      ...usdHolding,
      accountPositions: [{ accountId: 'taxable', quantity: 9 }],
    };
    renderPage({
      plans: planRepository({ get: vi.fn(async () => depletedPlan) }),
      holdings: holdingRepository(vi.fn(async () => [depletionHolding])),
    });

    expect(await screen.findByText('Projected assets first reach zero at age 62.')).toBeInTheDocument();
    expect(screen.queryByText(/First projected funding gap/)).not.toBeInTheDocument();
  });
  it('moves focus to results after calculation', async () => {
    renderPage({ plans: planRepository({ get: vi.fn(async () => savedPlan()) }) });
    await screen.findByText('Balance at retirement:');
    await userEvent.click(screen.getByRole('button', { name: 'Calculate Plan' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Projection results' })).toHaveFocus());
  });

  it('supports modal initial focus, focus containment, Escape close, and trigger restoration', async () => {
    renderPage({ plans: planRepository({ get: vi.fn(async () => savedPlan()) }) });
    const trigger = (await screen.findAllByRole('button', { name: /Show calculation details/ }))[0];
    await userEvent.click(trigger);
    const dialog = screen.getByRole('dialog');
    const close = screen.getByRole('button', { name: 'Close' });
    for (const label of [
      'Starting Taxable:', 'Starting Retirement:', 'Taxable contribution:', 'Retirement contribution:',
      'Social Security:', 'Planned withdrawal:', 'Taxable withdrawal:', 'Retirement withdrawal:',
      'Total withdrawal:',
      'Taxable growth =', 'Retirement growth =', 'Ending Taxable:', 'Ending Retirement:',
      'Ending total:', 'Unmet need:', 'Status:', 'Applicable expense changes:',
    ]) expect(dialog).toHaveTextContent(label);
    expect(close).toHaveFocus();
    await userEvent.tab();
    expect(close).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(dialog).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('places retirement bridge years in the taxable-only table before the age-60 table', async () => {
    const bridgePlan = {
      ...savedPlan(),
      retirementAge: 55,
      taxableContribution: { monthlyAmount: 0, annualIncreasePercent: 0, endAge: 55 },
      retirementContribution: { monthlyAmount: 0, annualIncreasePercent: 0, endAge: 55 },
    };
    renderPage({ plans: planRepository({ get: vi.fn(async () => bridgePlan) }) });

    const bridgeTable = await screen.findByRole('table', { name: /Retirement Years before age 60 — taxable account drawdown/ });
    const standardTable = screen.getByRole('table', { name: /Retirement Years from age 60 — standard retirement planning/ });
    expect(within(bridgeTable).getByText('55')).toBeInTheDocument();
    expect(within(bridgeTable).getByRole('columnheader', { name: 'Taxable' })).toHaveAttribute('colspan', '3');
    expect(within(bridgeTable).getByRole('columnheader', { name: 'Retirement' })).toBeInTheDocument();
    expect(within(bridgeTable).queryByRole('columnheader', { name: /contribution/i })).not.toBeInTheDocument();
    expect(within(bridgeTable).queryByRole('columnheader', { name: /Retirement withdrawal/i })).not.toBeInTheDocument();
    expect(within(standardTable).getByText('60')).toBeInTheDocument();
  });
  it('renders one desktop table and native expandable mobile cards for the annual projection', async () => {
    renderPage({ plans: planRepository({ get: vi.fn(async () => savedPlan()) }) });
    const contributionTable = await screen.findByRole('table', { name: /Contribution Years — annual compounding projection/ });
    const bridgeTable = screen.getByRole('table', { name: /Retirement Years before age 60 — taxable account drawdown/ });
    const standardTable = screen.getByRole('table', { name: /Retirement Years from age 60 — standard retirement planning/ });
    expect(contributionTable).toBeInTheDocument();
    expect(bridgeTable).toHaveTextContent('No retirement years before age 60 apply to this plan.');
    expect(standardTable).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader', { name: 'Year' })).toHaveLength(3);
    expect(screen.getAllByRole('columnheader', { name: 'Age' })).toHaveLength(3);
    expect(screen.queryByRole('columnheader', { name: 'Year / age' })).not.toBeInTheDocument();
    expect(within(contributionTable).getByRole('columnheader', { name: 'Taxable' })).toHaveAttribute('colspan', '4');
    expect(within(contributionTable).getByRole('columnheader', { name: 'Retirement' })).toHaveAttribute('colspan', '4');
    expect(within(contributionTable).queryByRole('columnheader', { name: /withdrawal/i })).not.toBeInTheDocument();
    expect(within(standardTable).getByRole('columnheader', { name: 'Withdrawal' })).toBeInTheDocument();
    expect(within(standardTable).queryByRole('columnheader', { name: /planned withdrawal|withdrawals \(T \/ R\)|total withdrawal/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Withdrawal %' })).not.toBeInTheDocument();
    expect(within(standardTable).getByRole('columnheader', { name: 'Taxable' })).toHaveAttribute('colspan', '4');
    expect(within(standardTable).getByRole('columnheader', { name: 'Retirement' })).toHaveAttribute('colspan', '4');
    expect(within(standardTable).getAllByRole('columnheader', { name: 'End' })).toHaveLength(2);
    const mobileCards = screen.getByLabelText('Annual projection details');
    expect(mobileCards.querySelectorAll('details').length).toBeGreaterThan(0);
    for (const label of [
      'Starting taxable:', 'Starting retirement:', 'Taxable contribution:', 'Retirement contribution:',
      'Social Security:', 'Planned withdrawal:', 'Taxable withdrawal:', 'Retirement withdrawal:',
      'Total withdrawal:', 'Taxable growth:', 'Retirement growth:',
      'Ending taxable:', 'Ending retirement:', 'Ending total:', 'Status:', 'Funding gap:',
    ]) expect(mobileCards).toHaveTextContent(label);
  });
});
