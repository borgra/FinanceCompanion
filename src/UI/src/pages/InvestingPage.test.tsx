import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '../domain/account';
import type { Holding } from '../domain/holding';
import { createMockAccountRepository } from '../domain/accountRepository';
import type { HoldingRepository } from '../domain/holdingRepository';
import { createMockHoldingRepository } from '../domain/holdingRepository';
import { createMockIncomeSourceRepository } from '../domain/incomeSourceRepository';
import { InvestingPage } from './InvestingPage';

describe('InvestingPage', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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
    const searchSecurities = vi.spyOn(holdingRepository, 'searchSecurities');
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
    expect(screen.getByLabelText('Security')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('Security')).toHaveAttribute('autocapitalize', 'none');
    expect(screen.getByLabelText('Security')).toHaveAttribute('spellcheck', 'false');
    await userEvent.type(screen.getByLabelText('Security'), 'vti');
    await selectSecurityFromDialog('VTI');
    await userEvent.click(screen.getByRole('button', { name: 'Add Row' }));
    expect(searchSecurities).toHaveBeenCalledWith('vti');

    await userEvent.type(
      screen.getByLabelText('VTI quantity for Fidelity Taxable Brokerage'),
      '12.5',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Holdings saved.')).toBeInTheDocument();
    expect(refreshHoldingSecurityDetails).not.toHaveBeenCalled();
    expect(screen.getByRole('columnheader', { name: 'Security' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Ticker' })).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Fidelity Taxabl...' }),
    ).toHaveClass('excel-col-editable-header');
    expect(screen.getByRole('cell', { name: /^Vanguard Total Stock Market ETF/ })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'VTI' })).toBeInTheDocument();
    expect(screen.getByText('Not updated')).toBeInTheDocument();
    expect(screen.getByLabelText('VTI quantity for Fidelity Taxable Brokerage')).toHaveValue(
      '12.5',
    );
    expect(screen.getByRole('cell', { name: '$3,937.50' })).toBeInTheDocument();
    expect(screen.queryByText(/Last payout \$0.45 on 2026-06-28/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Est\. annual \$3.72/)).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'P/E' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'SMA200' })).not.toBeInTheDocument();

    expect(screen.getByText('Not updated')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Edit VTI payments' }));
    expect(await screen.findByRole('heading', { name: 'VTI Payments' })).toBeInTheDocument();
    expect(screen.getAllByLabelText('Payment date')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Save payments' }));

    expect(await screen.findByText('VTI payment data was saved.')).toBeInTheDocument();
    expect(updateManualPayoutDetails).toHaveBeenCalledTimes(1);
  });

  it('adds Cash explicitly and keeps its row fixed and action-free', async () => {
    const holdingRepository = createMockHoldingRepository();
    const searchSecurities = vi.spyOn(holdingRepository, 'searchSecurities');
    const createHolding = vi.spyOn(holdingRepository, 'createHolding');
    const refreshHoldingSecurityDetails = vi.spyOn(holdingRepository, 'refreshHoldingSecurityDetails');
    const refreshHoldingDividends = vi.spyOn(holdingRepository, 'refreshHoldingDividends');

    render(
      <InvestingPage
        accountRepository={createMockAccountRepository({ initialAccounts: investmentAccounts })}
        holdingRepository={holdingRepository}
        incomeRepository={createMockIncomeSourceRepository()}
      />,
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Holdings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add Security' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cash' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add Row' }));

    expect(searchSecurities).not.toHaveBeenCalled();
    expect(createHolding).toHaveBeenCalledWith({
      security: {
        symbol: 'CASH', name: 'Cash', exchange: 'Cash', assetType: 'Cash', currency: 'USD', price: 1,
      },
      accountPositions: [{ accountId: 'acc-taxable-brokerage', quantity: 0, costBasis: null }],
    });
    expect(await screen.findByRole('cell', { name: /^Cash/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View CASH security details' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit CASH payments' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update CASH dividends' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update CASH holding' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('CASH quantity for Fidelity Taxable Brokerage')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove CASH holding' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '$1.00' })).toBeInTheDocument();
    expect(screen.queryByLabelText('CASH price')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Update all holdings' }));
    expect(refreshHoldingSecurityDetails).not.toHaveBeenCalled();
    expect(refreshHoldingDividends).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Add Security' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cash' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add Row' }));
    expect(screen.getAllByRole('cell', { name: 'CASH' })).toHaveLength(1);
  });

  it('allows a positive manual price in the holdings table and saves it', async () => {
    const holdingRepository = createMockHoldingRepository();
    const updateHoldingsBatch = vi.spyOn(holdingRepository, 'updateHoldingsBatch');
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
    await userEvent.click(screen.getByRole('button', { name: 'Add Row' }));

    const priceInput = screen.getByLabelText('VTI price');
    await userEvent.click(priceInput);
    await userEvent.clear(priceInput);
    await userEvent.type(priceInput, '325.25');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await screen.findByText('Holdings saved.');
    expect(updateHoldingsBatch).toHaveBeenCalledTimes(1);
    expect(updateHoldingsBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        id: expect.any(String),
        draft: expect.objectContaining({ security: expect.objectContaining({ price: 325.25 }) }),
      }),
    ]);
  });
  it('allows a manual ticker when security search is unavailable', async () => {
    const holdingRepository = createMockHoldingRepository();
    vi.spyOn(holdingRepository, 'searchSecurities').mockRejectedValue(new Error('Unavailable'));
    render(
      <InvestingPage
        accountRepository={createMockAccountRepository({ initialAccounts: investmentAccounts })}
        holdingRepository={holdingRepository}
        incomeRepository={createMockIncomeSourceRepository()}
      />,
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Holdings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add Security' }));
    await userEvent.type(screen.getByLabelText('Security'), 'schd');

    expect(
      await screen.findByText(
        'Search is unavailable. You can add a ticker manually.',
        {},
        { timeout: 3000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Row' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Add Row' }));
    expect(await screen.findByRole('cell', { name: 'SCHD' })).toBeInTheDocument();
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
        id: 'holding-cash',
        security: {
          symbol: 'CASH', name: 'Cash', exchange: 'Cash', assetType: 'Cash', currency: 'USD', price: 1,
        },
        accountPositions: [{ accountId: 'acc-taxable-brokerage', quantity: 500, costBasis: null }],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'holding-vti',
        security: {
          symbol: 'VTI',
          name: 'Vanguard Total Stock Market ETF',
          exchange: 'NYSE Arca',
          assetType: 'ETF',
          currency: 'USD',
          dividendCurrentYear: 1.2,
          dividendStatus: 'manual',
          payoutDetails: [
            { exDividendDate: '2026-07-01', paymentDate: '2026-07-05', amount: 0.31, source: 'user', mode: 'manual' },
          ],
          manualPayoutDetails: [
            { exDividendDate: '2026-07-01', paymentDate: '2026-07-05', amount: 0.31, source: 'user', mode: 'manual' },
          ],
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
    const confirm = vi.spyOn(window, 'confirm');
    confirm.mockClear();
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
      updateHoldingsBatch: vi.fn(),
      deleteHolding: vi.fn(),
      refreshHoldingSecurityDetails,
      refreshHoldingDividends: vi.fn(),
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

    vi.useFakeTimers();
    try {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Update all holdings' }));
        await Promise.resolve();
      });

      expect(refreshHoldingSecurityDetails).toHaveBeenCalledTimes(1);
      expect(refreshHoldingSecurityDetails).toHaveBeenNthCalledWith(1, 'holding-vti');
      expect(confirm).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2999);
      });
      expect(refreshHoldingSecurityDetails).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(screen.getByText('Holdings were updated.')).toBeInTheDocument();
      expect(refreshHoldingSecurityDetails).toHaveBeenCalledTimes(2);
      expect(refreshHoldingSecurityDetails).toHaveBeenNthCalledWith(2, 'holding-schd');
    } finally {
      vi.useRealTimers();
    }
  }, 10000);

  it('summarizes investment values, sorts holdings by asset type then name, and supports quantity-grid navigation', async () => {
    const accounts: Account[] = [
      investmentAccounts[0],
      { ...investmentAccounts[0], id: 'acc-401k', name: 'Fidelity 401k', investmentAccountType: '401k' },
      { ...investmentAccounts[0], id: 'acc-hsa', name: 'Fidelity HSA', investmentAccountType: 'HSA' },
    ];
    const holdings: Holding[] = [
      {
        id: 'holding-zebra',
        security: { symbol: 'ZBRA', name: 'Zebra Income', exchange: 'NYSE', assetType: 'Equity', currency: 'USD', price: 100 },
        accountPositions: [
          { accountId: 'acc-taxable-brokerage', quantity: 2, costBasis: null },
          { accountId: 'acc-401k', quantity: 1, costBasis: null },
          { accountId: 'acc-hsa', quantity: 1, costBasis: null },
        ],
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'holding-alpha',
        security: { symbol: 'ALPH', name: 'Alpha Fund', exchange: 'NYSE', assetType: 'ETF', currency: 'USD', price: 50 },
        accountPositions: [
          { accountId: 'acc-taxable-brokerage', quantity: 1, costBasis: null },
          { accountId: 'acc-401k', quantity: 2, costBasis: null },
          { accountId: 'acc-hsa', quantity: 3, costBasis: null },
        ],
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const holdingRepository: HoldingRepository = {
      searchSecurities: vi.fn(), listHoldings: vi.fn(async () => holdings), createHolding: vi.fn(),
      updateHolding: vi.fn(), updateHoldingsBatch: vi.fn(), deleteHolding: vi.fn(), refreshHoldingSecurityDetails: vi.fn(),
      refreshHoldingDividends: vi.fn(), refreshHeldSecurityDetails: vi.fn(), updateManualPayoutDetails: vi.fn(),
    };

    render(<InvestingPage accountRepository={createMockAccountRepository({ initialAccounts: accounts })} holdingRepository={holdingRepository} incomeRepository={createMockIncomeSourceRepository()} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Holdings' }));

    expect(await screen.findByText('Total investments')).toBeInTheDocument();
    expect(screen.getByText('Taxable')).toBeInTheDocument();
    expect(screen.getByText('Retirement')).toBeInTheDocument();
    expect(screen.getByText('HSA')).toBeInTheDocument();
    expect(screen.getByText('$700.00')).toBeInTheDocument();
    expect(screen.getAllByText('$250.00')).toHaveLength(2);
    expect(screen.getByText('$200.00')).toBeInTheDocument();

    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Zebra Income');
    expect(rows[2]).toHaveTextContent('Alpha Fund');

    const alphaTaxable = screen.getByLabelText('ALPH quantity for Fidelity Taxable Brokerage');
    const alphaRetirement = screen.getByLabelText('ALPH quantity for Fidelity 401k');
    const zebraRetirement = screen.getByLabelText('ZBRA quantity for Fidelity 401k');
    const alphaTaxableCell = alphaTaxable.closest('td')!;
    const alphaRetirementCell = alphaRetirement.closest('td')!;
    const zebraRetirementCell = zebraRetirement.closest('td')!;
    alphaTaxableCell.focus();
    fireEvent.keyDown(alphaTaxableCell, { key: 'ArrowRight' });
    await waitFor(() => expect(alphaRetirementCell).toHaveFocus());
    fireEvent.keyDown(alphaRetirementCell, { key: 'ArrowUp' });
    await waitFor(() => expect(zebraRetirementCell).toHaveFocus());
  });

  it('filters holdings to a selected account and restores all holdings', async () => {
    const user = userEvent.setup();
    const retirementAccount = { ...investmentAccounts[0], id: 'acc-401k', name: 'Fidelity 401k', investmentAccountType: '401k' as const };
    const holdings: Holding[] = [
      {
        id: 'holding-taxable',
        security: { symbol: 'TAX', name: 'Taxable Security', exchange: 'NYSE', assetType: 'ETF', currency: 'USD', price: 100 },
        accountPositions: [{ accountId: 'acc-taxable-brokerage', quantity: 2, costBasis: null }],
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'holding-retirement',
        security: { symbol: 'RET', name: 'Retirement Security', exchange: 'NYSE', assetType: 'Equity', currency: 'USD', price: 100 },
        accountPositions: [{ accountId: 'acc-401k', quantity: 3, costBasis: null }],
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'holding-shared',
        security: { symbol: 'SHARED', name: 'Shared Security', exchange: 'NYSE', assetType: 'Equity', currency: 'USD', price: 25 },
        accountPositions: [
          { accountId: 'acc-taxable-brokerage', quantity: 2, costBasis: null },
          { accountId: 'acc-401k', quantity: 4, costBasis: null },
        ],
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const holdingRepository = { ...createMockHoldingRepository(), listHoldings: async () => holdings };

    render(<InvestingPage accountRepository={createMockAccountRepository({ initialAccounts: [investmentAccounts[0], retirementAccount] })} holdingRepository={holdingRepository} incomeRepository={createMockIncomeSourceRepository()} />);
    await user.click(screen.getByRole('tab', { name: 'Holdings' }));

    expect(await screen.findByText('Taxable Security')).toBeInTheDocument();
    expect(screen.getByText('Retirement Security')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filter holdings by account'), 'acc-401k');
    expect(await screen.findByText('Retirement Security')).toBeInTheDocument();
    expect(screen.getByText('Shared Security')).toBeInTheDocument();
    expect(screen.queryByText('Taxable Security')).not.toBeInTheDocument();
    expect(screen.getByText('Viewing holdings in Fidelity 401k.')).toBeInTheDocument();
    expect(screen.getByText('Fidelity 401k total')).toBeInTheDocument();
    expect(screen.getByText('$400.00')).toBeInTheDocument();
    expect(screen.getByLabelText('SHARED quantity for Fidelity 401k')).toBeInTheDocument();
    expect(screen.queryByLabelText('SHARED quantity for Fidelity Taxable Brokerage')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show all accounts' }));
    expect(await screen.findByText('Taxable Security')).toBeInTheDocument();
    expect(screen.getByText('Retirement Security')).toBeInTheDocument();
  });
  it('refreshes researched distributions from Holdings and displays all three Income years', async () => {
    vi.setSystemTime(new Date('2026-10-19T12:00:00'));
    const repository = createMockHoldingRepository();
    const security = (await repository.searchSecurities('vti'))[0];
    await repository.createHolding({ security, accountPositions: [{ accountId: 'acc-taxable-brokerage', quantity: 10 }] });
    const refresh = vi.spyOn(repository, 'refreshHoldingDividends');
    render(<InvestingPage accountRepository={createMockAccountRepository({ initialAccounts: investmentAccounts })} holdingRepository={repository} incomeRepository={createMockIncomeSourceRepository()} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Holdings' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Update VTI dividends' }));
    expect(await screen.findByText('VTI dividends were updated with stub data.')).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('tab', { name: 'Passive Income' }));
    const year = await screen.findByRole('combobox', { name: 'Distribution year' });
    expect(year).toHaveValue('2026');
    expect(screen.getByRole('button', { name: /Nov, 1 payment, \$4.15, announced/ })).toBeInTheDocument();
    await userEvent.selectOptions(year, '2025');
    expect(screen.getByRole('button', { name: /Feb, 1 payment, \$3.80, actual/ })).toBeInTheDocument();
    await userEvent.selectOptions(year, '2027');
    const projected = screen.getByRole('button', { name: /Feb, 1 payment, \$3.98, projected/ });
    await userEvent.click(projected);
    expect(screen.getByText('Projected · Income')).toBeInTheDocument();
    expect(screen.getByText(/Method: seasonal_median_v1/)).toBeInTheDocument();
    expect(screen.queryByText(/% growth estimate/)).not.toBeInTheDocument();
  });

  it('keeps future manual entries announced and never invents near-term payments from legacy history', async () => {
    vi.setSystemTime(new Date('2025-01-15T12:00:00'));
    const repository = createMockHoldingRepository();
    const holding: Holding = {
      id: 'holding-test',
      security: { symbol: 'TEST', name: 'Test Security', exchange: 'NASDAQ', assetType: 'Equity', currency: 'USD', dividendGrowthRate: 0.1,
        payoutDetails: [
          { exDividendDate: '2024-02-29', amount: 1, mode: 'manual' },
          { exDividendDate: '2025-09-15', amount: 2, mode: 'manual' },
          { exDividendDate: '2026-08-20', amount: 4, mode: 'manual' },
        ],
      },
      accountPositions: [{ accountId: 'acc-taxable-brokerage', quantity: 10 }],
      createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
    };
    vi.spyOn(repository, 'listHoldings').mockResolvedValue([holding]);
    render(<InvestingPage accountRepository={createMockAccountRepository({ initialAccounts: investmentAccounts })} holdingRepository={repository} incomeRepository={createMockIncomeSourceRepository()} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Passive Income' }));
    const year = await screen.findByRole('combobox', { name: 'Distribution year' });
    expect(screen.getByRole('button', { name: /Feb, 0 payments/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sep, 1 payment, \$20.00, announced/ })).toBeInTheDocument();
    await userEvent.selectOptions(year, '2026');
    expect(screen.getByRole('button', { name: /Aug, 1 payment, \$40.00, announced/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Feb, 0 payments/ })).toBeInTheDocument();
    await userEvent.selectOptions(year, '2024');
    await userEvent.click(screen.getByRole('button', { name: /Feb, 1 payment, \$10.00, actual/ }));
    expect(screen.getByText('2024-02-29')).toBeInTheDocument();
    expect(screen.getByText('User-entered')).toBeInTheDocument();
  });
});
