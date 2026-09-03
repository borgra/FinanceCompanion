import { describe, expect, it, vi } from 'vitest';
import type { IncomeSource } from '../domain/incomeSource';
import type { Workspace } from '../domain/workspace';
import type { HttpClient } from './httpClient';
import { createWorkspaceSession } from './workspaceSession';

const source: IncomeSource = {
  id: 'income-1',
  name: 'Salary',
  type: 'Salary',
  cadence: 'Bi-weekly',
  periods: [],
  status: 'Active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const workspace = (): Workspace => ({
  schemaVersion: 1,
  incomeSources: [source],
  budgetCategories: [],
  accounts: [],
  holdings: [],
  netWorth: null,
  retirementPlan: null,
});

describe('workspace session', () => {
  it('serves reads from memory and reconciles successful writes', async () => {
    const saved = { ...source, id: 'income-2', name: 'Consulting' };
    const client = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue(saved),
    } as unknown as HttpClient;
    const repositories = createWorkspaceSession(workspace(), client);

    const initial = await repositories.incomeSourceRepository.listIncomeSources();
    initial[0].name = 'locally mutated';
    await repositories.incomeSourceRepository.createIncomeSource({
      name: 'Consulting',
      periods: [],
      status: 'Active',
    });
    const current = await repositories.incomeSourceRepository.listIncomeSources();

    expect(client.get).not.toHaveBeenCalled();
    expect(client.post).toHaveBeenCalledOnce();
    expect(current.map((item) => item.name)).toEqual(['Salary', 'Consulting']);
  });

  it('does not change session data when a delegated write fails', async () => {
    const client = {
      post: vi.fn().mockRejectedValue(new Error('save failed')),
    } as unknown as HttpClient;
    const repositories = createWorkspaceSession(workspace(), client);

    await expect(repositories.incomeSourceRepository.createIncomeSource({
      name: 'Consulting',
      periods: [],
      status: 'Active',
    })).rejects.toThrow('save failed');

    expect(await repositories.incomeSourceRepository.listIncomeSources()).toEqual([source]);
  });
});
