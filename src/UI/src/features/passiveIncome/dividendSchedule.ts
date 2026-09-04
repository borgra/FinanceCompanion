import type { CorporateAction, Holding, SecurityPayoutDetails } from '../../domain/holding';

export type DividendPaymentKind = 'actual' | 'announced' | 'projected';

export type DividendPayment = {
  amount: number;
  date: string;
  growthRate: number;
  holdingName: string;
  isEstimate: boolean;
  isSplitAdjusted: boolean;
  kind: DividendPaymentKind;
  rawPerShareAmount: number;
  perShareAmount: number;
  quantity: number;
  symbol: string;
};

export type DividendMonth = {
  index: number;
  isEstimate: boolean;
  label: string;
  payments: DividendPayment[];
  total: number;
};

export const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const payoutDate = (payout: SecurityPayoutDetails) => payout.paymentDate || payout.exDividendDate;

export const normalizePayoutAmount = (
  payout: SecurityPayoutDetails,
  corporateActions: CorporateAction[] = [],
) => corporateActions
  .filter((action) => action.effectiveDate > payout.exDividendDate)
  .reduce((amount, action) => amount * action.oldShares / action.newShares, payout.amount);

export const totalQuantity = (holding: Holding) =>
  holding.accountPositions.reduce((sum, position) => sum + position.quantity, 0);

export const growthRateForHolding = (holding: Holding) => {
  const rate = holding.security.dividendGrowthRate;
  return rate == null ? 0 : rate;
};

export const hasInvalidGrowthRate = (holding: Holding) => {
  const rate = holding.security.dividendGrowthRate;
  return rate != null && (!Number.isFinite(rate) || rate < -1);
};

const paymentYear = (payment: SecurityPayoutDetails) => {
  const year = Number(payoutDate(payment).slice(0, 4));
  return Number.isInteger(year) ? year : null;
};

const monthIndex = (value: string) => {
  const index = Number(value.slice(5, 7)) - 1;
  return index >= 0 && index < 12 ? index : null;
};

const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const estimatedDate = (targetYear: number, originalDate: string) => {
  const monthDay = originalDate.slice(5, 10);
  return `${targetYear}-${monthDay === '02-29' && !isLeapYear(targetYear) ? '02-28' : monthDay}`;
};

const effectivePayoutAmount = (holding: Holding, payout: SecurityPayoutDetails) =>
  holding.security.dividendResearchAdjustmentBasis === 'current_share_basis'
    ? payout.amount
    : normalizePayoutAmount(payout, holding.security.corporateActions);

const toPayment = (
  holding: Holding,
  payout: SecurityPayoutDetails,
  kind: DividendPaymentKind,
  date = payoutDate(payout),
  perShareAmount = effectivePayoutAmount(holding, payout),
): DividendPayment => {
  const quantity = totalQuantity(holding);
  const rawPerShareAmount = payout.amount;
  return {
    amount: perShareAmount * quantity,
    date,
    growthRate: growthRateForHolding(holding),
    holdingName: holding.security.name,
    isEstimate: kind !== 'actual',
    isSplitAdjusted: perShareAmount !== rawPerShareAmount,
    kind,
    rawPerShareAmount,
    perShareAmount,
    quantity,
    symbol: holding.security.symbol,
  };
};

const paymentKind = (payout: SecurityPayoutDetails, selectedYear: number, currentYear: number, todayKey: string): DividendPaymentKind => {
  if (selectedYear < currentYear) return 'actual';
  if (payout.status === 'announced' || payoutDate(payout) > todayKey) return 'announced';
  return 'actual';
};

export const buildPaymentsForYear = (
  holdings: Holding[],
  selectedYear: number,
  currentYear: number,
  todayKey: string,
): DividendPayment[] => holdings.flatMap((holding) => {
  if (totalQuantity(holding) <= 0) return [];
  const payouts = holding.security.payoutDetails ?? [];
  const defined = payouts.filter((payout) => paymentYear(payout) === selectedYear);
  const definedPayments = defined.map((payout) =>
    toPayment(holding, payout, paymentKind(payout, selectedYear, currentYear, todayKey)));

  if (selectedYear < currentYear) return definedPayments;
  if (hasInvalidGrowthRate(holding)) return definedPayments;

  const sourceYear = selectedYear === currentYear ? currentYear - 1 : currentYear;
  const sourcePayments = selectedYear === currentYear
    ? payouts
        .filter((payout) => paymentYear(payout) === sourceYear)
        .map((payout) => toPayment(holding, payout, 'actual'))
    : buildPaymentsForYear([holding], currentYear, currentYear, todayKey);
  const growthRate = growthRateForHolding(holding);
  const projected = sourcePayments
    .map((payment) => ({
      payment,
      date: estimatedDate(selectedYear, payment.date),
    }))
    .filter(({ date }) => {
      if (selectedYear === currentYear && date <= todayKey) return false;
      const targetMonth = monthIndex(date);
      return !defined.some((payout) => monthIndex(payoutDate(payout)) === targetMonth);
    })
    .map(({ payment, date }) => ({
      ...payment,
      amount: payment.perShareAmount * (1 + growthRate) * payment.quantity,
      date,
      growthRate,
      isEstimate: true,
      kind: 'projected' as const,
      perShareAmount: payment.perShareAmount * (1 + growthRate),
    }));

  return [...definedPayments, ...projected];
});

export const buildMonthlyIncome = (
  holdings: Holding[],
  selectedYear: number,
  currentYear: number,
  todayKey: string,
): DividendMonth[] => {
  const payments = buildPaymentsForYear(holdings, selectedYear, currentYear, todayKey);
  return monthLabels.map((label, index) => {
    const monthPayments = payments
      .filter((payment) => monthIndex(payment.date) === index)
      .sort((left, right) => left.date.localeCompare(right.date) || left.symbol.localeCompare(right.symbol));
    return {
      index,
      isEstimate: monthPayments.some((payment) => payment.isEstimate),
      label,
      payments: monthPayments,
      total: monthPayments.reduce((sum, payment) => sum + payment.amount, 0),
    };
  });
};
