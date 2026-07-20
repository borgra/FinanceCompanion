import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MortgageSchedule } from '../domain/netWorth';
import { MortgageSchedulePanel } from './MortgageSchedulePanel';

const initial: MortgageSchedule = {
  houseValue: 800000,
  startingOutstandingMortgage: 5000,
  annualInterestRate: 0,
  monthlyPrincipalPayment: 100,
  monthlyAdditionalPrincipalPayment: 0,
  scheduleStartMonth: '2026-01',
};

describe('MortgageSchedulePanel', () => {
  it('uses shared money cells to fill principal and extra-principal overrides down the schedule', async () => {
    const user = userEvent.setup();
    const putMortgageSchedule = vi.fn().mockResolvedValue({ mortgageSchedule: initial });

    render(<MortgageSchedulePanel initial={initial} repository={{ putMortgageSchedule }} onSaved={vi.fn()} />);

    const principal = screen.getByLabelText('Principal Jan 2026');
    await user.click(principal);
    await user.clear(principal);
    await user.type(principal, '125');
    await user.click(screen.getByRole('button', { name: /auto-populate principal from jan 2026 down/i }));

    const extraPrincipal = screen.getByLabelText('Extra principal Jan 2026');
    await user.click(extraPrincipal);
    await user.clear(extraPrincipal);
    await user.type(extraPrincipal, '25');
    await user.click(screen.getByRole('button', { name: /auto-populate extra principal from jan 2026 down/i }));

    await user.click(screen.getByRole('button', { name: /save mortgage schedule/i }));

    await waitFor(() => expect(putMortgageSchedule).toHaveBeenCalledTimes(1));
    expect(putMortgageSchedule).toHaveBeenCalledWith(expect.objectContaining({
      principalOverrides: expect.objectContaining({ '2026-01:0': 125, '2026-01:1': 125 }),
      extraPrincipalOverrides: expect.objectContaining({ '2026-01:0': 25, '2026-01:1': 25 }),
    }));
  });

  it('increases the calculated principal payment as interest falls', () => {
    render(
      <MortgageSchedulePanel
        initial={{
          ...initial,
          startingOutstandingMortgage: 120000,
          annualInterestRate: 0.06,
          monthlyPrincipalPayment: 500,
        }}
        repository={{ putMortgageSchedule: vi.fn() }}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Principal Jan 2026')).toHaveValue('$500.00');
    expect(screen.getByLabelText('Principal Feb 2026')).toHaveValue('$502.50');
  });});
