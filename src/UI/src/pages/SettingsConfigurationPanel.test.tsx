import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach } from 'vitest';
import { createMockIncomeSourceRepository } from '../domain/incomeSourceRepository';
import { beginningNetWorthStorageKey } from '../domain/netWorthConfiguration';
import { SettingsConfigurationPanel } from './SettingsConfigurationPanel';

describe('SettingsConfigurationPanel', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('persists the beginning net worth baseline', async () => {
    render(<SettingsConfigurationPanel repository={createMockIncomeSourceRepository()} />);

    const input = screen.getByRole('spinbutton', { name: /beginning net worth/i });
    await userEvent.type(input, '25000');

    expect(window.localStorage.getItem(beginningNetWorthStorageKey)).toBe('25000');
  });
});
