import type { IncomeSourceRepository } from '../domain/incomeSourceRepository';
import type { BudgetRepository } from '../domain/budgetRepository';
import { BudgetPage } from './BudgetPage';

export type SettingsBudgetPanelProps = {
  incomeRepository: IncomeSourceRepository;
  budgetRepository: BudgetRepository;
};

export function SettingsBudgetPanel({
  incomeRepository,
  budgetRepository,
}: SettingsBudgetPanelProps) {
  return (
    <BudgetPage
      incomeRepository={incomeRepository}
      budgetRepository={budgetRepository}
    />
  );
}
