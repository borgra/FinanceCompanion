import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-01-15T12:00:00'));
  });

  afterEach(() => vi.useRealTimers());
  it('uses shared money cells to fill principal and extra-principal overrides down the schedule', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const putMortgageSchedule = vi.fn().mockResolvedValue({ mortgageSchedule: initial });

    render(<MortgageSchedulePanel initial={initial} repository={{ putMortgageSchedule }} onSaved={vi.fn()} />);

    const principal = screen.getByLabelText('Principal Jan 2026');
    await user.click(principal);
    await user.clear(principal);
    await user.type(principal, '125');
    expect(screen.getByLabelText('Principal Feb 2026')).toHaveValue('$125.00');
    const februaryPrincipal = screen.getByLabelText('Principal Feb 2026');
    await user.click(februaryPrincipal);
    await user.clear(februaryPrincipal);
    await user.type(februaryPrincipal, '140');
    const extraPrincipal = screen.getByLabelText('Extra principal Jan 2026');
    await user.click(extraPrincipal);
    await user.clear(extraPrincipal);
    await user.type(extraPrincipal, '25');
    expect(screen.getByLabelText('Extra principal Feb 2026')).toHaveValue('$25.00');
    await user.click(screen.getByRole('button', { name: /save mortgage schedule/i }));

    expect(putMortgageSchedule).toHaveBeenCalledTimes(1);
    expect(putMortgageSchedule).toHaveBeenCalledWith(expect.objectContaining({
      principalOverrides: { '2026-01:1': 140 },
      extraPrincipalOverrides: { '2026-01:0': 25 },
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
  });

  it('shows the current month and six calendar months on either side when payments are compacted', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { container } = render(
      <MortgageSchedulePanel
        initial={{ ...initial, scheduleStartMonth: '2025-03' }}
        repository={{ putMortgageSchedule: vi.fn() }}
        onSaved={vi.fn()}
      />,
    );

    expect(container.querySelectorAll('tbody tr')).toHaveLength(13);
    expect(screen.getByLabelText('Principal Jul 2025')).toBeInTheDocument();
    expect(screen.getByLabelText('Principal Jul 2026')).toBeInTheDocument();
    expect(screen.queryByLabelText('Principal Jun 2025')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Principal Aug 2026')).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Jan 2026/ })).toHaveAttribute('aria-current', 'date');

    await user.click(screen.getByRole('checkbox', { name: /show all payments/i }));
    expect(container.querySelectorAll('tbody tr')).toHaveLength(50);
    expect(screen.getByLabelText('Principal Mar 2025')).toBeInTheDocument();
  });
});
