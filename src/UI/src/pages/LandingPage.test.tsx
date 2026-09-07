import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createMockAccountRepository } from '../domain/accountRepository';
import { createMockBudgetRepository } from '../domain/budgetRepository';
import { createMockHoldingRepository } from '../domain/holdingRepository';
import { createMockIncomeSourceRepository } from '../domain/incomeSourceRepository';
import { createMockNetWorthRepository } from '../domain/netWorthRepository';
import { LandingPage } from './LandingPage';

describe('LandingPage', () => {
  it('shows the Net Worth top-level tab', async () => {
    render(
      <LandingPage
        repository={createMockIncomeSourceRepository()}
        budgetRepository={createMockBudgetRepository()}
        accountRepository={createMockAccountRepository()}
        holdingRepository={createMockHoldingRepository()}
        netWorthRepository={createMockNetWorthRepository()}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Net Worth' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Net Worth' }));

    expect(await screen.findByRole('heading', { name: 'Net Worth' })).toBeInTheDocument();
  });

  it('groups Configuration into keyboard-operable finance-area tabs', async () => {
    const user = userEvent.setup();
    render(
      <LandingPage
        repository={createMockIncomeSourceRepository()}
        budgetRepository={createMockBudgetRepository()}
        accountRepository={createMockAccountRepository()}
        holdingRepository={createMockHoldingRepository()}
        netWorthRepository={createMockNetWorthRepository()}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'Configuration' }));

    const configurationTabs = screen.getByRole('tablist', { name: 'Configuration areas' });
    expect(within(configurationTabs).getByRole('tab', { name: 'Budget' })).toHaveAttribute('aria-selected', 'true');
    expect(within(configurationTabs).getByRole('tab', { name: 'Banking' })).toHaveAttribute('aria-controls', 'configuration-panel-banking');

    await user.click(within(configurationTabs).getByRole('tab', { name: 'Investing' }));
    expect(screen.getByRole('heading', { name: 'Payment history' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Baseline' })).not.toBeInTheDocument();

    await user.click(within(configurationTabs).getByRole('tab', { name: 'Budget' }));
    await user.keyboard('{ArrowRight}');
    expect(within(configurationTabs).getByRole('tab', { name: 'Banking' })).toHaveAttribute('aria-selected', 'true');
  });
});

