import { useEffect, useMemo, useState } from 'react';
import type { Holding, SecurityPayoutDetails } from '../domain/holding';
import type { HoldingRepository } from '../domain/holdingRepository';

type PassiveIncomePageProps = {
  holdingRepository: HoldingRepository;
};

type DividendPayment = {
  amount: number;
  date: string;
  growthRate: number;
  holdingName: string;
  isEstimate: boolean;
  perShareAmount: number;
  quantity: number;
  symbol: string;
};

type DividendMonth = {
  index: number;
  isEstimate: boolean;
  label: string;
  payments: DividendPayment[];
  total: number;
};

const maxProjectedGrowthRate = 0.15;
const minProjectedGrowthRate = -0.2;
const monthLabels = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 2,
});

const quantityFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 4,
});

const formatMoney = (value: number) => (value === 0 ? '$   -   ' : currencyFormatter.format(value));

const payoutDate = (payout: SecurityPayoutDetails) =>
  payout.paymentDate || payout.exDividendDate;

const totalQuantity = (holding: Holding) =>
  holding.accountPositions.reduce((sum, position) => sum + position.quantity, 0);

const projectedGrowthRate = (holding: Holding) => {
  const explicitRate = holding.security.dividendGrowthRate;
  const previous = holding.security.dividendPreviousYear;
  const current = holding.security.dividendCurrentYear;
  const calculatedRate =
    previous && current != null ? (current - previous) / previous : undefined;
  const rate = explicitRate ?? calculatedRate ?? 0;
  return Math.max(minProjectedGrowthRate, Math.min(maxProjectedGrowthRate, rate));
};

const paymentYear = (payment: SecurityPayoutDetails) => {
  const date = payoutDate(payment);
  const year = Number(date.slice(0, 4));
  return Number.isNaN(year) ? null : year;
};

const monthIndex = (date: string) => {
  const index = Number(date.slice(5, 7)) - 1;
  return index >= 0 && index < 12 ? index : null;
};

const toDividendPayment = (
  holding: Holding,
  payout: SecurityPayoutDetails,
  {
    date = payoutDate(payout),
    isEstimate,
    perShareAmount = payout.amount,
  }: {
    date?: string;
    isEstimate: boolean;
    perShareAmount?: number;
  },
): DividendPayment => {
  const quantity = totalQuantity(holding);
  return {
    amount: perShareAmount * quantity,
    date,
    growthRate: projectedGrowthRate(holding),
    holdingName: holding.security.name,
    isEstimate,
    perShareAmount,
    quantity,
    symbol: holding.security.symbol,
  };
};

const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const getEstimatedDate = (targetYear: number, originalDate: string) => {
  const monthDay = originalDate.slice(5, 10);
  if (monthDay === '02-29' && !isLeapYear(targetYear)) {
    return `${targetYear}-02-28`;
  }
  return `${targetYear}-${monthDay}`;
};

const buildPaymentsForYear = (
  holdings: Holding[],
  selectedYear: number,
  currentYear: number,
  todayKey: string
): DividendPayment[] => {
  if (selectedYear < currentYear) {
    return holdings.flatMap((holding) => {
      const quantity = totalQuantity(holding);
      if (quantity <= 0) {
        return [];
      }

      const payouts = holding.security.payoutDetails ?? [];
      return payouts
        .filter((payout) => paymentYear(payout) === selectedYear)
        .map((payout) => toDividendPayment(holding, payout, { isEstimate: false }));
    });
  }

  if (selectedYear === currentYear) {
    return holdings.flatMap((holding) => {
      const quantity = totalQuantity(holding);
      if (quantity <= 0) {
        return [];
      }

      const growthRate = projectedGrowthRate(holding);
      const payouts = holding.security.payoutDetails ?? [];

      const definedPayouts = payouts.filter((payout) => paymentYear(payout) === currentYear);
      const definedPayments = definedPayouts.map((payout) =>
        toDividendPayment(holding, payout, {
          isEstimate: payoutDate(payout) > todayKey,
        }),
      );

      const priorYearPayouts = payouts.filter((payout) => paymentYear(payout) === currentYear - 1);
      const estimatedPayments = priorYearPayouts
        .map((payout) => {
          const date = payoutDate(payout);
          const estimatedDate = getEstimatedDate(currentYear, date);
          return { payout, estimatedDate };
        })
        .filter(({ estimatedDate }) => {
          if (estimatedDate <= todayKey) {
            return false;
          }
          const month = monthIndex(estimatedDate);
          const hasDefined = definedPayouts.some((p) => monthIndex(payoutDate(p)) === month);
          return !hasDefined;
        })
        .map(({ payout, estimatedDate }) => {
          const estimatedPerShareAmount = payout.amount * (1 + growthRate);
          return toDividendPayment(holding, payout, {
            date: estimatedDate,
            isEstimate: true,
            perShareAmount: estimatedPerShareAmount,
          });
        });

      return [...definedPayments, ...estimatedPayments];
    });
  }

  // selectedYear > currentYear
  return holdings.flatMap((holding) => {
    const quantity = totalQuantity(holding);
    if (quantity <= 0) {
      return [];
    }

    const growthRate = projectedGrowthRate(holding);
    const payouts = holding.security.payoutDetails ?? [];

    const definedPayouts = payouts.filter((payout) => paymentYear(payout) === selectedYear);
    const definedPayments = definedPayouts.map((payout) =>
      toDividendPayment(holding, payout, {
        isEstimate: payoutDate(payout) > todayKey,
      }),
    );

    const currentYearPayments = buildPaymentsForYear([holding], currentYear, currentYear, todayKey);
    const estimatedPayments = currentYearPayments
      .map((payment) => {
        const estimatedPerShareAmount = payment.perShareAmount * (1 + growthRate);
        const estimatedDate = getEstimatedDate(selectedYear, payment.date);
        return { payment, estimatedDate, estimatedPerShareAmount };
      })
      .filter(({ estimatedDate }) => {
        const month = monthIndex(estimatedDate);
        const hasDefined = definedPayouts.some((p) => monthIndex(payoutDate(p)) === month);
        return !hasDefined;
      })
      .map(({ payment, estimatedDate, estimatedPerShareAmount }) => ({
        ...payment,
        amount: estimatedPerShareAmount * payment.quantity,
        date: estimatedDate,
        isEstimate: true,
        perShareAmount: estimatedPerShareAmount,
      }));

    return [...definedPayments, ...estimatedPayments];
  });
};

