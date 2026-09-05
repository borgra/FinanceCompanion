import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createMockHoldingRepository } from '../domain/holdingRepository';
import { createMockIncomeSourceRepository } from '../domain/incomeSourceRepository';
import { SettingsConfigurationPanel } from './SettingsConfigurationPanel';

describe('SettingsConfigurationPanel', () => {
  it('loads and explicitly saves the persisted beginning net worth baseline', async () => {
    const put = vi.fn(async (beginningNetWorth: number) => ({ beginningNetWorth, updatedAt: '2026-01-01T00:00:00Z' }));
    render(
      <SettingsConfigurationPanel
        repository={createMockIncomeSourceRepository()}
        holdingRepository={createMockHoldingRepository()}
        netWorthRepository={{ get: async () => ({ beginningNetWorth: 15000, updatedAt: '2026-01-01T00:00:00Z' }), put }}
      />,
    );

    const input = await screen.findByRole('textbox', { name: /beginning net worth/i });
    expect(input).toHaveValue('15000');
    await userEvent.clear(input);
    await userEvent.type(input, '-25000');
    await userEvent.click(screen.getByRole('button', { name: /save beginning net worth/i }));

    expect(put).toHaveBeenCalledWith(-25000);
    expect(await screen.findByText('Beginning net worth saved.')).toBeInTheDocument();
  });
});


  it('explicitly saves mortgage-tab visibility', async () => {
    const user = userEvent.setup();
    const putConfiguration = vi.fn().mockResolvedValue({ beginningNetWorth: 100000, trackMortgageInNetWorth: true, netWorthGoal: 0, updatedAt: '2026-01-01T00:00:00Z' });
    render(<SettingsConfigurationPanel repository={createMockIncomeSourceRepository()} holdingRepository={createMockHoldingRepository()} netWorthRepository={{ get: async () => ({ beginningNetWorth: 100000, trackMortgageInNetWorth: false, updatedAt: '2026-01-01T00:00:00Z' }), put: async (value) => ({ beginningNetWorth: value, updatedAt: '2026-01-01T00:00:00Z' }), putConfiguration }} />);
    const checkbox = await screen.findByRole('checkbox', { name: /track mortgage/i });
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: /save net worth configuration/i }));
    expect(putConfiguration).toHaveBeenCalledWith({ trackMortgageInNetWorth: true, netWorthGoal: 0 });
    expect(await screen.findByText('Net worth configuration saved.')).toBeInTheDocument();
  });

  it('saves a goal without attempting to persist the mortgage schedule', async () => {
    const user = userEvent.setup();
    const putConfiguration = vi.fn().mockResolvedValue({ beginningNetWorth: 100000, trackMortgageInNetWorth: false, netWorthGoal: 2000000, updatedAt: '2026-01-01T00:00:00Z' });
    const putMortgageSchedule = vi.fn().mockRejectedValue(new Error('schedule unavailable'));
    render(<SettingsConfigurationPanel repository={createMockIncomeSourceRepository()} holdingRepository={createMockHoldingRepository()} netWorthRepository={{ get: async () => ({ beginningNetWorth: 100000, trackMortgageInNetWorth: false, netWorthGoal: 0, updatedAt: '2026-01-01T00:00:00Z' }), put: async (value) => ({ beginningNetWorth: value, updatedAt: '2026-01-01T00:00:00Z' }), putConfiguration, putMortgageSchedule }} />);

    const goal = await screen.findByRole('textbox', { name: 'Net Worth Goal' });
    await user.type(goal, '2000000');
    await user.click(screen.getByRole('button', { name: /save net worth configuration/i }));

    expect(putConfiguration).toHaveBeenCalledWith({ trackMortgageInNetWorth: false, netWorthGoal: 2000000 });
    expect(putMortgageSchedule).not.toHaveBeenCalled();
    expect(goal).toHaveValue('2000000');
    expect(await screen.findByText('Net worth configuration saved.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps a submitted goal when a partial successful response omits it', async () => {
    const user = userEvent.setup();
    const putConfiguration = vi.fn().mockResolvedValue({ beginningNetWorth: 100000, trackMortgageInNetWorth: false, updatedAt: '2026-01-01T00:00:00Z' });
    render(<SettingsConfigurationPanel repository={createMockIncomeSourceRepository()} holdingRepository={createMockHoldingRepository()} netWorthRepository={{ get: async () => ({ beginningNetWorth: 100000, trackMortgageInNetWorth: false, updatedAt: '2026-01-01T00:00:00Z' }), put: async (value) => ({ beginningNetWorth: value, updatedAt: '2026-01-01T00:00:00Z' }), putConfiguration }} />);

    const goal = await screen.findByRole('textbox', { name: 'Net Worth Goal' });
    await user.type(goal, '2000000');
    await user.click(screen.getByRole('button', { name: /save net worth configuration/i }));

    expect(goal).toHaveValue('2000000');
    expect(await screen.findByText('Net worth configuration saved.')).toBeInTheDocument();
  });

  it('does not report success when the configuration response changes the submitted goal', async () => {
    const user = userEvent.setup();
    const putConfiguration = vi.fn().mockResolvedValue({ beginningNetWorth: 100000, trackMortgageInNetWorth: false, netWorthGoal: 0, updatedAt: '2026-01-01T00:00:00Z' });
    render(<SettingsConfigurationPanel repository={createMockIncomeSourceRepository()} holdingRepository={createMockHoldingRepository()} netWorthRepository={{ get: async () => ({ beginningNetWorth: 100000, trackMortgageInNetWorth: false, updatedAt: '2026-01-01T00:00:00Z' }), put: async (value) => ({ beginningNetWorth: value, updatedAt: '2026-01-01T00:00:00Z' }), putConfiguration }} />);

    const goal = await screen.findByRole('textbox', { name: 'Net Worth Goal' });
    await user.type(goal, '2000000');
    await user.click(screen.getByRole('button', { name: /save net worth configuration/i }));

    expect(goal).toHaveValue('2000000');
    expect(await screen.findByRole('alert')).toHaveTextContent('Net Worth Goal was not saved');
    expect(screen.queryByText('Net worth configuration saved.')).not.toBeInTheDocument();
  });

  it('saves mortgage assumptions through the dedicated action', async () => {
    const user = userEvent.setup();
    const putMortgageSchedule = vi.fn().mockResolvedValue({
      beginningNetWorth: 100000,
      mortgageSchedule: {
        houseValue: 900000,
        startingOutstandingMortgage: 320000,
        annualInterestRate: 0.05,
        monthlyPrincipalPayment: 981.13,
        monthlyAdditionalPrincipalPayment: 300,
        scheduleStartMonth: '2025-03',
      },
      updatedAt: '2026-01-01T00:00:00Z',
    });
    render(<SettingsConfigurationPanel repository={createMockIncomeSourceRepository()} holdingRepository={createMockHoldingRepository()} netWorthRepository={{ get: async () => ({ beginningNetWorth: 100000, mortgageSchedule: { houseValue: 800000, startingOutstandingMortgage: 320000, annualInterestRate: 0.0375, monthlyPrincipalPayment: 981.13, monthlyAdditionalPrincipalPayment: 300, scheduleStartMonth: '2025-03' }, updatedAt: '2026-01-01T00:00:00Z' }), put: async (value) => ({ beginningNetWorth: value, updatedAt: '2026-01-01T00:00:00Z' }), putMortgageSchedule }} />);

    const houseValue = await screen.findByDisplayValue('800000');
    const annualInterestRate = screen.getByDisplayValue('0.0375');
    await user.clear(houseValue);
    await user.type(houseValue, '900000');
    await user.clear(annualInterestRate);
    await user.type(annualInterestRate, '0.05');
    await user.click(screen.getByRole('button', { name: /save mortgage assumptions/i }));

    expect(putMortgageSchedule).toHaveBeenCalledWith(expect.objectContaining({
      houseValue: 900000,
      annualInterestRate: 0.05,
      startingOutstandingMortgage: 320000,
      monthlyPrincipalPayment: 981.13,
      monthlyAdditionalPrincipalPayment: 300,
      scheduleStartMonth: '2025-03',
    }));
    expect(await screen.findByText('Mortgage assumptions saved.')).toBeInTheDocument();
  });

describe('mortgage schedule deletion', () => {
  it('confirms and deletes the saved mortgage schedule', async () => {
    const user = userEvent.setup();
    const deleteMortgageSchedule = vi.fn().mockResolvedValue({ beginningNetWorth: 100000, mortgageSchedule: { houseValue: 800000, startingOutstandingMortgage: 0, annualInterestRate: 0.0375, monthlyPrincipalPayment: 0, monthlyAdditionalPrincipalPayment: 0, scheduleStartMonth: '2025-03' }, updatedAt: '2026-01-01T00:00:00Z' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<SettingsConfigurationPanel repository={createMockIncomeSourceRepository()} holdingRepository={createMockHoldingRepository()} netWorthRepository={{ get: async () => ({ beginningNetWorth: 100000, mortgageSchedule: { houseValue: 800000, startingOutstandingMortgage: 320000, annualInterestRate: 0.0375, monthlyPrincipalPayment: 981.13, monthlyAdditionalPrincipalPayment: 300, scheduleStartMonth: '2025-03' }, updatedAt: '2026-01-01T00:00:00Z' }), put: async (value) => ({ beginningNetWorth: value, updatedAt: '2026-01-01T00:00:00Z' }), deleteMortgageSchedule }} />);
    await user.click(await screen.findByRole('button', { name: /delete mortgage schedule/i }));
    expect(deleteMortgageSchedule).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Mortgage schedule cleared. Mortgage configuration was kept.')).toBeInTheDocument();
  });

  it('loads and saves a whole-number net worth goal, with blank resetting it to zero', async () => {
    const user = userEvent.setup();
    const putConfiguration = vi.fn().mockResolvedValue({ beginningNetWorth: 100000, trackMortgageInNetWorth: false, netWorthGoal: 2000000, updatedAt: '2026-01-01T00:00:00Z' });
    render(<SettingsConfigurationPanel repository={createMockIncomeSourceRepository()} holdingRepository={createMockHoldingRepository()} netWorthRepository={{ get: async () => ({ beginningNetWorth: 100000, trackMortgageInNetWorth: false, netWorthGoal: 1500000, updatedAt: '2026-01-01T00:00:00Z' }), put: async (value) => ({ beginningNetWorth: value, updatedAt: '2026-01-01T00:00:00Z' }), putConfiguration }} />);

    const goal = await screen.findByRole('textbox', { name: 'Net Worth Goal' });
    expect(goal).toHaveValue('1500000');
    await user.clear(goal);
    await user.type(goal, '2000000');
    await user.click(screen.getByRole('button', { name: /save net worth configuration/i }));
    expect(putConfiguration).toHaveBeenLastCalledWith({ trackMortgageInNetWorth: false, netWorthGoal: 2000000 });

    await user.clear(goal);
    await user.click(screen.getByRole('button', { name: /save net worth configuration/i }));
    expect(putConfiguration).toHaveBeenLastCalledWith({ trackMortgageInNetWorth: false, netWorthGoal: 0 });
  });
});
