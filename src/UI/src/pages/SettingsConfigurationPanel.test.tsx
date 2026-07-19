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
    const putConfiguration = vi.fn().mockResolvedValue({ beginningNetWorth: 100000, trackMortgageInNetWorth: true, updatedAt: '2026-01-01T00:00:00Z' });
    render(<SettingsConfigurationPanel repository={createMockIncomeSourceRepository()} holdingRepository={createMockHoldingRepository()} netWorthRepository={{ get: async () => ({ beginningNetWorth: 100000, trackMortgageInNetWorth: false, updatedAt: '2026-01-01T00:00:00Z' }), put: async (value) => ({ beginningNetWorth: value, updatedAt: '2026-01-01T00:00:00Z' }), putConfiguration }} />);
    const checkbox = await screen.findByRole('checkbox', { name: /track mortgage/i });
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: /save net worth configuration/i }));
    expect(putConfiguration).toHaveBeenCalledWith(true);
    expect(await screen.findByText('Mortgage tracking configuration saved.')).toBeInTheDocument();
  });
