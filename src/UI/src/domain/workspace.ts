import type { Account } from './account';
import type { BudgetCategoryWithSubCategories } from './budget';
import type { Holding } from './holding';
import type { IncomeSource } from './incomeSource';
import type { NetWorth } from './netWorth';
import type { RetirementPlan } from './retirementPlan';

export type Workspace = {
  schemaVersion: number;
  incomeSources?: IncomeSource[];
  budgetCategories?: BudgetCategoryWithSubCategories[];
  accounts?: Account[];
  holdings?: Holding[];
  netWorth?: NetWorth | null;
  retirementPlan?: RetirementPlan | null;
};
