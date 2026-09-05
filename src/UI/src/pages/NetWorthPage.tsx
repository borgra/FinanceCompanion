import { useEffect, useMemo, useState } from 'react';
import {
  FinanceMoneyCellInput,
  FinanceMoneyCellValue,
  FinanceTable,
  FinanceTableHeaderCell,
} from '../components/FinanceTable';
import type { Account } from '../domain/account';
import { projectionMonthsList } from '../domain/account';
import type { AccountRepository } from '../domain/accountRepository';
import type { Holding } from '../domain/holding';
import type { HoldingRepository } from '../domain/holdingRepository';
import type { IncomeSource } from '../domain/incomeSource';
import type { IncomeSourceRepository } from '../domain/incomeSourceRepository';
import type { MonthlyAccountValues, MortgageSchedule } from '../domain/netWorth';
import { MortgageSchedulePanel } from './MortgageSchedulePanel';
import type { NetWorthRepository } from '../domain/netWorthRepository';

type NetWorthPageProps = {
  accountRepository: AccountRepository;
  incomeRepository: IncomeSourceRepository;
  holdingRepository: HoldingRepository;
  netWorthRepository: NetWorthRepository;
  mortgageTrackingOverride?: boolean;
};

type NetWorthGroup = {
  id: 'banking' | 'taxable' | 'retirement' | 'hsa' | 'pension';
  label: string;
  accounts: Account[];
};

type MonthlyNetWorthRow = {
  month: string;
  dateCode: string;
  isFuture: boolean;
  valuesByAccountId: Map<string, number>;
  total: number;
  homeValue: number;
};

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const formatMoney = (value: number) => value < 0
  ? `(${currencyFormatter.format(Math.abs(value))})`
  : currencyFormatter.format(value);
const formatPercent = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

const getProjectionMonths = (year: number) => {
  const shortYear = String(year).slice(-2);
  return projectionMonthsList.map((month, index) => ({
    name: `${month.slice(0, 3)}-${shortYear}`,
    dateCode: `${year}-${String(index + 1).padStart(2, '0')}`,
  }));
};

const mortgageEquityForMonth = (schedule: MortgageSchedule | null, monthCode: string) => {
  if (!schedule || schedule.startingOutstandingMortgage <= 0 || monthCode < schedule.scheduleStartMonth) return 0;
  const elapsed = Math.max(0, (Number(monthCode.slice(0, 4)) - Number(schedule.scheduleStartMonth.slice(0, 4))) * 12 + Number(monthCode.slice(5, 7)) - Number(schedule.scheduleStartMonth.slice(5, 7)));
  const principalOverrides = schedule.principalOverrides ?? {}, extraOverrides = schedule.extraPrincipalOverrides ?? {};
  const payment = schedule.monthlyPrincipalPayment + schedule.startingOutstandingMortgage * schedule.annualInterestRate / 12;
  let balance = schedule.startingOutstandingMortgage, effectiveExtra = schedule.monthlyAdditionalPrincipalPayment;
  for (let index = 0; index <= elapsed && balance > 0; index += 1) {
    const key = `${schedule.scheduleStartMonth}:${index}`;
    const principal = Math.min(balance, principalOverrides[key] ?? Math.max(0, payment - balance * schedule.annualInterestRate / 12));
    if (extraOverrides[key] !== undefined) effectiveExtra = extraOverrides[key];
    balance = Math.max(0, balance - principal - Math.min(balance - principal, effectiveExtra));
  }
  return schedule.houseValue - balance;
};

const sumHoldingValuesForAccount = (accountId: string, holdings: Holding[]) => holdings.reduce(
  (total, holding) => total + (holding.security.price ?? 0) * holding.accountPositions
    .filter((position) => position.accountId === accountId)
    .reduce((positionTotal, position) => positionTotal + position.quantity, 0),
  0,
);

