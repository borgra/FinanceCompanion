import { describe, expect, it, vi } from 'vitest';
import type { RetirementPlan } from '../domain/retirementPlan';
import { createDefaultRetirementPlan } from '../domain/retirementPlan';
import type { HttpClient } from './httpClient';
import { createRetirementPlanApiRepository } from './retirementPlanApiRepository';

const plan = (): RetirementPlan => ({
  ...createDefaultRetirementPlan(),
  annualRoiPercent: 5,
  updatedAt: '2026-07-26T12:00:00Z',
});

describe('retirement plan API repository', () => {
  it('normalizes legacy rate and cap fields out of GET responses', async () => {
    const get = vi.fn().mockResolvedValue({
      ...plan(),
      withdrawalRatePercent: 4,
      withdrawalMode: 'cap_at_target_rate',
    });
    const repository = createRetirementPlanApiRepository({ get } as unknown as HttpClient);

    const loaded = await repository.get();

    expect(get).toHaveBeenCalledWith('/retirement-plan');
    expect(loaded).toEqual(plan());
    expect(loaded).not.toHaveProperty('withdrawalRatePercent');
    expect(loaded).not.toHaveProperty('withdrawalMode');
  });

  it('adds backend compatibility values on PUT and removes them from the returned UI model', async () => {
    const put = vi.fn(async (_path: string, body: Record<string, unknown>) => ({
      ...body,
      updatedAt: '2026-07-27T12:00:00Z',
    }));
    const repository = createRetirementPlanApiRepository({ put } as unknown as HttpClient);

    const saved = await repository.put(plan());

    expect(put).toHaveBeenCalledWith('/retirement-plan', expect.objectContaining({
      annualRetirementExpense: 0,
      withdrawalRatePercent: 0,
      withdrawalMode: 'meet_expense',
    }));
    expect(saved.updatedAt).toBe('2026-07-27T12:00:00Z');
    expect(saved).not.toHaveProperty('withdrawalRatePercent');
    expect(saved).not.toHaveProperty('withdrawalMode');
  });
});