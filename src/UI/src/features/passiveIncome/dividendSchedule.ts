import type { CorporateAction, Holding, SecurityPayoutDetails } from '../../domain/holding';

export type DividendPaymentKind = 'actual' | 'announced' | 'projected';

export type DividendPayment = {
  id: string;
  amount: number;
  date: string;
  paymentDate?: string | null;
  holdingName: string;
  isEstimate: boolean;
  isSplitAdjusted: boolean;
  kind: DividendPaymentKind;
  rawPerShareAmount: number;
  perShareAmount: number;
  quantity: number;
  symbol: string;
  currency: string;
  distributionType: string;
  regularityBasis?: string | null;
  isManual: boolean;
  sourceUrl?: string | null;
  shareBasis?: string | null;
  forecastMethod?: string | null;
  forecastRange?: { min: string; max: string } | null;
};

export type DividendMonth = {
  index: number;
  isEstimate: boolean;
  label: string;
  payments: DividendPayment[];
  total: number;
};

export const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Initial research coverage uses US exchanges. Match the API market date at year boundaries.
export const distributionMarketDate = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};

export const normalizePayoutAmount = (
  payout: SecurityPayoutDetails,
  corporateActions: CorporateAction[] = [],
  asOf = distributionMarketDate(),
) => {
  if (payout.amountPerShare != null) return Number(payout.amountPerShare);
  if (payout.shareBasis?.startsWith('as_of:')) return payout.amount;
  return corporateActions
    .filter((action) => action.effectiveDate > payout.exDividendDate && action.effectiveDate <= asOf)
    .reduce((amount, action) => amount * action.oldShares / action.newShares, payout.amount);
};

export const totalQuantity = (holding: Holding) =>
  holding.accountPositions.reduce((sum, position) => sum + position.quantity, 0);

export const growthRateForHolding = (holding: Holding) => holding.security.dividendGrowthRate ?? 0;

export const hasInvalidGrowthRate = (holding: Holding) => {
  const rate = holding.security.dividendGrowthRate;
  return rate != null && (!Number.isFinite(rate) || rate < -1);
};

const effectivePayoutAmount = (holding: Holding, payout: SecurityPayoutDetails, asOf: string) => {
  if (payout.amountPerShare != null) return Number(payout.amountPerShare);
  if (payout.mode !== 'manual' && holding.security.dividendResearchAdjustmentBasis === 'current_share_basis') return payout.amount;
  return normalizePayoutAmount(payout, holding.security.corporateActions, asOf);
};

export const safeSourceUrl = (value?: string | null) => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch { return undefined; }
};

// Income renders researched events. Growth assumptions belong only to Future Forecast.
export const buildPaymentsForYear = (
  holdings: Holding[],
  selectedYear: number,
  currentYear: number,
  todayKey: string,
): DividendPayment[] => holdings.flatMap((holding) => {
  const quantity = totalQuantity(holding);
  if (quantity <= 0 || holding.security.assetType === 'Cash') return [];
  return (holding.security.payoutDetails ?? []).flatMap((payout, index) => {
    if (payout.excludedFromTotals || payout.status === 'superseded' || Number(payout.exDividendDate.slice(0, 4)) !== selectedYear) return [];
    const kind: DividendPaymentKind = payout.status === 'projected' ? 'projected'
      : payout.status === 'announced' || payout.exDividendDate > todayKey ? 'announced' : 'actual';
    // An expired forecast is not an actual, and missing history cannot be backfilled.
    if (selectedYear < currentYear && kind !== 'actual') return [];
    if (kind === 'projected' && payout.exDividendDate <= todayKey) return [];
    const perShareAmount = effectivePayoutAmount(holding, payout, holding.security.dividendResearchAsOf ?? todayKey);
    if (!Number.isFinite(perShareAmount) || perShareAmount <= 0) return [];
    const rawPerShareAmount = payout.rawAmount != null ? Number(payout.rawAmount) : payout.amount;
    return [{
      id: `${holding.id}-${payout.eventId ?? index}`,
      amount: perShareAmount * quantity,
      date: payout.exDividendDate,
      paymentDate: payout.paymentDate,
      holdingName: holding.security.name,
      isEstimate: kind !== 'actual',
      isSplitAdjusted: perShareAmount !== rawPerShareAmount,
      kind,
      rawPerShareAmount,
      perShareAmount,
      quantity,
      symbol: holding.security.symbol,
      currency: payout.currency || holding.security.currency,
      distributionType: payout.distributionType ?? 'income',
      regularityBasis: payout.regularityBasis,
      isManual: payout.mode === 'manual',
      sourceUrl: safeSourceUrl(payout.sourceUrl),
      shareBasis: payout.shareBasis,
      forecastMethod: payout.forecastMethod,
      forecastRange: payout.forecastRange,
    }];
  });
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
      .filter((payment) => Number(payment.date.slice(5, 7)) - 1 === index)
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