const getMonthlyNetIncomeForMonth = (
  sources: IncomeSource[], monthCode: string, assignedIncomeSourceIds: string[],
) => sources
  .filter((source) => source.status === 'Active' && assignedIncomeSourceIds.includes(source.id))
  .reduce((total, source) => {
    const period = source.periods.find((candidate) => candidate.startDate.slice(0, 7) <= monthCode &&
      (candidate.endDate?.slice(0, 7) ?? '9999-12') >= monthCode) ?? source.periods[source.periods.length - 1];
    return total + (period ? period.yearlyGrossAmount / 12 * (period.netPercentage / 100) : 0);
  }, 0);

const computeBankingValues = (
  account: Account,
  incomeSources: IncomeSource[],
  months: Array<{ name: string; dateCode: string }>,
) => {
  let currentStart = Number(account.startingBalance) || 0;
  const startCode = account.startDate?.slice(0, 7) ?? '2026-01';
  return months.map((month) => {
    if (month.dateCode < startCode) return { month: month.name, value: 0 };
    const record = account.monthlyRecords.find((candidate) => candidate.month.slice(0, 3) === month.name.slice(0, 3));
    if (!record) return { month: month.name, value: currentStart };
    const credit = account.type === 'Savings'
      ? Number(record.credit) || 0
      : getMonthlyNetIncomeForMonth(incomeSources, month.dateCode, account.assignedIncomeSourceIds ?? []) + (account.type === 'Checking' ? Number(record.additionalIncome) || 0 : 0);
    const expenses = Object.values(record.outflows ?? {}).reduce((total, amount) => total + (Number(amount) || 0), 0);
    currentStart = account.type === 'Savings'
      ? currentStart + credit - expenses - (Number(record.invest) || 0) + (Number(record.savings) || 0)
      : currentStart + credit - expenses - (Number(record.invest) || 0) - (Number(record.savings) || 0);
    return { month: month.name, value: currentStart };
  });
};

export const computePensionValues = (account: Account, months: Array<{ name: string }>) => {
  let startingAmount = Number(account.startingBalance) || 0;
  const monthlyGrowthRate = (Number(account.yieldRate) || 0) / 100 / 12;
  return months.map((month) => {
    const contribution = Number(
      account.monthlyRecords.find((record) => record.month.slice(0, 3) === month.name.slice(0, 3))?.invest,
    ) || 0;
    const growth = startingAmount * monthlyGrowthRate;
    const value = startingAmount + growth + contribution;
    startingAmount = value;
    return { month: month.name, value };
  });
};
const groupAccounts = (accounts: Account[]): NetWorthGroup[] => {
  const sorted = (items: Account[]) => [...items].sort((a, b) => a.name.localeCompare(b.name));
  return [
    { id: 'banking', label: 'Banking', accounts: sorted(accounts.filter((account) => account.type !== 'Investment')) },
    { id: 'taxable', label: 'Investing Taxable', accounts: sorted(accounts.filter((account) => account.type === 'Investment' && account.investmentAccountType === 'Taxable')) },
    { id: 'retirement', label: 'Investing Retirement', accounts: sorted(accounts.filter((account) => account.type === 'Investment' && (account.investmentAccountType === '401k' || account.investmentAccountType === 'IRA'))) },
    { id: 'hsa', label: 'Investing HSA', accounts: sorted(accounts.filter((account) => account.type === 'Investment' && account.investmentAccountType === 'HSA')) },
    { id: 'pension', label: 'Pension', accounts: sorted(accounts.filter((account) => account.type === 'Investment' && account.investmentAccountType === 'Pension')) },
  ].filter((group) => group.accounts.length > 0) as NetWorthGroup[];
};

