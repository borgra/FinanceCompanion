export type ContributionPlan = {
  monthlyAmount: number;
  annualIncreasePercent: number;
  endAge: number;
};

export type ExpenseChange = {
  age: number;
  percentChange: number;
  label?: string | null;
};

export type SocialSecurityPlan = {
  enabled: boolean;
  claimAge: number;
  monthlyBenefit: number;
  annualColaPercent: number;
};

export type RetirementPlan = {
  id: string;
  name: string;
  currentAge: number;
  retirementAge: number;
  longevityAge: number;
  annualRoiPercent: number | null;
  annualRetirementExpense: number;
  taxableContribution: ContributionPlan;
  retirementContribution: ContributionPlan;
  expenseChanges: ExpenseChange[];
  socialSecurity: SocialSecurityPlan;
  includeHsaInRetirement: boolean;
  updatedAt: string;
};

export const createDefaultRetirementPlan = (): RetirementPlan => ({
  id: 'base-plan',
  name: 'Base Plan',
  currentAge: 41,
  retirementAge: 55,
  longevityAge: 105,
  annualRoiPercent: null,
  annualRetirementExpense: 0,
  taxableContribution: { monthlyAmount: 0, annualIncreasePercent: 0, endAge: 65 },
  retirementContribution: { monthlyAmount: 0, annualIncreasePercent: 0, endAge: 65 },
  expenseChanges: [],
  socialSecurity: { enabled: false, claimAge: 67, monthlyBenefit: 0, annualColaPercent: 0 },
  includeHsaInRetirement: false,
  updatedAt: '',
});
