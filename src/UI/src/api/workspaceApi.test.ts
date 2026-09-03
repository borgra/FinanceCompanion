import { beforeEach, describe, expect, it, vi } from 'vitest';
import { beginningNetWorthStorageKey, readBeginningNetWorth } from '../domain/netWorthConfiguration';
import type { HttpClient } from './httpClient';
import { loadWorkspace } from './workspaceApi';

describe('workspace API', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads the aggregate endpoint and normalizes retirement compatibility fields', async () => {
    const get = vi.fn().mockResolvedValue({
      schemaVersion: 1,
      incomeSources: [],
      budgetCategories: [],
      accounts: [],
      holdings: [],
      netWorth: { beginningNetWorth: 100, investmentSnapshots: {}, updatedAt: '2026-01-01' },
      retirementPlan: {
        id: 'base-plan',
        name: 'Base Plan',
        withdrawalRatePercent: 4,
        withdrawalMode: 'meet_expense',
      },
    });

    const loaded = await loadWorkspace({ get } as unknown as HttpClient);

    expect(get).toHaveBeenCalledWith('/workspace');
    expect(loaded.retirementPlan).not.toHaveProperty('withdrawalRatePercent');
    expect(loaded.retirementPlan).not.toHaveProperty('withdrawalMode');
  });

  it('does not write when aggregate net worth and legacy storage are both empty', async () => {
    const get = vi.fn().mockResolvedValue({
      schemaVersion: 1,
      incomeSources: [],
      budgetCategories: [],
      accounts: [],
      holdings: [],
      netWorth: null,
      retirementPlan: null,
    });
    const put = vi.fn();

    const loaded = await loadWorkspace({ get, put } as unknown as HttpClient);

    expect(put).not.toHaveBeenCalled();
    expect(loaded.netWorth).toBeNull();
  });

  it('migrates a legacy value once and clears storage after the write succeeds', async () => {
    localStorage.setItem(beginningNetWorthStorageKey, '123456');
    const get = vi.fn().mockResolvedValue({
      schemaVersion: 1,
      incomeSources: [],
      budgetCategories: [],
      accounts: [],
      holdings: [],
      netWorth: null,
      retirementPlan: null,
    });
    const saved = {
      beginningNetWorth: 123456,
      investmentSnapshots: {},
      monthlySnapshots: {},
      trackMortgageInNetWorth: false,
      mortgageSchedule: null,
      updatedAt: '2026-09-03T00:00:00Z',
    };
    const put = vi.fn().mockResolvedValue(saved);

    const loaded = await loadWorkspace({ get, put } as unknown as HttpClient);

    expect(put).toHaveBeenCalledWith('/net-worth', { beginningNetWorth: 123456 });
    expect(loaded.netWorth).toEqual(saved);
    expect(readBeginningNetWorth()).toBeUndefined();
  });

  it('preserves the legacy value when migration fails', async () => {
    localStorage.setItem(beginningNetWorthStorageKey, '789');
    const get = vi.fn().mockResolvedValue({
      schemaVersion: 1,
      incomeSources: [],
      budgetCategories: [],
      accounts: [],
      holdings: [],
      netWorth: null,
      retirementPlan: null,
    });
    const put = vi.fn().mockRejectedValue(new Error('save failed'));

    await expect(loadWorkspace({ get, put } as unknown as HttpClient)).rejects.toThrow('save failed');

    expect(readBeginningNetWorth()).toBe(789);
  });
});
