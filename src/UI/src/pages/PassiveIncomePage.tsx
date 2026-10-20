import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { Holding } from '../domain/holding';
import type { HoldingRepository } from '../domain/holdingRepository';
import { buildAnnualDividendForecast } from '../features/passiveIncome/dividendForecast';
import { DistributionPaymentsTable } from '../features/passiveIncome/DistributionPaymentsTable';
import { DistributionResearchPanel } from '../features/passiveIncome/DistributionResearchPanel';
import {
  buildMonthlyIncome,
  distributionMarketDate,
  hasInvalidGrowthRate,
  totalQuantity,
} from '../features/passiveIncome/dividendSchedule';

export { normalizePayoutAmount } from '../features/passiveIncome/dividendSchedule';

type PassiveIncomePageProps = { holdingRepository: HoldingRepository };
type PassiveIncomeTab = 'income' | 'future-forecast';

const quarters = [
  { label: 'Q1', indexes: [0, 1, 2] },
  { label: 'Q2', indexes: [3, 4, 5] },
  { label: 'Q3', indexes: [6, 7, 8] },
  { label: 'Q4', indexes: [9, 10, 11] },
];

export function PassiveIncomePage({ holdingRepository }: PassiveIncomePageProps) {
  const today = useMemo(() => new Date(), []);
  const todayKey = distributionMarketDate(today);
  const currentYear = Number(todayKey.slice(0, 4));
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PassiveIncomeTab>('income');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(() => new Set());
  const [targetYearDraft, setTargetYearDraft] = useState(String(Math.max(2040, currentYear)));
  const [currencyDraft, setCurrencyDraft] = useState('USD');
  const [loadVersion, setLoadVersion] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      try {
        const result = await holdingRepository.listHoldings();
        if (!cancelled) { setHoldings(result); setError(null); }
      } catch {
        if (!cancelled) setError('Passive income could not be loaded.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [holdingRepository, loadVersion]);

  const currencies = [...new Set(holdings.filter((holding) => totalQuantity(holding) > 0 && holding.security.assetType !== 'Cash').flatMap((holding) => [holding.security.currency, ...(holding.security.payoutDetails ?? []).map((payout) => payout.currency || holding.security.currency)]))].sort();
  const currency = currencies.includes(currencyDraft) ? currencyDraft : currencies[0] ?? 'USD';
  const visibleHoldings = useMemo(() => holdings.map((holding) => ({ ...holding, security: { ...holding.security, payoutDetails: (holding.security.payoutDetails ?? []).filter((payout) => (payout.currency || holding.security.currency) === currency) } })).filter((holding) => holding.security.payoutDetails.length > 0), [holdings, currency]);
  const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);

  const months = useMemo(
    () => buildMonthlyIncome(visibleHoldings, selectedYear, currentYear, todayKey),
    [visibleHoldings, selectedYear, currentYear, todayKey],
  );
  const payments = months.flatMap((month) => month.payments);
  const totals = (kind: 'actual' | 'announced' | 'projected') => payments.filter((payment) => payment.kind === kind).reduce((sum, payment) => sum + payment.amount, 0);
  const annualTotal = months.reduce((sum, month) => sum + month.total, 0);
  const monthlyAverage = annualTotal / 12;
  const maxMonthTotal = Math.max(...months.map((month) => month.total), 0);
  const targetYear = Number(targetYearDraft);
  const targetYearError = targetYearDraft.trim() === '' || !Number.isInteger(targetYear) || targetYear < currentYear
    ? `Enter a whole year of ${currentYear} or later.`
    : null;
  const forecast = useMemo(
    () => targetYearError ? [] : buildAnnualDividendForecast(visibleHoldings, currentYear, todayKey, targetYear),
    [currentYear, visibleHoldings, targetYear, targetYearError, todayKey],
  );
  const missingGrowthSymbols = useMemo(() => visibleHoldings
    .filter((holding) => totalQuantity(holding) > 0 && holding.security.dividendGrowthRate == null)
    .map((holding) => holding.security.symbol), [visibleHoldings]);
  const invalidGrowthSymbols = useMemo(() => visibleHoldings
    .filter((holding) => totalQuantity(holding) > 0 && hasInvalidGrowthRate(holding))
    .map((holding) => holding.security.symbol), [visibleHoldings]);

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
  const toggleMonth = (index: number) => setExpandedMonths((current) => {
    const next = new Set(current);
    if (next.has(index)) next.delete(index); else next.add(index);
    return next;
  });

  if (isLoading) return <p className="status-copy" role="status">Loading passive income...</p>;

  return (
    <section className="passive-income-workspace" aria-labelledby="passive-income-heading">
      <div className="holdings-table-header passive-income-header">
        <div><h2 id="passive-income-heading">Passive Income</h2><p>Distribution history, near-term forecasts, and long-range growth estimates.</p></div>
      </div>
      {error ? <div><p className="form-error" role="alert">{error}</p><button type="button" className="secondary-action" onClick={() => setLoadVersion((value) => value + 1)}>Retry loading passive income</button></div> : null}
      <DistributionResearchPanel holdings={holdings} repository={holdingRepository} onRefreshed={setHoldings} />
      {currencies.length > 1 ? <label className="field">Currency<select value={currency} onChange={(event) => setCurrencyDraft(event.target.value)}>{currencies.map((value) => <option key={value}>{value}</option>)}</select><small>Totals are shown separately by currency; no exchange conversion is applied.</small></label> : null}

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
            <label className="field">Distribution year<select value={selectedYear} onChange={(event) => { setSelectedYear(Number(event.target.value)); setExpandedMonths(new Set()); }}>
              <option value={currentYear}>{currentYear} · Current year (Actual + forecast)</option>
              <option value={currentYear - 1}>{currentYear - 1} · Previous year (Actual)</option>
              <option value={currentYear + 1}>{currentYear + 1} · Next year (Forecast)</option>
            </select></label>
          </div>

          <div className="passive-income-summary-grid">
            <div className="passive-income-summary-card"><span>Annual Dividend Income</span><strong>{payments.length ? money(annualTotal) : 'Unavailable'}</strong><small>Actual: {money(totals('actual'))} · Announced: {money(totals('announced'))} · Projected: {money(totals('projected'))}</small></div>
            <div className="passive-income-summary-card"><span>Average Monthly Dividend Income</span><strong>{payments.length ? money(monthlyAverage) : 'Unavailable'}</strong><small>Based on available distribution records · {currency}</small></div>
          </div>
          {!payments.length ? <p className="status-copy" role="status">No distribution amounts are available for {selectedYear}. Refresh distribution data to check coverage. Missing history or forecasts are unavailable.</p> : null}

          <section className="passive-income-chart-section" aria-labelledby="passive-income-chart-heading">
            <div className="passive-income-section-heading"><h3 id="passive-income-chart-heading">Monthly Income</h3><span>{selectedYear < currentYear ? 'Actual distributions' : 'Actual, announced, and projected distributions'} for {selectedYear} · grouped by ex-date</span></div>
            <div className="passive-income-chart" role="group" aria-label={`${selectedYear} dividend income by month`}>
              <div className="passive-income-y-axis"><span>{money(maxMonthTotal)}</span><span>{money(maxMonthTotal / 2)}</span><span>{money(0)}</span></div>
              <div className="passive-income-bars">{months.map((month) => {
                const height = maxMonthTotal > 0 ? Math.max(month.total / maxMonthTotal * 100, 3) : 0;
                return <button className={`passive-income-bar-item${month.isEstimate ? ' passive-income-estimate' : ''}`} key={month.label} type="button" onClick={() => toggleMonth(month.index)} aria-label={`${month.label}, ${money(month.total)}${month.isEstimate ? ', includes forecast' : ''}`} aria-expanded={expandedMonths.has(month.index)} aria-controls={`passive-income-month-${month.index}`}><span className="passive-income-bar-track" aria-hidden="true"><span className="passive-income-bar" style={{ height: `${height}%` }} /></span><strong>{money(month.total)}</strong><span>{month.label}</span></button>;
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
                return <article className={`passive-income-month${month.isEstimate ? ' passive-income-estimate' : ''}${expanded ? ' passive-income-month-expanded' : ''}`} key={month.label}>
                  <button className="passive-income-month-toggle" type="button" onClick={() => toggleMonth(month.index)} aria-label={`${month.label}, ${countLabel}, ${money(month.total)}${kinds ? `, ${kinds}` : ''}`} aria-expanded={expanded} aria-controls={`passive-income-month-${month.index}`}>
                    <span className="passive-income-month-name">{month.label}</span><strong>{money(month.total)}</strong><span className="passive-income-month-count">{countLabel}{month.isEstimate ? ' · estimated' : ''}</span>
                  </button>
                  <div className="passive-income-month-panel" id={`passive-income-month-${month.index}`} hidden={!expanded}>{expanded ? month.payments.length === 0 ? <p>No distributions are available for {month.label}.</p> : <DistributionPaymentsTable payments={month.payments} month={month.label} /> : null}</div>
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
              <AnnualForecastChart values={forecast} formatMoney={money} />
              <table className="future-dividend-table"><caption>Annual dividend forecast values</caption><thead><tr><th scope="col">Year</th><th scope="col">Dividend income</th></tr></thead><tbody>{forecast.map((item) => <tr key={item.year}><th scope="row">{item.year}</th><td>{money(item.amount)}</td></tr>)}</tbody></table>
            </> : null}
          </section>
        </div>
      )}
    </section>
  );
}

function AnnualForecastChart({ values, formatMoney }: { values: Array<{ year: number; amount: number }>; formatMoney: (value: number) => string }) {
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