function NetWorthByMonthChart({ rows, beginningNetWorth }: { rows: MonthlyNetWorthRow[]; beginningNetWorth: number }) {
  const width = 960;
  const height = 260;
  const padding = { top: 24, right: 24, bottom: 44, left: 72 };
  const firstFutureIndex = rows.findIndex((row) => row.isFuture);
  const currentIndex = firstFutureIndex === -1 ? rows.length - 1 : firstFutureIndex - 1;
  const actualRows = rows.slice(0, Math.max(currentIndex + 1, 0));
  const percentageGains = actualRows.slice(1).flatMap((row, index) => {
    const prior = actualRows[index].total;
    const gain = prior === 0 ? NaN : row.total / prior - 1;
    return Number.isFinite(gain) ? [gain] : [];
  });
  const averagePercentageGain = percentageGains.length
    ? percentageGains.reduce((sum, gain) => sum + gain, 0) / percentageGains.length
    : 0;
  const forecastTotals: number[] = [];
  let forecastValue = actualRows.length ? actualRows[actualRows.length - 1].total : 0;
  rows.forEach((row, index) => {
    if (index > currentIndex) forecastValue *= 1 + averagePercentageGain;
    forecastTotals.push(index <= currentIndex ? row.total : forecastValue);
  });
  const valuesForScale = [beginningNetWorth, ...forecastTotals].filter(Number.isFinite);
  const rawMin = Math.min(0, ...valuesForScale);
  const rawMax = Math.max(0, ...valuesForScale);
  const paddingAmount = Math.max(1, (rawMax - rawMin) * 0.08);
  const min = rawMin - paddingAmount;
  const max = rawMax + paddingAmount;
  const range = max - min;
  const yTicks = Array.from({ length: 7 }, (_, index) => min + index * range / 6);
  const formatAxisTick = (value: number) => value === 0 ? '$0' : value < 1000000 ? `$${Math.round(value / 1000)}K` : `$${(value / 1000000).toFixed(1)}M`;
  const x = (index: number) => padding.left + index * ((width - padding.left - padding.right) / Math.max(rows.length - 1, 1));
  const y = (value: number) => padding.top + (max - value) / range * (height - padding.top - padding.bottom);
  const actualPoints = actualRows.map((row, index) => `${x(index)},${y(row.total)}`).join(' ');
  const forecastPoints = rows.slice(currentIndex).map((row, offset) => `${x(currentIndex + offset)},${y(forecastTotals[currentIndex + offset])}`).join(' ');
  const referenceY = y(beginningNetWorth);

  return (
    <section aria-labelledby="net-worth-by-month-title" style={{ width: '50%', marginTop: 24 }}>
      <h2 id="net-worth-by-month-title" style={{ fontSize: '1.05rem', marginBottom: 8 }}>Net Worth by Month</h2>
      <div style={{ width: '100%', height: 320, overflowX: 'auto', border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: 16, background: 'var(--md-sys-color-surface)', padding: 12 }}>
        <svg role="img" aria-label="Net worth by month graph with green actuals and orange dashed forecast" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', minWidth: 680, width: '100%', height: '100%' }}>
          {yTicks.map((value, index) => <g key={value}><line x1={padding.left} x2={width - padding.right} y1={y(value)} y2={y(value)} stroke="var(--md-sys-color-outline-variant)" strokeWidth={index % 2 === 0 ? 1.25 : 0.75} /><text x={padding.left - 10} y={y(value) + 4} textAnchor="end" fill="var(--md-sys-color-on-surface-variant)" fontSize="11">{formatAxisTick(value)}</text></g>)}
          <line x1={padding.left} x2={width - padding.right} y1={referenceY} y2={referenceY} stroke="var(--md-sys-color-secondary)" strokeDasharray="6 5" />
          <text x={width - padding.right} y={referenceY - 8} textAnchor="end" fill="var(--md-sys-color-secondary)" fontSize="11">{formatMoney(beginningNetWorth)} reference</text>
          {actualPoints ? <polyline fill="none" stroke="#188038" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={actualPoints} /> : null}
          {forecastPoints ? <polyline fill="none" stroke="#d97706" strokeWidth="3" strokeDasharray="8 6" strokeLinejoin="round" strokeLinecap="round" points={forecastPoints} /> : null}
          {rows.map((row, index) => <g key={row.month}><circle cx={x(index)} cy={y(forecastTotals[index])} r="4" fill={row.isFuture ? '#d97706' : '#188038'}><title>{`${row.month}: ${formatMoney(forecastTotals[index])} ${row.isFuture ? 'Forecast' : 'Actual'}`}</title></circle><text x={x(index)} y={height - 18} textAnchor="middle" fill="var(--md-sys-color-on-surface-variant)" fontSize="11">{row.month.slice(0, 3)}</text></g>)}
        </svg>
        <p style={{ fontSize: '.75rem', margin: '4px 0 0' }}><span style={{ color: '#188038' }}>● Actual</span> <span style={{ color: '#d97706', marginLeft: 12 }}>┄ Forecast</span></p>
      </div>
    </section>
  );
}

