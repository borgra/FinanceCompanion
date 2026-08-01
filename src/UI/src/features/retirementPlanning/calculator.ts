import type { Account } from '../../domain/account';
import type { Holding } from '../../domain/holding';
import type { ContributionPlan, RetirementPlan } from '../../domain/retirementPlan';

export type ValuationWarning = {
  code:
    | 'missing_price'
    | 'invalid_price'
    | 'invalid_quantity'
    | 'unknown_account'
    | 'unsupported_account'
    | 'non_usd_currency';
  message: string;
};

export type ValuationSnapshot = {
  taxable: number;
  retirement: number;
  hsa: number;
  valuedAt: string | null;
  source: string;
  warnings: ValuationWarning[];
  isComplete?: boolean;
};

export type ProjectionRow = {
  year: number;
  age: number;
  startTaxable: number;
  startRetirement: number;
  taxableContribution: number;
  retirementContribution: number;
  socialSecurity: number;
  expense: number;
  taxableWithdrawal: number;
  retirementWithdrawal: number;
  totalWithdrawal: number;
  taxableGrowth: number;
  retirementGrowth: number;
  endTaxable: number;
  endRetirement: number;
  totalEnd: number;
  unmetNeed: number;
  status: 'pre_retirement' | 'funded' | 'liquidity_gap' | 'funding_shortfall';
  applicableExpenseChanges: string[];
};

export type ProjectionResult = {
  rows: ProjectionRow[];
  openingTaxable: number;
  openingRetirement: number;
  excludedHsa: number;
  firstGapAge?: number;
  firstDepletionAge?: number;
  balanceAtRetirement: number;
  firstRetirementYearNeed: number;
  valuationComplete: boolean;
};

const finite = (value: number) => Number.isFinite(value);

export function valueRetirementHoldings(accounts: Account[], holdings: Holding[]): ValuationSnapshot {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const warnings: ValuationWarning[] = [];
  const valuedDates: number[] = [];
  let taxable = 0;
  let retirement = 0;
  let hsa = 0;

  for (const holding of holdings) {
    const price = holding.security.price;
    const priced = typeof price === 'number' && finite(price) && price > 0;
    const securityCurrency = holding.security.currency.trim().toUpperCase();
    for (const position of holding.accountPositions) {
      if (position.quantity === 0) continue;
      if (!finite(position.quantity) || position.quantity < 0) {
        warnings.push({ code: 'invalid_quantity', message: `${holding.security.symbol} has an invalid quantity and was excluded.` });
        continue;
      }
      const account = accountsById.get(position.accountId);
      if (!account) {
        warnings.push({ code: 'unknown_account', message: `${holding.security.symbol} references unknown account ${position.accountId}.` });
        continue;
      }
      const type = account.type === 'Investment' ? account.investmentAccountType : undefined;
      if (!type) {
        warnings.push({ code: 'unsupported_account', message: `${holding.security.symbol} is assigned to unsupported account ${account.name}.` });
        continue;
      }
      if (securityCurrency !== 'USD') {
        warnings.push({ code: 'non_usd_currency', message: `${holding.security.symbol} in ${account.name} is denominated in ${securityCurrency || 'an unknown currency'} and was excluded because currency conversion is not supported.` });
        continue;
      }
      if (!priced) {
        warnings.push({
          code: price == null ? 'missing_price' : 'invalid_price',
          message: `${holding.security.symbol} in ${account.name} has ${price == null ? 'no saved price' : 'an invalid price'} and was excluded.`,
        });
        continue;
      }
      const detailsUpdatedAt = holding.security.detailsUpdatedAt ? Date.parse(holding.security.detailsUpdatedAt) : Number.NaN;
      if (Number.isFinite(detailsUpdatedAt)) valuedDates.push(detailsUpdatedAt);
      const value = position.quantity * price;
      if (type === 'Taxable') taxable += value;
      else if (type === '401k' || type === 'IRA') retirement += value;
      else if (type === 'HSA') hsa += value;
      else warnings.push({ code: 'unsupported_account', message: `${account.name} has an unsupported classification.` });
    }
  }

  return {
    taxable,
    retirement,
    hsa,
    valuedAt: valuedDates.length ? new Date(Math.min(...valuedDates)).toISOString() : null,
    source: 'Current holdings quantity × saved security price',
    warnings,
    isComplete: warnings.length === 0,
  };
}

