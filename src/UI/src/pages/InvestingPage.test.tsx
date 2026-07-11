import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Account } from '../domain/account';
import { createMockAccountRepository } from '../domain/accountRepository';
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

    await userEvent.type(
      screen.getByLabelText('VTI quantity for Fidelity Taxable Brokerage'),
      '12.5',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Holdings saved.')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Security' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Ticker' })).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Fidelity Taxabl...' }),
    ).toHaveClass('excel-col-editable-header');
    expect(screen.getByRole('cell', { name: /^Vanguard Total Stock Market ETF/ })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'VTI' })).toBeInTheDocument();
    expect(screen.getByLabelText('VTI quantity for Fidelity Taxable Brokerage')).toHaveValue(
      '12.5',
    );
    expect(screen.getByRole('cell', { name: '$3,937.50' })).toBeInTheDocument();
    expect(
      await screen.findByText(/Last payout \$0.45 on 2026-06-28/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Est\. annual \$3.72/)).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'P/E' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'SMA200' })).not.toBeInTheDocument();
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

  it('shows passive income schedule and five year projection from holdings', async () => {
    const holdingRepository = createMockHoldingRepository();
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
    expect(screen.getByText('Estimated annual income')).toBeInTheDocument();
    expect(screen.getByText('$46.50')).toBeInTheDocument();
    expect(screen.getByText('2026 Payment Schedule')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '2026-07-02' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '$5.63' })).toBeInTheDocument();
    expect(screen.getByText('5 Year Income Projection')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '2027' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '$48.73' })).toBeInTheDocument();
  });
});
