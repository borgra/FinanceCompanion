import { useEffect, useMemo, useState } from 'react';
import {
  FinanceMoneyCellValue,
  FinanceTable,
  FinanceTableHeaderCell,
} from '../components/FinanceTable';
import type { Holding, SecurityPayoutDetails } from '../domain/holding';
import type { HoldingRepository } from '../domain/holdingRepository';

type PassiveIncomePageProps = {
  holdingRepository: HoldingRepository;
};

type PaymentScheduleItem = {
  amount: number;
  date: string;
  holdingName: string;
  source: string;
  symbol: string;
};

type ProjectionYear = {
  income: number;
  growthRate: number;
  year: number;
};

const currentYear = new Date().getFullYear();
const projectionYears = 5;
const maxProjectedGrowthRate = 0.15;
const minProjectedGrowthRate = -0.2;

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 2,
});

const formatMoney = (value: number) => (value === 0 ? '$   -   ' : currencyFormatter.format(value));

const formatPercent = (value: number) => percentFormatter.format(value);

const totalQuantity = (holding: Holding) =>
  holding.accountPositions.reduce((sum, position) => sum + position.quantity, 0);

const payoutDate = (payout: SecurityPayoutDetails) =>
  payout.paymentDate || payout.exDividendDate;

const isCurrentYearPayout = (payout: SecurityPayoutDetails) =>
  payoutDate(payout).startsWith(`${currentYear}-`);

const annualDividendPerShare = (holding: Holding) =>
  holding.security.dividendCurrentYear ??
  holding.security.estimatedFuturePayout ??
  holding.security.dividendPreviousYear ??
  0;

const annualDividendIncome = (holding: Holding) =>
  annualDividendPerShare(holding) * totalQuantity(holding);

const projectedGrowthRate = (holding: Holding) => {
  const explicitRate = holding.security.dividendGrowthRate;
  const previous = holding.security.dividendPreviousYear;
  const current = holding.security.dividendCurrentYear;
  const calculatedRate =
    previous && current != null ? (current - previous) / previous : undefined;
  const rate = explicitRate ?? calculatedRate ?? 0;
  return Math.max(minProjectedGrowthRate, Math.min(maxProjectedGrowthRate, rate));
};

const buildPaymentSchedule = (holdings: Holding[]): PaymentScheduleItem[] =>
  holdings
    .flatMap((holding) => {
      const quantity = totalQuantity(holding);
      return (holding.security.payoutDetails ?? [])
        .filter(isCurrentYearPayout)
        .map((payout) => ({
          amount: payout.amount * quantity,
          date: payoutDate(payout),
          holdingName: holding.security.name,
          source: payout.source ?? 'payout',
          symbol: holding.security.symbol,
        }));
    })
    .sort((left, right) => left.date.localeCompare(right.date) || left.symbol.localeCompare(right.symbol));

const buildProjection = (holdings: Holding[]): ProjectionYear[] => {
  const baseIncome = holdings.reduce(
    (sum, holding) => sum + annualDividendIncome(holding),
    0,
  );
  const weightedGrowth =
    baseIncome > 0
      ? holdings.reduce(
          (sum, holding) =>
            sum + projectedGrowthRate(holding) * annualDividendIncome(holding),
          0,
        ) / baseIncome
      : 0;

  return Array.from({ length: projectionYears }, (_, index) => {
    const year = currentYear + index + 1;
    return {
      income: baseIncome * ((1 + weightedGrowth) ** (index + 1)),
      growthRate: weightedGrowth,
      year,
    };
  });
};