function AccountTypeProgressBars({ row, accounts }: { row: MonthlyNetWorthRow; accounts: Account[] }) {
  const categories = [
    ['Banking Checking', accounts.filter((account) => account.type === 'Checking')],
    ['Banking Savings', accounts.filter((account) => account.type === 'Savings')],
    ['Taxable Investing', accounts.filter((account) => account.type === 'Investment' && account.investmentAccountType === 'Taxable')],
    ['Retirement Investing', accounts.filter((account) => account.type === 'Investment' && account.investmentAccountType !== 'Taxable')],
  ] as const;
  const values = categories.map(([label, categoryAccounts]) => ({ label, value: categoryAccounts.reduce((sum, account) => sum + (row.valuesByAccountId.get(account.id) ?? 0), 0) }));
  const max = Math.max(1, ...values.map((item) => Math.max(0, item.value)));
  return <section aria-labelledby="account-type-progress-title" style={{ width: '50%', marginTop: 24 }}><h2 id="account-type-progress-title" style={{ fontSize: '1.05rem', marginBottom: 8 }}>Current Month by Account Type</h2><div style={{ display: 'grid', gap: 14, border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: 16, background: 'var(--md-sys-color-surface)', padding: 18 }}>{values.map((item) => { const percentage = Math.max(0, item.value) / max * 100; return <div key={item.label}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '.85rem' }}><span>{item.label}</span><strong>{formatMoney(item.value)}</strong></div><div role="progressbar" aria-label={item.label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.max(0, item.value)} style={{ height: 12, marginTop: 6, borderRadius: 99, background: 'var(--md-sys-color-surface-container-high)', overflow: 'hidden' }}><div style={{ width: `${percentage}%`, height: '100%', borderRadius: 99, background: 'var(--md-sys-color-primary)' }} /></div></div>; })}</div></section>;
}
export function NetWorthPage({ accountRepository, incomeRepository, holdingRepository, netWorthRepository, mortgageTrackingOverride }: NetWorthPageProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [monthlyAccountValues, setMonthlyAccountValues] = useState<MonthlyAccountValues>({});
  const [beginningNetWorth, setBeginningNetWorth] = useState(0);
  const [netWorthGoal, setNetWorthGoal] = useState(0);
  const [trackMortgage, setTrackMortgage] = useState(false);
  const [mortgageSchedule, setMortgageSchedule] = useState<MortgageSchedule | null>(null);
  const [activeTab, setActiveTab] = useState<'net-worth' | 'mortgage'>('net-worth');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasDirtyValues, setHasDirtyValues] = useState(false);
  const [isSavingValues, setIsSavingValues] = useState(false);
  const [snapshotStatus, setSnapshotStatus] = useState('');

  useEffect(() => {
    let isCurrent = true;
    void Promise.all([
      accountRepository.listAccounts(), incomeRepository.listIncomeSources(),
      holdingRepository.listHoldings(), netWorthRepository.get(),
    ]).then(([nextAccounts, nextIncomeSources, nextHoldings, netWorth]) => {
      if (!isCurrent) return;
      setAccounts(nextAccounts);
      setIncomeSources(nextIncomeSources);
      setHoldings(nextHoldings);
      setMonthlyAccountValues(netWorth?.monthlyAccountValues ?? {});
      setBeginningNetWorth(netWorth?.beginningNetWorth ?? 0);
      setNetWorthGoal(netWorth?.netWorthGoal ?? 0);
      setTrackMortgage(mortgageTrackingOverride ?? netWorth?.trackMortgageInNetWorth ?? true);
      setMortgageSchedule(netWorth?.mortgageSchedule ?? null);
      setLoadError(null);
    }).catch(() => {
      if (isCurrent) setLoadError('Unable to load net worth data.');
    }).finally(() => {
      if (isCurrent) setIsLoading(false);
    });
    return () => { isCurrent = false; };
  }, [accountRepository, holdingRepository, incomeRepository, mortgageTrackingOverride, netWorthRepository]);

  useEffect(() => { if (mortgageTrackingOverride !== undefined) setTrackMortgage(mortgageTrackingOverride); }, [mortgageTrackingOverride]);

  const projectionYear = new Date().getFullYear();
  const months = useMemo(() => getProjectionMonths(projectionYear), [projectionYear]);
  const groups = useMemo(() => groupAccounts(accounts), [accounts]);
  const pensionValues = useMemo(() => new Map(accounts
    .filter((account) => account.investmentAccountType === 'Pension')
    .map((account) => [account.id, computePensionValues(account, months)])), [accounts, months]);
  const bankingValues = useMemo(() => new Map(accounts
    .filter((account) => account.type !== 'Investment')
    .map((account) => [account.id, computeBankingValues(account, incomeSources, months)])), [accounts, incomeSources, months]);

  const now = new Date();
  const currentMonth = months.find((month) => month.dateCode === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)?.name ?? months[0]?.name ?? '';
  const currentSourceValues = useMemo(() => {
    const values = new Map<string, number>();
    for (const account of accounts) {
      let value: number | undefined;
      if (account.type !== 'Investment') {
        value = bankingValues.get(account.id)?.find((item) => item.month === currentMonth)?.value;
      } else if (account.investmentAccountType === 'Pension') {
        value = pensionValues.get(account.id)?.find((item) => item.month === currentMonth)?.value;
      } else {
        const hasPositions = holdings.some((holding) => holding.accountPositions.some((position) => position.accountId === account.id));
        if (hasPositions) value = sumHoldingValuesForAccount(account.id, holdings);
      }
      if (value !== undefined && Number.isFinite(value)) values.set(account.id, value);
    }
    return values;
  }, [accounts, bankingValues, currentMonth, holdings, pensionValues]);

  const currentMonthCode = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const rows = useMemo<MonthlyNetWorthRow[]>(() => months.map((month) => {
    const valuesByAccountId = new Map<string, number>();
    for (const account of accounts) {
      const calculatedValue = account.investmentAccountType === 'Pension'
        ? pensionValues.get(account.id)?.find((item) => item.month === month.name)?.value ?? 0
        : account.type === 'Investment'
          ? holdings.some((holding) => holding.accountPositions.some((position) => position.accountId === account.id))
            ? sumHoldingValuesForAccount(account.id, holdings)
            : account.startingBalance
          : bankingValues.get(account.id)?.find((item) => item.month === month.name)?.value ?? 0;
      const storedValue = monthlyAccountValues[account.id]?.[month.name];
      const value = storedValue !== undefined && Number.isFinite(storedValue) ? storedValue : calculatedValue;
      valuesByAccountId.set(account.id, value);
    }
    const accountsTotal = [...valuesByAccountId.values()].reduce((sum, value) => sum + value, 0);
    const homeValue = mortgageEquityForMonth(mortgageSchedule, month.dateCode);
    return { month: month.name, dateCode: month.dateCode, isFuture: month.dateCode > currentMonthCode, valuesByAccountId, homeValue, total: accountsTotal + homeValue };
  }), [accounts, bankingValues, currentMonthCode, holdings, monthlyAccountValues, months, mortgageSchedule, pensionValues]);

  const currentRow = rows.find((row) => row.month === currentMonth) ?? rows[rows.length - 1];
  const currentNetWorth = currentRow?.total ?? 0;
  const varianceAmount = currentNetWorth - beginningNetWorth;
  const variancePercent = beginningNetWorth === 0 ? 0 : varianceAmount / beginningNetWorth * 100;

  const parseValue = (rawValue: string) => {
    const parsed = rawValue.trim() === '' ? 0 : Number(rawValue.replace(/[$,()]/g, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const updateValueLocally = (accountId: string, month: string, rawValue: string) => {
    const parsed = parseValue(rawValue);
    if (parsed === undefined) return;
    setMonthlyAccountValues((current) => ({
      ...current,
      [accountId]: { ...current[accountId], [month]: parsed },
    }));
    setHasDirtyValues(true);
    setSnapshotStatus('');
    setSaveError(null);
  };

  const takeSnapshot = () => {
    setMonthlyAccountValues((current) => {
      const next = { ...current };
      for (const account of accounts) {
        const sourceValue = currentSourceValues.get(account.id);
        const existingValue = current[account.id]?.[currentMonth];
        const value = sourceValue !== undefined && Number.isFinite(sourceValue)
          ? sourceValue
          : existingValue !== undefined && Number.isFinite(existingValue)
            ? existingValue
            : 0;
        next[account.id] = { ...current[account.id], [currentMonth]: value };
      }
      return next;
    });
    setHasDirtyValues(true);
    setSaveError(null);
    setSnapshotStatus(`${currentMonth} values updated from Banking and Investing. Save changes to persist them.`);
  };

  const saveValues = async () => {
    if (!hasDirtyValues || isSavingValues) return;
    setIsSavingValues(true);
    setSaveError(null);
    try {
      const saved = await netWorthRepository.putMonthlyAccountValues(monthlyAccountValues);
      setMonthlyAccountValues(saved.monthlyAccountValues ?? {});
      setHasDirtyValues(false);
      setSnapshotStatus('Net worth table values saved.');
    } catch {
      setSaveError('Unable to save net worth table changes. Your edits are still here; try again.');
    } finally {
      setIsSavingValues(false);
    }
  };
  if (isLoading) return <p className="status-copy">Loading net worth...</p>;
  if (loadError) return <p className="status-copy">{loadError}</p>;


  return (
    <section className="app-shell" style={{ paddingTop: 0 }}>
      <header className="page-header compact-header"><div className="page-header-text"><h1>Net Worth</h1><p>Review monthly net worth across Banking and Investing accounts.</p></div></header>
      <section className="toolbar" aria-label="Net worth views">
        <div className="filter-tabs" role="tablist" aria-label="Net worth views">
          <button aria-controls="net-worth-panel" aria-selected={activeTab === 'net-worth'} className="filter-tab" id="net-worth-tab" role="tab" type="button" onClick={() => setActiveTab('net-worth')}>Net Worth</button>
          {trackMortgage ? <button aria-controls="mortgage-schedule-panel" aria-selected={activeTab === 'mortgage'} className="filter-tab" id="mortgage-schedule-tab" role="tab" type="button" onClick={() => setActiveTab('mortgage')}>Mortgage Schedule</button> : null}
        </div>
      </section>
      {trackMortgage ? <div id="mortgage-schedule-panel" role="tabpanel" aria-labelledby="mortgage-schedule-tab" hidden={activeTab !== 'mortgage'}><MortgageSchedulePanel initial={mortgageSchedule} repository={netWorthRepository} onSaved={setMortgageSchedule} /></div> : null}<div id="net-worth-panel" role="tabpanel" aria-labelledby="net-worth-tab" hidden={activeTab !== 'net-worth'}>
      {accounts.length === 0 ? <section className="empty-state"><h2>Net Worth</h2><p>Add Banking and Investing accounts to see your monthly net worth snapshot.</p></section> : <>
      <section aria-label="Net worth summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, margin: '16px 0 24px' }}>
        {[
          { label: 'Beginning Net Worth', value: formatMoney(beginningNetWorth) },
          { label: `Current Net Worth (${currentMonth})`, value: formatMoney(currentNetWorth) },
          { label: 'Variance', value: formatMoney(varianceAmount), secondary: formatPercent(variancePercent) },
        ].map((item) => <div key={item.label} style={{ border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: 16, background: 'var(--md-sys-color-surface)', padding: 16 }}><p style={{ fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.08em' }}>{item.label}</p><strong style={{ display: 'block', marginTop: 6, fontSize: '1.15rem' }}>{item.value}</strong>{'secondary' in item ? <span style={{ display: 'block', marginTop: 4 }}>{item.secondary}</span> : null}</div>)}
      </section>
      {netWorthGoal > 0 ? <section aria-label="Net worth goal" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(160px, 1fr))', gap: 12, margin: '0 0 24px' }}><div><p>Goal</p><strong>{formatMoney(netWorthGoal)}</strong></div><div><p>Difference</p><strong>{formatMoney(netWorthGoal - currentNetWorth)}</strong></div><div><p>Percentage Complete</p><strong>{(Math.max(0, currentNetWorth) / netWorthGoal * 100).toFixed(1)}%</strong></div></section> : null}
      {saveError ? <p role="alert" style={{ color: 'var(--md-sys-color-error)', marginBottom: 12 }}>{saveError}</p> : null}
      <p aria-live="polite" style={{ margin: snapshotStatus ? '0 0 12px' : 0 }}>{snapshotStatus}</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
        <button className="secondary-action" type="button" disabled={!currentRow || accounts.length === 0 || isSavingValues} onClick={takeSnapshot}>
          <span className="material-symbols-outlined" aria-hidden="true">photo_camera</span>
          Snapshot
        </button>
        <button className="primary-action" type="button" disabled={!hasDirtyValues || isSavingValues} onClick={() => void saveValues()}>
          <span className="material-symbols-outlined" aria-hidden="true">save</span>
          {isSavingValues ? 'Saving...' : 'Save changes'}
        </button>
      </div>      <FinanceTable aria-label="Net worth table" className="net-worth-table" wrapperClassName="excel-table-fullwidth" style={{ width: '100%' }}>
        <thead><tr><FinanceTableHeaderCell rowSpan={2}>Month</FinanceTableHeaderCell>{groups.map((group) => <FinanceTableHeaderCell key={group.id} colSpan={group.accounts.length}>{group.label}</FinanceTableHeaderCell>)}{trackMortgage ? <FinanceTableHeaderCell rowSpan={2}>Home Value</FinanceTableHeaderCell> : null}<FinanceTableHeaderCell rowSpan={2}>Total</FinanceTableHeaderCell></tr>
          <tr>{groups.flatMap((group) => group.accounts.map((account) => <FinanceTableHeaderCell key={account.id} isEditable={account.type === 'Investment' && account.investmentAccountType !== 'Pension'}>{account.name}</FinanceTableHeaderCell>))}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.month} className={row.month === currentMonth ? 'excel-row-current' : undefined}>
          <td className="excel-bold-col">{row.month}</td>
          {groups.flatMap((group) => group.accounts.map((account) => <td key={`${row.month}-${account.id}`}>{account.type === 'Investment' && account.investmentAccountType !== 'Pension'
            ? row.isFuture ? <span aria-label={`${account.name} ${row.month} forecast hidden`}>—</span> : <FinanceMoneyCellInput aria-label={`${account.name} ${row.month} value`} value={row.valuesByAccountId.get(account.id) ?? 0} formatValue={formatMoney} onValueChange={(value) => updateValueLocally(account.id, row.month, value)} />
            : row.isFuture ? <span aria-label={`${account.name} ${row.month} forecast hidden`}>—</span> : <FinanceMoneyCellValue value={row.valuesByAccountId.get(account.id) ?? 0} formatValue={formatMoney} />}</td>))}
          {trackMortgage ? <td className="excel-bold-col">{row.isFuture ? <span>—</span> : <FinanceMoneyCellValue value={row.homeValue} formatValue={formatMoney} />}</td> : null}<td className="excel-bold-col">{row.isFuture ? <span>—</span> : <FinanceMoneyCellValue value={row.total} formatValue={formatMoney} />}</td>
        </tr>)}</tbody>
      </FinanceTable>

      <section style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <NetWorthByMonthChart rows={rows} beginningNetWorth={beginningNetWorth} />
        {currentRow ? <AccountTypeProgressBars row={currentRow} accounts={accounts} /> : null}
      </section>
      </>}</div>
    </section>
  );
}

