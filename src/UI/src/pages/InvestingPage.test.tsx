import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createMockAccountRepository } from '../domain/accountRepository';
import { createMockIncomeSourceRepository } from '../domain/incomeSourceRepository';
import { InvestingPage } from './InvestingPage';

describe('InvestingPage', () => {
  it('shows investing subsections and switches panels', async () => {
    render(
      <InvestingPage
        accountRepository={createMockAccountRepository()}
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
});
