import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createMockAccountRepository } from '../domain/accountRepository';
import { createMockBudgetRepository } from '../domain/budgetRepository';
import { createMockHoldingRepository } from '../domain/holdingRepository';
import { createMockIncomeSourceRepository } from '../domain/incomeSourceRepository';
import { LandingPage } from './LandingPage';

describe('LandingPage', () => {
  it('shows the Net Worth top-level tab', async () => {
    render(
      <LandingPage
        repository={createMockIncomeSourceRepository()}
        budgetRepository={createMockBudgetRepository()}
        accountRepository={createMockAccountRepository()}
        holdingRepository={createMockHoldingRepository()}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Net Worth' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Net Worth' }));

    expect(await screen.findByRole('heading', { name: 'Net Worth' })).toBeInTheDocument();
  });
});