export function validateRetirementPlan(plan: RetirementPlan): Record<string, string> {
  const errors: Record<string, string> = {};

  const contributionIncreases = [plan.taxableContribution.annualIncreasePercent, plan.retirementContribution.annualIncreasePercent];
  if (plan.currentAge < 18 || plan.currentAge > 100 || !Number.isInteger(plan.currentAge)) errors.currentAge = 'Enter a whole age from 18 to 100.';
  if (plan.retirementAge < plan.currentAge || plan.retirementAge > 120 || !Number.isInteger(plan.retirementAge)) errors.retirementAge = 'Retirement age must be a whole age from current age to 120.';
  if (plan.longevityAge <= plan.retirementAge || plan.longevityAge > 120 || !Number.isInteger(plan.longevityAge)) errors.longevityAge = 'Planning age must be a whole age greater than retirement age and no more than 120.';
  if (plan.annualRoiPercent === null || !finite(plan.annualRoiPercent) || plan.annualRoiPercent < -100 || plan.annualRoiPercent > 100) errors.annualRoiPercent = 'Enter an ROI from -100% to 100%.';
  if (!finite(plan.annualRetirementExpense) || plan.annualRetirementExpense < 0) errors.annualRetirementExpense = 'Annual withdrawal must be a non-negative amount.';
  if (!finite(plan.taxableContribution.monthlyAmount) || plan.taxableContribution.monthlyAmount < 0) errors.taxableContributionAmount = 'Taxable monthly contribution must be a non-negative amount.';
  if (!finite(plan.retirementContribution.monthlyAmount) || plan.retirementContribution.monthlyAmount < 0) errors.retirementContributionAmount = 'Retirement monthly contribution must be a non-negative amount.';
  if (!finite(plan.socialSecurity.monthlyBenefit) || plan.socialSecurity.monthlyBenefit < 0) errors.socialSecurityBenefit = 'Monthly Social Security benefit must be a non-negative amount.';
  if (contributionIncreases.some((value) => !finite(value) || value < 0 || value > 100)) errors.contributionIncrease = 'Contribution increases must be from 0% to 100%.';
  if ([plan.taxableContribution, plan.retirementContribution].some((item) => !Number.isInteger(item.endAge) || item.endAge < plan.currentAge || item.endAge > plan.longevityAge)) errors.contributionEndAge = 'Contribution end ages must be whole ages within the planning horizon.';
  if (!Number.isInteger(plan.socialSecurity.claimAge) || plan.socialSecurity.claimAge < 62 || plan.socialSecurity.claimAge > plan.longevityAge) errors.claimAge = 'Social Security claim age must be a whole age of 62 or later within the plan.';
  if (!finite(plan.socialSecurity.annualColaPercent) || plan.socialSecurity.annualColaPercent < 0 || plan.socialSecurity.annualColaPercent > 100) errors.socialSecurityCola = 'Social Security COLA must be from 0% to 100%.';
  if (plan.expenseChanges.length > 100 || plan.expenseChanges.some((item) => !Number.isInteger(item.age) || item.age < plan.retirementAge || item.age > plan.longevityAge || !finite(item.percentChange) || item.percentChange < -100 || item.percentChange > 100 || (item.label?.length ?? 0) > 120)) errors.expenseChanges = 'Expense changes require a whole age from retirement through planning age, a change from -100% to 100%, and a label of 120 characters or fewer.';
  if (new Set(plan.expenseChanges.map((item) => item.age)).size !== plan.expenseChanges.length) errors.expenseChanges = 'Use only one expense change per age.';
  return errors;
}

function annualContribution(
  plan: ContributionPlan,
  age: number,
  currentAge: number,
  firstYearRemainingMonths: number,
): number {
  if (age < currentAge || age > plan.endAge) return 0;
  const months = age === currentAge ? firstYearRemainingMonths : 12;
  return plan.monthlyAmount * months * (1 + plan.annualIncreasePercent / 100) ** (age - currentAge);
}

