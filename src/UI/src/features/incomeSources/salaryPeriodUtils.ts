import type { IncomePeriod, IncomeSource } from '../../domain/incomeSource';

const openEndedDate = '9999-12-31';

export const calculateYearlyNetAmount = (period: IncomePeriod) =>
  period.yearlyGrossAmount * (period.netPercentage / 100);

export const calculateMonthlyAmount = (yearlyAmount: number) => yearlyAmount / 12;

export const sortPeriods = (periods: IncomePeriod[]) =>
  [...periods].sort((left, right) => left.startDate.localeCompare(right.startDate));

export const findCurrentPeriod = (
  source: IncomeSource,
  currentDate = new Date(),
) => {
  const today = currentDate.toISOString().slice(0, 10);
  return sortPeriods(source.periods).find((period) => {
    const endDate = period.endDate ?? openEndedDate;
    return period.startDate <= today && today <= endDate;
  });
};

export const findLatestPeriod = (source: IncomeSource) =>
  sortPeriods(source.periods)[source.periods.length - 1];

export const findDisplayPeriod = (source: IncomeSource) =>
  findCurrentPeriod(source) ?? findLatestPeriod(source);