export function PassiveIncomePage({ holdingRepository }: PassiveIncomePageProps) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setError(null);
        const loadedHoldings = await holdingRepository.listHoldings();
        setHoldings(loadedHoldings);
        setIsLoading(false);
        setIsRefreshing(true);
        try {
          const refreshed = await holdingRepository.refreshHeldSecurityDetails();
          setHoldings(refreshed.holdings);
        } finally {
          setIsRefreshing(false);
        }
      } catch {
        setError('Passive income could not be loaded.');
        setIsLoading(false);
        setIsRefreshing(false);
      }
    })();
  }, [holdingRepository]);

  const paymentSchedule = useMemo(() => buildPaymentSchedule(holdings), [holdings]);
  const projection = useMemo(() => buildProjection(holdings), [holdings]);
  const currentAnnualIncome = holdings.reduce(
    (sum, holding) => sum + annualDividendIncome(holding),
    0,
  );
  const scheduledThisYear = paymentSchedule.reduce((sum, item) => sum + item.amount, 0);
  const projectedGrowth = projection[0]?.growthRate ?? 0;

  if (isLoading) {
    return <p className="status-copy">Loading passive income...</p>;
  }

  return (
    <section className="passive-income-workspace" aria-labelledby="passive-income-heading">
      <div className="holdings-table-header">
        <div>
          <h2 id="passive-income-heading">Passive Income</h2>
          <p>Dividend and distribution timing from current holdings.</p>
        </div>
        {isRefreshing ? <p className="status-copy">Refreshing payout details...</p> : null}
      </div>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <div className="passive-income-summary-grid">
        <div className="passive-income-summary-card">
          <span>Estimated annual income</span>
          <strong>{formatMoney(currentAnnualIncome)}</strong>
        </div>
        <div className="passive-income-summary-card">
          <span>Scheduled this year</span>
          <strong>{formatMoney(scheduledThisYear)}</strong>
        </div>
        <div className="passive-income-summary-card">
          <span>Projection growth rate</span>
          <strong>{formatPercent(projectedGrowth)}</strong>
        </div>
      </div>

      <div className="passive-income-section">
        <h3>{currentYear} Payment Schedule</h3>
        <FinanceTable wrapperStyle={{ marginTop: 0 }}>
          <thead>
            <tr>
              <FinanceTableHeaderCell>Date</FinanceTableHeaderCell>
              <FinanceTableHeaderCell>Security</FinanceTableHeaderCell>
              <FinanceTableHeaderCell>Ticker</FinanceTableHeaderCell>
              <FinanceTableHeaderCell>Source</FinanceTableHeaderCell>
              <FinanceTableHeaderCell>Amount</FinanceTableHeaderCell>
            </tr>
          </thead>
          <tbody>
            {paymentSchedule.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <span className="excel-cell-val">No payout dates are available for this year.</span>
                </td>
              </tr>
            ) : (
              paymentSchedule.map((item) => (
                <tr key={`${item.symbol}-${item.date}-${item.amount}`}>
                  <td><span className="excel-cell-val">{item.date}</span></td>
                  <td><span className="excel-cell-val">{item.holdingName}</span></td>
                  <td><span className="excel-cell-val">{item.symbol}</span></td>
                  <td><span className="excel-cell-val">{item.source}</span></td>
                  <td>
                    <FinanceMoneyCellValue value={item.amount} formatValue={formatMoney} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </FinanceTable>
      </div>

      <div className="passive-income-section">
        <h3>5 Year Income Projection</h3>
        <FinanceTable wrapperStyle={{ marginTop: 0 }}>
          <thead>
            <tr>
              <FinanceTableHeaderCell>Year</FinanceTableHeaderCell>
              <FinanceTableHeaderCell>Projected Income</FinanceTableHeaderCell>
              <FinanceTableHeaderCell>Growth Assumption</FinanceTableHeaderCell>
            </tr>
          </thead>
          <tbody>
            {projection.map((item) => (
              <tr key={item.year}>
                <td><span className="excel-cell-val">{item.year}</span></td>
                <td>
                  <FinanceMoneyCellValue value={item.income} formatValue={formatMoney} />
                </td>
                <td><span className="excel-cell-val">{formatPercent(item.growthRate)}</span></td>
              </tr>
            ))}
          </tbody>
        </FinanceTable>
      </div>
    </section>
  );
}
