import type { RetirementPlan } from '../domain/retirementPlan';
import type { RetirementPlanRepository } from '../domain/retirementPlanRepository';
import { ApiError, type HttpClient } from './httpClient';
type RetirementPlanApiModel = RetirementPlan & {
  withdrawalRatePercent?: number;
  withdrawalMode?: 'meet_expense' | 'cap_at_target_rate';
};
const fromApi = (plan: RetirementPlanApiModel): RetirementPlan => {
  const normalized = { ...plan };
  delete normalized.withdrawalRatePercent;
  delete normalized.withdrawalMode;
  return normalized;
};
export const createRetirementPlanApiRepository = (client: HttpClient): RetirementPlanRepository => ({
  get: async () => {
    try {
      return fromApi(await client.get<RetirementPlanApiModel>('/retirement-plan'));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return undefined;
      throw error;
    }
  },
  put: async (plan) => fromApi(await client.put<RetirementPlanApiModel>('/retirement-plan', {
    ...plan,
    withdrawalRatePercent: 0,
    withdrawalMode: 'meet_expense',
  })),
});