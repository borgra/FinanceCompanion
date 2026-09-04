import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { Holding } from '../domain/holding';
import type { HoldingRepository } from '../domain/holdingRepository';
import { buildAnnualDividendForecast } from '../features/passiveIncome/dividendForecast';
import {
  buildMonthlyIncome,
  hasInvalidGrowthRate,
  totalQuantity,
} from '../features/passiveIncome/dividendSchedule';

export { normalizePayoutAmount } from '../features/passiveIncome/dividendSchedule';

type PassiveIncomePageProps = { holdingRepository: HoldingRepository };
type PassiveIncomeTab = 'income' | 'future-forecast';

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const percentFormatter = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2 });
const quantityFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });
const formatMoney = (value: number) => value === 0 ? '$   -   ' : currencyFormatter.format(value);
const quarters = [
  { label: 'Q1', indexes: [0, 1, 2] },
  { label: 'Q2', indexes: [3, 4, 5] },
  { label: 'Q3', indexes: [6, 7, 8] },
  { label: 'Q4', indexes: [9, 10, 11] },
];

export function PassiveIncomePage({ holdingRepository }: PassiveIncomePageProps) {
  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();
  const todayKey = `${currentYear}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PassiveIncomeTab>('income');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(() => new Set());
  const [targetYearDraft, setTargetYearDraft] = useState(String(Math.max(2040, currentYear)));
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    void (async () => {
      try {
        setHoldings(await holdingRepository.listHoldings());
      } catch {
        setError('Passive income could not be loaded.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [holdingRepository]);

  const months = useMemo(
    () => buildMonthlyIncome(holdings, selectedYear, currentYear, todayKey),
    [holdings, selectedYear, currentYear, todayKey],
  );
  const annualTotal = months.reduce((sum, month) => sum + month.total, 0);
  const monthlyAverage = annualTotal / 12;
  const maxMonthTotal = Math.max(...months.map((month) => month.total), 0);
  const targetYear = Number(targetYearDraft);
  const targetYearError = targetYearDraft.trim() === '' || !Number.isInteger(targetYear) || targetYear < currentYear
    ? `Enter a whole year of ${currentYear} or later.`
    : null;
  const forecast = useMemo(
    () => targetYearError ? [] : buildAnnualDividendForecast(holdings, currentYear, todayKey, targetYear),
    [currentYear, holdings, targetYear, targetYearError, todayKey],
  );
  const missingGrowthSymbols = useMemo(() => holdings
    .filter((holding) => totalQuantity(holding) > 0 && holding.security.dividendGrowthRate == null)
    .map((holding) => holding.security.symbol), [holdings]);
  const invalidGrowthSymbols = useMemo(() => holdings
    .filter((holding) => totalQuantity(holding) > 0 && hasInvalidGrowthRate(holding))
    .map((holding) => holding.security.symbol), [holdings]);

  const selectTab = (tab: PassiveIncomeTab) => setActiveTab(tab);
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + 2) % 2;
    const nextTab: PassiveIncomeTab = nextIndex === 0 ? 'income' : 'future-forecast';
    selectTab(nextTab);
    tabRefs.current[nextIndex]?.focus();
  };
  const moveYear = (direction: -1 | 1) => {
    setSelectedYear((year) => Math.max(currentYear - 2, Math.min(currentYear + 1, year + direction)));
    setExpandedMonths(new Set());
  };
  const toggleMonth = (index: number) => setExpandedMonths((current) => {
    const next = new Set(current);
    if (next.has(index)) next.delete(index); else next.add(index);
    return next;
  });

  if (isLoading) return <p className="status-copy">Loading passive income...</p>;

  return (
    <section className="passive-income-workspace" aria-labelledby="passive-income-heading">
      <div className="holdings-table-header passive-income-header">
        <div><h2 id="passive-income-heading">Passive Income</h2><p>Dividend income, payment schedules, and long-range growth estimates.</p></div>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <div className="security-details-tabs passive-income-tabs" role="tablist" aria-label="Passive Income views">
        {([
          ['income', 'Income'],
          ['future-forecast', 'Future Forecast'],
        ] as const).map(([id, label], index) => (
          <button
            key={id}
            ref={(element) => { tabRefs.current[index] = element; }}
            id={`passive-income-tab-${id}`}
            role="tab"
            type="button"
            aria-selected={activeTab === id}
            aria-controls={`passive-income-panel-${id}`}
            tabIndex={activeTab === id ? 0 : -1}
            className={activeTab === id ? 'security-details-tab-active' : undefined}
            onClick={() => selectTab(id)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
          >{label}</button>
        ))}
      </div>

      {activeTab === 'income' ? (
        <div id="passive-income-panel-income" role="tabpanel" aria-labelledby="passive-income-tab-income">
          <div className="passive-income-year-control" aria-label="Dividend income year">
            <button className="secondary-action passive-income-year-button" type="button" onClick={() => moveYear(-1)} disabled={selectedYear <= currentYear - 2} aria-label={selectedYear === currentYear + 1 ? 'Show current year' : 'Show prior year'}><span className="material-symbols-outlined" aria-hidden="true">chevron_left</span></button>
            <div className="passive-income-year-readout"><strong>{selectedYear}</strong><span>{selectedYear === currentYear - 2 ? 'Two years ago actuals' : selectedYear === currentYear - 1 ? 'Prior year actuals' : selectedYear === currentYear ? 'Current year' : 'Next year estimate'}</span></div>
            <button className="secondary-action passive-income-year-button" type="button" onClick={() => moveYear(1)} disabled={selectedYear >= currentYear + 1} aria-label="Show next year"><span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></button>
          </div>

          <div className="passive-income-summary-grid">
            <div className="passive-income-summary-card"><span>Annual Dividend Income</span><strong>{formatMoney(annualTotal)}</strong></div>
            <div className="passive-income-summary-card"><span>Average Monthly Dividend Income</span><strong>{formatMoney(monthlyAverage)}</strong></div>
          </div>

          <section className="passive-income-chart-section" aria-labelledby="passive-income-chart-heading">
            <div className="passive-income-section-heading"><h3 id="passive-income-chart-heading">Monthly Income</h3><span>Actual, announced, and projected payments for {selectedYear}</span></div>
            <div className="passive-income-chart" role="img" aria-label={`${selectedYear} dividend income by month`}>
              <div className="passive-income-y-axis"><span>{formatMoney(maxMonthTotal)}</span><span>{formatMoney(maxMonthTotal / 2)}</span><span>$0</span></div>
              <div className="passive-income-bars">{months.map((month) => {
                const height = maxMonthTotal > 0 ? Math.max(month.total / maxMonthTotal * 100, 3) : 0;
                return <button className={`passive-income-bar-item${month.isEstimate ? ' passive-income-estimate' : ''}`} key={month.label} type="button" onClick={() => toggleMonth(month.index)} aria-label={`${month.label}, ${formatMoney(month.total)}`} aria-expanded={expandedMonths.has(month.index)} aria-controls={`passive-income-month-${month.index}`}><span className="passive-income-bar-track" aria-hidden="true"><span className="passive-income-bar" style={{ height: `${height}%` }} /></span><strong>{formatMoney(month.total)}</strong><span>{month.label}</span></button>;
              })}</div>
            </div>
          </section>

          <section className="passive-income-quarters" aria-label={`${selectedYear} dividend income months`}>
            {quarters.map((quarter) => <section className="passive-income-quarter" aria-labelledby={`passive-income-${quarter.label}`} key={quarter.label}>
              <h3 id={`passive-income-${quarter.label}`}>{quarter.label}</h3>
              <div className="passive-income-quarter-months">{quarter.indexes.map((monthIndex) => {
                const month = months[monthIndex];
                const expanded = expandedMonths.has(month.index);
                const countLabel = month.payments.length === 1 ? '1 payment' : `${month.payments.length} payments`;
                const kinds = [...new Set(month.payments.map((payment) => payment.kind))].join(', ');
                return <article className={`passive-income-month${month.isEstimate ? ' passive-income-estimate' : ''}`} key={month.label}>
                  <button className="passive-income-month-toggle" type="button" onClick={() => toggleMonth(month.index)} aria-label={`${month.label}, ${countLabel}, ${formatMoney(month.total)}${kinds ? `, ${kinds}` : ''}`} aria-expanded={expanded} aria-controls={`passive-income-month-${month.index}`}>
                    <span className="passive-income-month-name">{month.label}</span><strong>{formatMoney(month.total)}</strong><span className="passive-income-month-count">{countLabel}{month.isEstimate ? ' · estimated' : ''}</span>
                  </button>
                  {expanded ? <div className="passive-income-month-panel" id={`passive-income-month-${month.index}`}>{month.payments.length === 0 ? <p>No dividends are available for {month.label}.</p> : <div className="passive-income-payment-table"><div className="passive-income-payment-row passive-income-payment-header"><span>Date</span><span>Holding</span><span>Per Share</span><span>Shares</span><span>Income</span></div>{month.payments.map((payment) => <div className={`passive-income-payment-row${payment.isEstimate ? ' passive-income-payment-estimate' : ''}`} key={`${payment.symbol}-${payment.date}-${payment.perShareAmount}`}><span>{payment.date}</span><span className="passive-income-payment-security"><strong>{payment.symbol}</strong><small>{payment.holdingName}</small><small>{payment.kind}</small>{payment.kind === 'projected' ? <small>{percentFormatter.format(payment.growthRate)} growth estimate</small> : null}{payment.isSplitAdjusted ? <small>Split-adjusted from {formatMoney(payment.rawPerShareAmount)} per share</small> : null}</span><span>{formatMoney(payment.perShareAmount)}</span><span>{quantityFormatter.format(payment.quantity)}</span><strong>{formatMoney(payment.amount)}</strong></div>)}</div>}</div> : null}
                </article>;
              })}</div>
            </section>)}
          </section>
        </div>
      ) : (
        <div id="passive-income-panel-future-forecast" role="tabpanel" aria-labelledby="passive-income-tab-future-forecast">
          <section className="future-dividend-forecast" aria-labelledby="future-dividend-heading">
            <div className="passive-income-section-heading"><div><h3 id="future-dividend-heading">Future Dividend Earnings</h3><span>Annual compound growth using each security's saved dividend growth rate.</span></div><label className="field" htmlFor="future-dividend-target-year"><span>Forecast through year</span><input id="future-dividend-target-year" type="number" min={currentYear} step="1" value={targetYearDraft} aria-invalid={Boolean(targetYearError)} aria-describedby={targetYearError ? 'future-dividend-year-error' : undefined} onChange={(event) => setTargetYearDraft(event.target.value)} /></label></div>
            {targetYearError ? <p id="future-dividend-year-error" className="form-error" role="alert">{targetYearError}</p> : null}
            {missingGrowthSymbols.length ? <p className="status-copy">Using 0% growth for securities without a saved rate: {missingGrowthSymbols.join(', ')}.</p> : null}
            {invalidGrowthSymbols.length ? <p className="form-error" role="alert">Cannot calculate a forecast because these securities have an invalid saved growth rate below -100%: {invalidGrowthSymbols.join(', ')}.</p> : null}
            {!targetYearError && !invalidGrowthSymbols.length && (forecast[0]?.amount ?? 0) <= 0 ? <div className="investment-account-empty"><p>Add positive holding quantities and current-year dividend data to create a forecast.</p></div> : null}
            {!targetYearError && !invalidGrowthSymbols.length && (forecast[0]?.amount ?? 0) > 0 ? <>
              <AnnualForecastChart values={forecast} />
              <table className="future-dividend-table"><caption>Annual dividend forecast values</caption><thead><tr><th scope="col">Year</th><th scope="col">Dividend income</th></tr></thead><tbody>{forecast.map((item) => <tr key={item.year}><th scope="row">{item.year}</th><td>{formatMoney(item.amount)}</td></tr>)}</tbody></table>
            </> : null}
          </section>
        </div>
      )}
    </section>
  );
}

function AnnualForecastChart({ values }: { values: Array<{ year: number; amount: number }> }) {
  const width = 900;
  const height = 300;
  const padding = 36;
  const max = Math.max(...values.map((value) => value.amount), 1);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : padding + index / (values.length - 1) * (width - padding * 2);
    const y = height - padding - value.amount / max * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');
  const last = values[values.length - 1];
  return <div className="future-dividend-chart"><svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false"><line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} /><line x1={padding} y1={padding} x2={padding} y2={height - padding} /><polyline points={points} fill="none" /></svg><div className="future-dividend-chart-labels"><span>{values[0]?.year}</span><strong>{formatMoney(last?.amount ?? 0)}</strong><span>{last?.year}</span></div></div>;
}