const buildMonthlyIncome = (
  holdings: Holding[],
  selectedYear: number,
  currentYear: number,
  todayKey: string
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

export function PassiveIncomePage({ holdingRepository }: PassiveIncomePageProps) {
  const today = useMemo(() => new Date(), []);
  const currentYear = useMemo(() => today.getFullYear(), [today]);
  const todayKey = useMemo(() => {
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${currentYear}-${mm}-${dd}`;
  }, [today, currentYear]);

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    // If the mocked/resolved currentYear changes, align selectedYear
    setSelectedYear(currentYear);
  }, [currentYear]);

  useEffect(() => {
    void (async () => {
      try {
        setError(null);
        const loadedHoldings = await holdingRepository.listHoldings();
        setHoldings(loadedHoldings);
        setIsLoading(false);
      } catch {
        setError('Passive income could not be loaded.');
        setIsLoading(false);
      }
    })();
  }, [holdingRepository]);

  const months = useMemo(() => buildMonthlyIncome(holdings, selectedYear, currentYear, todayKey), [holdings, selectedYear, currentYear, todayKey]);
  const annualTotal = months.reduce((sum, month) => sum + month.total, 0);
  const maxMonthTotal = Math.max(...months.map((month) => month.total), 0);
  const populatedMonthCount = months.filter((month) => month.total > 0).length;
  const isEstimateYear = selectedYear === currentYear + 1;
  const selectedYearLabel =
    selectedYear === currentYear - 1
      ? 'Prior year actuals'
      : selectedYear === currentYear
        ? 'Current year'
        : 'Next year estimate';

  const toggleMonth = (monthIndexToToggle: number) => {
    setExpandedMonths((current) => {
      const next = new Set(current);
      if (next.has(monthIndexToToggle)) {
        next.delete(monthIndexToToggle);
      } else {
        next.add(monthIndexToToggle);
      }
      return next;
    });
  };

  const moveYear = (direction: -1 | 1) => {
    setSelectedYear((year) => Math.max(currentYear - 1, Math.min(currentYear + 1, year + direction)));
    setExpandedMonths(new Set());
  };

  if (isLoading) {
    return <p className="status-copy">Loading passive income...</p>;
  }

  return (
    <section className="passive-income-workspace" aria-labelledby="passive-income-heading">
      <div className="holdings-table-header passive-income-header">
        <div>
          <h2 id="passive-income-heading">Passive Income</h2>
          <p>Monthly dividend income by holding.</p>
        </div>
        <div className="passive-income-year-control" aria-label="Dividend income year">
          <button
            className="secondary-action passive-income-year-button"
            type="button"
            onClick={() => moveYear(-1)}
            disabled={selectedYear <= currentYear - 1}
            aria-label={selectedYear === currentYear + 1 ? 'Show current year' : 'Show prior year'}
          >
            <span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>
          </button>
          <div className="passive-income-year-readout">
            <strong>{selectedYear}</strong>
            <span>{selectedYearLabel}</span>
          </div>
          <button
            className="secondary-action passive-income-year-button"
            type="button"
            onClick={() => moveYear(1)}
            disabled={selectedYear >= currentYear + 1}
            aria-label="Show next year"
          >
            <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
          </button>
        </div>
      </div>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <div className="passive-income-summary-grid">
        <div className="passive-income-summary-card">
          <span>{isEstimateYear ? 'Estimated income' : 'Dividend income'}</span>
          <strong>{formatMoney(annualTotal)}</strong>
        </div>
        <div className="passive-income-summary-card">
          <span>Paying months</span>
          <strong>{populatedMonthCount}</strong>
        </div>
        <div className="passive-income-summary-card">
          <span>Largest month</span>
          <strong>{formatMoney(maxMonthTotal)}</strong>
        </div>
      </div>

      <section className="passive-income-chart-section" aria-labelledby="passive-income-chart-heading">
        <div className="passive-income-section-heading">
          <h3 id="passive-income-chart-heading">Monthly Income</h3>
          <span>
            {isEstimateYear
              ? 'Estimated from the completed current-year schedule and security growth rates'
              : selectedYear === currentYear
                ? 'Actual payments to date, with remaining months estimated'
                : 'Actual payout rows'}
          </span>
        </div>
        <div className="passive-income-chart" role="img" aria-label={`${selectedYear} dividend income by month`}>
          <div className="passive-income-y-axis">
            <span>{formatMoney(maxMonthTotal)}</span>
            <span>{formatMoney(maxMonthTotal / 2)}</span>
            <span>$0</span>
          </div>
          <div className="passive-income-bars">
            {months.map((month) => {
              const height = maxMonthTotal > 0 ? Math.max((month.total / maxMonthTotal) * 100, 3) : 0;
              return (
                <button
                  className={`passive-income-bar-item${month.isEstimate ? ' passive-income-estimate' : ''}`}
                  key={month.label}
                  type="button"
                  onClick={() => toggleMonth(month.index)}
                  aria-label={`${month.label}, ${formatMoney(month.total)}`}
                  aria-expanded={expandedMonths.has(month.index)}
                  aria-controls={`passive-income-month-${month.index}`}
                >
                  <span className="passive-income-bar-track" aria-hidden="true">
                    <span className="passive-income-bar" style={{ height: `${height}%` }} />
                  </span>
                  <strong>{formatMoney(month.total)}</strong>
                  <span>{month.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="passive-income-months" aria-label={`${selectedYear} dividend income months`}>
        {months.map((month) => {
          const isExpanded = expandedMonths.has(month.index);
          return (
            <article
              className={`passive-income-month${month.isEstimate ? ' passive-income-estimate' : ''}`}
              key={month.label}
            >
              <button
                className="passive-income-month-toggle"
                type="button"
                onClick={() => toggleMonth(month.index)}
                aria-label={`${month.label}, ${
                  month.payments.length === 1 ? '1 payment' : `${month.payments.length} payments`
                }, ${formatMoney(month.total)}`}
                aria-expanded={isExpanded}
                aria-controls={`passive-income-month-${month.index}`}
              >
                <span className="material-symbols-outlined passive-income-accordion-icon" aria-hidden="true">
                  {isExpanded ? 'expand_less' : 'expand_more'}
                </span>
                <span className="passive-income-month-name">{month.label}</span>
                <span className="passive-income-month-count">
                  {month.payments.length === 1 ? '1 payment' : `${month.payments.length} payments`}
                  {month.isEstimate ? ' · estimated' : ''}
                </span>
                <strong>{formatMoney(month.total)}</strong>
              </button>

              {isExpanded ? (
                <div className="passive-income-month-panel" id={`passive-income-month-${month.index}`}>
                  {month.payments.length === 0 ? (
                    <p>No dividends are available for {month.label}.</p>
                  ) : (
                    <div className="passive-income-payment-table">
                      <div className="passive-income-payment-row passive-income-payment-header">
                        <span>Date</span>
                        <span>Holding</span>
                        <span>Per Share</span>
                        <span>Shares</span>
                        <span>Income</span>
                      </div>
                      {month.payments.map((payment) => (
                        <div
                          className={`passive-income-payment-row${
                            payment.isEstimate ? ' passive-income-payment-estimate' : ''
                          }`}
                          key={`${payment.symbol}-${payment.date}-${payment.perShareAmount}`}
                        >
                          <span>{payment.date}</span>
                          <span className="passive-income-payment-security">
                            <strong>{payment.symbol}</strong>
                            <small>{payment.holdingName}</small>
                            {payment.isEstimate ? (
                              <small>
                                {percentFormatter.format(payment.growthRate)} growth estimate
                              </small>
                            ) : null}
                          </span>
                          <span>{formatMoney(payment.perShareAmount)}</span>
                          <span>{quantityFormatter.format(payment.quantity)}</span>
                          <strong>{formatMoney(payment.amount)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
    </section>
  );
}
