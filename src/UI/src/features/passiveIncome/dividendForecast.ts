import type { Holding } from '../../domain/holding';
import { buildPaymentsForYear, growthRateForHolding, hasInvalidGrowthRate, totalQuantity } from './dividendSchedule';

export type AnnualDividendForecast = { year: number; amount: number };

export const buildAnnualDividendForecast = (
  holdings: Holding[],
  currentYear: number,
  todayKey: string,
  targetYear: number,
): AnnualDividendForecast[] => {
  if (!Number.isInteger(targetYear) || targetYear < currentYear) return [];
  if (holdings.some(hasInvalidGrowthRate)) return [];
  const bases = holdings
    .filter((holding) => totalQuantity(holding) > 0)
    .map((holding) => ({
      amount: buildPaymentsForYear([holding], currentYear, currentYear, todayKey)
        .reduce((sum, payment) => sum + payment.amount, 0),
      growthRate: growthRateForHolding(holding),
    }));

  return Array.from({ length: targetYear - currentYear + 1 }, (_, index) => {
    const amount = bases.reduce(
      (sum, base) => sum + base.amount * Math.pow(1 + base.growthRate, index),
      0,
    );
    return { year: currentYear + index, amount: Number.isFinite(amount) ? amount : 0 };
  });
};