export function calculateRetirementProjection(plan: RetirementPlan, valuation: ValuationSnapshot, calculationDate = new Date()): ProjectionResult {
  if (Object.keys(validateRetirementPlan(plan)).length) throw new Error('Retirement plan is invalid.');
  let taxable = valuation.taxable;
  let retirement = valuation.retirement + (plan.includeHsaInRetirement ? valuation.hsa : 0);
  const rows: ProjectionRow[] = [];
  const roi = (plan.annualRoiPercent as number) / 100;
  const firstYearRemainingMonths = 12 - (calculationDate.getMonth() + 1);

  for (let age = plan.currentAge; age <= plan.longevityAge; age += 1) {
    const year = calculationDate.getFullYear() + age - plan.currentAge;
    const startTaxable = taxable;
    const startRetirement = retirement;
    const taxableContribution = annualContribution(plan.taxableContribution, age, plan.currentAge, firstYearRemainingMonths);
    const retirementContribution = annualContribution(plan.retirementContribution, age, plan.currentAge, firstYearRemainingMonths);
    const applicableChanges = plan.expenseChanges.filter((change) => change.age <= age).sort((a, b) => a.age - b.age);
    const expenseMultiplier = applicableChanges.reduce((value, change) => value * (1 + change.percentChange / 100), 1);
    const expense = age >= plan.retirementAge ? plan.annualRetirementExpense * expenseMultiplier : 0;
    const socialSecurity = plan.socialSecurity.enabled && age >= plan.socialSecurity.claimAge
      ? plan.socialSecurity.monthlyBenefit * 12 * (1 + plan.socialSecurity.annualColaPercent / 100) ** (age - plan.socialSecurity.claimAge)
      : 0;
    const portfolioNeed = Math.max(0, expense - socialSecurity);
    const retirementAvailable = age >= 60 ? startRetirement + retirementContribution : 0;
    const taxableWithdrawal = Math.min(portfolioNeed, startTaxable + taxableContribution);
    const retirementWithdrawal = age >= 60 ? Math.min(portfolioNeed - taxableWithdrawal, retirementAvailable) : 0;
    const totalWithdrawal = taxableWithdrawal + retirementWithdrawal;
    const unmetNeed = Math.max(0, portfolioNeed - totalWithdrawal);
    const isContributionYear = age < plan.retirementAge;
    const taxableBase = Math.max(0, startTaxable + taxableContribution - taxableWithdrawal);
    const retirementBase = Math.max(0, startRetirement + retirementContribution - retirementWithdrawal);
    const contributionYearRoi = age === plan.currentAge ? roi * firstYearRemainingMonths / 12 : roi;
    const taxableGrowth = isContributionYear ? startTaxable * contributionYearRoi : taxableBase * roi;
    const retirementGrowth = isContributionYear ? startRetirement * contributionYearRoi : retirementBase * roi;
    taxable = isContributionYear
      ? Math.max(0, startTaxable + taxableGrowth + taxableContribution)
      : Math.max(0, taxableBase + taxableGrowth);
    retirement = isContributionYear
      ? Math.max(0, startRetirement + retirementGrowth + retirementContribution)
      : Math.max(0, retirementBase + retirementGrowth);
    const status: ProjectionRow['status'] = age < plan.retirementAge
      ? 'pre_retirement'
      : unmetNeed > 0
        ? age < 60 ? 'liquidity_gap' : 'funding_shortfall'
        : 'funded';
    rows.push({
      year, age, startTaxable, startRetirement, taxableContribution, retirementContribution,
      socialSecurity, expense, taxableWithdrawal, retirementWithdrawal, totalWithdrawal,
      taxableGrowth, retirementGrowth, endTaxable: taxable,
      endRetirement: retirement, totalEnd: taxable + retirement, unmetNeed, status,
      applicableExpenseChanges: applicableChanges.map((change) => change.label || `Age ${change.age}: ${change.percentChange}%`),
    });
  }
  let hasHadAssets = valuation.taxable + valuation.retirement + (plan.includeHsaInRetirement ? valuation.hsa : 0) > 0;
  const firstDepletionAge = rows.find((row) => {
    if (row.startTaxable + row.startRetirement + row.taxableContribution + row.retirementContribution > 0) hasHadAssets = true;
    return hasHadAssets && row.totalEnd <= 0;
  })?.age;
  return {
    rows,
    openingTaxable: valuation.taxable,
    openingRetirement: valuation.retirement + (plan.includeHsaInRetirement ? valuation.hsa : 0),
    excludedHsa: plan.includeHsaInRetirement ? 0 : valuation.hsa,
    firstGapAge: rows.find((row) => row.unmetNeed > 0)?.age,
    firstDepletionAge,
    balanceAtRetirement: rows.find((row) => row.age === plan.retirementAge)?.totalEnd ?? 0,
    firstRetirementYearNeed: rows.find((row) => row.age === plan.retirementAge)?.expense ?? 0,
    valuationComplete: valuation.isComplete !== false,
  };
}
