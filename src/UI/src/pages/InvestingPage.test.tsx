import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Account } from '../domain/account';
import type { Holding } from '../domain/holding';
import { createMockAccountRepository } from '../domain/accountRepository';
import type { HoldingRepository } from '../domain/holdingRepository';
import { createMockHoldingRepository } from '../domain/holdingRepository';
import { createMockIncomeSourceRepository } from '../domain/incomeSourceRepository';
import { InvestingPage } from './InvestingPage';

describe('InvestingPage', () => {
  const investmentAccounts: Account[] = [
    {
      id: 'acc-taxable-brokerage',
      name: 'Fidelity Taxable Brokerage',
      type: 'Investment',
      startingBalance: 48500,
      startDate: '2026-01-01',
      yieldRate: 0,
      assignedIncomeSourceIds: [],
      investmentAccountType: 'Taxable',
      investmentBrokerage: 'Fidelity',
      manageHoldings: true,
      yearlyContribution: 14400,
      columns: [],
      monthlyRecords: [],
      createdAt: '2026-06-30T00:00:00.000Z',
      updatedAt: '2026-06-30T00:00:00.000Z',
    },
  ];

  const selectSecurityFromDialog = async (symbol: string) => {
    const dialog = screen.getByRole('heading', { name: 'Add Security' }).closest('form');
    expect(dialog).not.toBeNull();
    const result = await within(dialog as HTMLElement).findByRole(
      'button',
      { name: new RegExp(symbol, 'i') },
      { timeout: 3000 },
    );
    await userEvent.click(result);
  };

  it('shows investing subsections and switches panels', async () => {
    render(
      <InvestingPage
        accountRepository={createMockAccountRepository({ initialAccounts: investmentAccounts })}
        holdingRepository={createMockHoldingRepository()}
        incomeRepository={createMockIncomeSourceRepository()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Investing' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Funding Schedule' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Holdings' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Passive Income' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Retirement Planning' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Retirement Planning' }));

    expect(screen.getByRole('tab', { name: 'Retirement Planning' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByText('Model long-term targets, timelines, and retirement readiness.'),
    ).toBeInTheDocument();
  });

  it('adds a searched security to investment accounts', async () => {
    const holdingRepository = createMockHoldingRepository();
    const refreshHoldingSecurityDetails = vi.spyOn(
      holdingRepository,
      'refreshHoldingSecurityDetails',
    );
    const updateManualPayoutDetails = vi.spyOn(
      holdingRepository,
      'updateManualPayoutDetails',
    );
    render(
      <InvestingPage
        accountRepository={createMockAccountRepository({ initialAccounts: investmentAccounts })}
        holdingRepository={holdingRepository}
        incomeRepository={createMockIncomeSourceRepository()}
      />,
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Holdings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add Security' }));
    await userEvent.type(screen.getByLabelText('Security'), 'vti');
    await selectSecurityFromDialog('VTI');
    await userEvent.click(screen.getByRole('button', { name: 'Add Row' }));

    await userEvent.type(
      screen.getByLabelText('VTI quantity for Fidelity Taxable Brokerage'),
      '12.5',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Holdings saved.')).toBeInTheDocument();
    expect(refreshHoldingSecurityDetails).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('columnheader', { name: 'Security' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Ticker' })).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Fidelity Taxabl...' }),
    ).toHaveClass('excel-col-editable-header');
    expect(screen.getByRole('cell', { name: /^Vanguard Total Stock Market ETF/ })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'VTI' })).toBeInTheDocument();
    expect(screen.getByText(/Last updated/)).toBeInTheDocument();
    expect(screen.getByLabelText('VTI quantity for Fidelity Taxable Brokerage')).toHaveValue(
      '12.5',
    );
    expect(screen.getByRole('cell', { name: '$3,937.50' })).toBeInTheDocument();
    expect(screen.queryByText(/Last payout \$0.45 on 2026-06-28/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Est\. annual \$3.72/)).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'P/E' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'SMA200' })).not.toBeInTheDocument();

    expect(screen.queryByText('Not updated')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Edit VTI payments' }));
    expect(await screen.findByRole('heading', { name: 'VTI Payments' })).toBeInTheDocument();
    expect(screen.getAllByLabelText('Payment date')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Save payments' }));

    expect(await screen.findByText('VTI payment data was saved.')).toBeInTheDocument();
    expect(updateManualPayoutDetails).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing holding when the same security is added again', async () => {
    render(
      <InvestingPage
        accountRepository={createMockAccountRepository({ initialAccounts: investmentAccounts })}
        holdingRepository={createMockHoldingRepository()}
        incomeRepository={createMockIncomeSourceRepository()}
      />,
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Holdings' }));

    for (let index = 0; index < 2; index += 1) {
      await userEvent.click(screen.getByRole('button', { name: 'Add Security' }));
      await userEvent.type(screen.getByLabelText('Security'), 'vti');
      await selectSecurityFromDialog('VTI');
      await userEvent.click(screen.getByRole('button', { name: 'Add Row' }));
      await screen.findByText('VTI was added.');
    }

    expect(screen.getAllByRole('cell', { name: 'VTI' })).toHaveLength(1);
  });

  it('removes a security holding after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);

    render(
      <InvestingPage
        accountRepository={createMockAccountRepository({ initialAccounts: investmentAccounts })}
        holdingRepository={createMockHoldingRepository()}
        incomeRepository={createMockIncomeSourceRepository()}
      />,
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Holdings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add Security' }));
    await userEvent.type(screen.getByLabelText('Security'), 'vti');
    await selectSecurityFromDialog('VTI');
    await userEvent.click(screen.getByRole('button', { name: 'Add Row' }));
    expect(await screen.findByRole('cell', { name: 'VTI' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /remove vti holding/i }));

    expect(await screen.findByText('VTI was removed.')).toBeInTheDocument();
    expect(screen.queryByRole('cell', { name: 'VTI' })).not.toBeInTheDocument();
    expect(screen.getByText('No holdings have been added yet.')).toBeInTheDocument();
  });

  it('updates all holdings manually with a three second throttle', async () => {
    const holdings: Holding[] = [
      {
        id: 'holding-vti',
        security: {
          symbol: 'VTI',
          name: 'Vanguard Total Stock Market ETF',
          exchange: 'NYSE Arca',
          assetType: 'ETF',
          currency: 'USD',
          price: 315,
        },
        accountPositions: [{ accountId: 'acc-taxable-brokerage', quantity: 10, costBasis: null }],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'holding-schd',
        security: {
          symbol: 'SCHD',
          name: 'Schwab US Dividend Equity ETF',
          exchange: 'NYSE Arca',
          assetType: 'ETF',
          currency: 'USD',
          price: 29,
        },
        accountPositions: [{ accountId: 'acc-taxable-brokerage', quantity: 20, costBasis: null }],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const refreshHoldingSecurityDetails = vi.fn(async (id: string) => {
      const holding = holdings.find((item) => item.id === id);
      if (!holding) {
        throw new Error('Holding not found.');
      }
      return {
        ...holding,
        security: {
          ...holding.security,
          detailsStatus: 'fresh',
          detailsUpdatedAt: '2026-07-12T00:00:00.000Z',
        },
      };
    });
    const holdingRepository: HoldingRepository = {
      searchSecurities: vi.fn(async () => []),
      listHoldings: vi.fn(async () => holdings),
      createHolding: vi.fn(),
      updateHolding: vi.fn(),
      deleteHolding: vi.fn(),
      refreshHoldingSecurityDetails,
      refreshHeldSecurityDetails: vi.fn(),
      updateManualPayoutDetails: vi.fn(),
    };

    render(
      <InvestingPage
        accountRepository={createMockAccountRepository({ initialAccounts: investmentAccounts })}
        holdingRepository={holdingRepository}
        incomeRepository={createMockIncomeSourceRepository()}
      />,
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Holdings' }));
    expect(await screen.findByRole('cell', { name: 'VTI' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Update all holdings' }));

    expect(refreshHoldingSecurityDetails).toHaveBeenCalledTimes(1);
    expect(refreshHoldingSecurityDetails).toHaveBeenNthCalledWith(1, 'holding-vti');

    await new Promise((resolve) => {
      window.setTimeout(resolve, 2900);
    });
    expect(refreshHoldingSecurityDetails).toHaveBeenCalledTimes(1);

    expect(await screen.findByText('Holdings were updated.', {}, { timeout: 2000 })).toBeInTheDocument();
    expect(refreshHoldingSecurityDetails).toHaveBeenCalledTimes(2);
    expect(refreshHoldingSecurityDetails).toHaveBeenNthCalledWith(2, 'holding-schd');
  }, 10000);

  it('shows passive income by month with prior actuals and current and next-year estimates', async () => {
    const holdingRepository = createMockHoldingRepository();
    const currentYear = new Date().getFullYear();
    render(
      <InvestingPage
        accountRepository={createMockAccountRepository({ initialAccounts: investmentAccounts })}
        holdingRepository={holdingRepository}
        incomeRepository={createMockIncomeSourceRepository()}
      />,
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Holdings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add Security' }));
    await userEvent.type(screen.getByLabelText('Security'), 'vti');
    await selectSecurityFromDialog('VTI');
    await userEvent.click(screen.getByRole('button', { name: 'Add Row' }));
    await userEvent.type(
      screen.getByLabelText('VTI quantity for Fidelity Taxable Brokerage'),
      '12.5',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Holdings saved.');

    await userEvent.click(screen.getByRole('tab', { name: 'Passive Income' }));

    expect(await screen.findByRole('heading', { name: 'Passive Income' })).toBeInTheDocument();
    expect(screen.getByText(String(currentYear))).toBeInTheDocument();
    expect(screen.getByText('Dividend income')).toBeInTheDocument();
    expect(screen.getAllByText('$5.63').length).toBeGreaterThan(0);

    const decemberEstimate = screen.getByRole('button', { name: /Dec, 1 payment, \$5\.24/i });
    expect(decemberEstimate.closest('article')).toHaveClass('passive-income-estimate');

    await userEvent.click(screen.getByRole('button', { name: /Jul, 1 payment, \$5\.63/i }));

    expect(screen.getByText(`${currentYear}-07-02`)).toBeInTheDocument();
    expect(screen.getByText('VTI')).toBeInTheDocument();
    expect(screen.getByText('Vanguard Total Stock Market ETF')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Show prior year' }));

    expect(screen.getByText(String(currentYear - 1))).toBeInTheDocument();
    expect(screen.getByText('Prior year actuals')).toBeInTheDocument();
    expect(screen.getAllByText('$5.00').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: 'Show next year' }));
    await userEvent.click(screen.getByRole('button', { name: 'Show next year' }));

    expect(screen.getByText(String(currentYear + 1))).toBeInTheDocument();
    expect(screen.getByText('Next year estimate')).toBeInTheDocument();
    expect(screen.getByText('Estimated income')).toBeInTheDocument();
    expect(screen.getAllByText('$5.89').length).toBeGreaterThan(0);

    const nextYearJulyEstimate = screen.getByRole('button', { name: /Jul, 1 payment, \$5\.89/i });
    expect(nextYearJulyEstimate.closest('article')).toHaveClass('passive-income-estimate');
    await userEvent.click(nextYearJulyEstimate);

    expect(screen.getByText(`${currentYear + 1}-07-02`)).toBeInTheDocument();
    expect(screen.getByText('4.79% growth estimate')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Show current year' }));

    expect(screen.getByText(String(currentYear))).toBeInTheDocument();
    expect(screen.getByText('Current year')).toBeInTheDocument();
  });
});
