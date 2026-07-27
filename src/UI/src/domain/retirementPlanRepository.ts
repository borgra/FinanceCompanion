import type { RetirementPlan } from './retirementPlan';

export type RetirementPlanRepository = {
  get: () => Promise<RetirementPlan | undefined>;
  put: (plan: RetirementPlan) => Promise<RetirementPlan>;
};
