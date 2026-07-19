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
import type { InvestmentSnapshots, MortgageSchedule } from '../domain/netWorth';
import { MortgageSchedulePanel } from './MortgageSchedulePanel';
import type { NetWorthRepository } from '../domain/netWorthRepository';

type NetWorthPageProps = {
  accountRepository: AccountRepository;
  incomeRepository: IncomeSourceRepository;
  holdingRepository: HoldingRepository;
  netWorthRepository: NetWorthRepository;
};

type NetWorthGroup = {
  id: 'banking' | 'taxable' | 'retirement' | 'hsa';
  label: string;
  accounts: Account[];
};

type MonthlyNetWorthRow = {
  month: string;
  valuesByAccountId: Map<string, number>;
  total: number;
};

const DEBUG_BEGINNING_NET_WORTH = 100000;
const REFERENCE_NET_WORTH = 100000;
const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const compactCurrencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 0,
});
const formatMoney = (value: number) => value < 0
  ? `(${currencyFormatter.format(Math.abs(value))})`
  : currencyFormatter.format(value);
const formatPercent = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

const getProjectionMonths = () => projectionMonthsList.map((month, index) => ({
  name: month,
  dateCode: `2026-${String(index + 1).padStart(2, '0')}`,
}));

const mortgageEquityForMonth = (schedule: MortgageSchedule | null, monthCode: string) => {
  if (!schedule || monthCode < schedule.scheduleStartMonth) return 0;
  const elapsed = Math.max(0, (Number(monthCode.slice(0, 4)) - Number(schedule.scheduleStartMonth.slice(0, 4))) * 12 + Number(monthCode.slice(5, 7)) - Number(schedule.scheduleStartMonth.slice(5, 7)));
  const balance = Math.max(0, schedule.startingOutstandingMortgage - (schedule.monthlyPrincipalPayment + schedule.monthlyAdditionalPrincipalPayment) * (elapsed + 1));
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
    const record = account.monthlyRecords.find((candidate) => candidate.month === month.name);
    if (!record) return { month: month.name, value: currentStart };
    const credit = account.type === 'Savings'
      ? Number(record.credit) || 0
      : getMonthlyNetIncomeForMonth(incomeSources, month.dateCode, account.assignedIncomeSourceIds ?? []);
    const expenses = Object.values(record.outflows ?? {}).reduce((total, amount) => total + (Number(amount) || 0), 0);
    currentStart = account.type === 'Savings'
      ? currentStart + credit - expenses - (Number(record.invest) || 0) + (Number(record.savings) || 0)
      : currentStart + credit - expenses - (Number(record.invest) || 0) - (Number(record.savings) || 0);
    return { month: month.name, value: currentStart };
  });
};

const groupAccounts = (accounts: Account[]): NetWorthGroup[] => {
  const sorted = (items: Account[]) => [...items].sort((a, b) => a.name.localeCompare(b.name));
  return [
    { id: 'banking', label: 'Banking', accounts: sorted(accounts.filter((account) => account.type !== 'Investment')) },
    { id: 'taxable', label: 'Investing Taxable', accounts: sorted(accounts.filter((account) => account.type === 'Investment' && account.investmentAccountType === 'Taxable')) },
    { id: 'retirement', label: 'Investing Retirement', accounts: sorted(accounts.filter((account) => account.type === 'Investment' && (account.investmentAccountType === '401k' || account.investmentAccountType === 'IRA'))) },
    { id: 'hsa', label: 'Investing HSA', accounts: sorted(accounts.filter((account) => account.type === 'Investment' && account.investmentAccountType === 'HSA')) },
  ].filter((group) => group.accounts.length > 0) as NetWorthGroup[];
};

function AnnualNetWorthChart({ rows }: { rows: MonthlyNetWorthRow[] }) {
  const width = 960;
  const height = 260;
  const padding = { top: 24, right: 24, bottom: 44, left: 72 };
  const allValues = [...rows.map((row) => row.total), REFERENCE_NET_WORTH, 0];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = Math.max(max - min, 1);
  const x = (index: number) => padding.left + index * ((width - padding.left - padding.right) / Math.max(rows.length - 1, 1));
  const y = (value: number) => padding.top + (max - value) / range * (height - padding.top - padding.bottom);
  const points = rows.map((row, index) => `${x(index)},${y(row.total)}`).join(' ');
  const referenceY = y(REFERENCE_NET_WORTH);

  return (
    <section aria-labelledby="annual-net-worth-title" style={{ marginTop: 24 }}>
      <h2 id="annual-net-worth-title" style={{ fontSize: '1.05rem', marginBottom: 8 }}>Annual net worth</h2>
      <div style={{ overflowX: 'auto', border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: 16, background: 'var(--md-sys-color-surface)', padding: 12 }}>
        <svg role="img" aria-label="Annual net worth graph with a one hundred thousand dollar reference line" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', minWidth: 680, width: '100%' }}>
          <line x1={padding.left} x2={width - padding.right} y1={referenceY} y2={referenceY} stroke="var(--md-sys-color-outline)" strokeDasharray="6 5" />
          <text x={padding.left + 4} y={referenceY - 7} fill="var(--md-sys-color-on-surface-variant)" fontSize="12">$100k reference</text>
          <polyline fill="none" stroke="var(--md-sys-color-primary)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={points} />
          {rows.map((row, index) => (
            <g key={row.month}>
              <circle cx={x(index)} cy={y(row.total)} r="4" fill="var(--md-sys-color-primary)"><title>{`${row.month}: ${formatMoney(row.total)}`}</title></circle>
              <text x={x(index)} y={height - 18} textAnchor="middle" fill="var(--md-sys-color-on-surface-variant)" fontSize="11">{row.month.slice(0, 3)}</text>
            </g>
          ))}
          <text x={padding.left - 8} y={padding.top + 4} textAnchor="end" fill="var(--md-sys-color-on-surface-variant)" fontSize="11">{compactCurrencyFormatter.format(max)}</text>
          <text x={padding.left - 8} y={height - padding.bottom} textAnchor="end" fill="var(--md-sys-color-on-surface-variant)" fontSize="11">{compactCurrencyFormatter.format(min)}</text>
        </svg>
      </div>
    </section>
  );
}

export function NetWorthPage({ accountRepository, incomeRepository, holdingRepository, netWorthRepository }: NetWorthPageProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [investmentSnapshots, setInvestmentSnapshots] = useState<InvestmentSnapshots>({});
  const [trackMortgage, setTrackMortgage] = useState(false);
  const [mortgageSchedule, setMortgageSchedule] = useState<MortgageSchedule | null>(null);
  const [activeTab, setActiveTab] = useState<'net-worth' | 'mortgage'>('net-worth');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasDirtySnapshots, setHasDirtySnapshots] = useState(false);
  const [isSavingSnapshots, setIsSavingSnapshots] = useState(false);

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
      const snapshots = netWorth?.investmentSnapshots ?? {};

      setInvestmentSnapshots(snapshots);
      setTrackMortgage(netWorth?.trackMortgageInNetWorth ?? false);
      setMortgageSchedule(netWorth?.mortgageSchedule ?? null);
      setLoadError(null);
    }).catch(() => {
      if (isCurrent) setLoadError('Unable to load net worth data.');
    }).finally(() => {
      if (isCurrent) setIsLoading(false);
    });
    return () => { isCurrent = false; };
  }, [accountRepository, holdingRepository, incomeRepository, netWorthRepository]);

  const months = useMemo(getProjectionMonths, []);
  const groups = useMemo(() => groupAccounts(accounts), [accounts]);
  const bankingValues = useMemo(() => new Map(accounts
    .filter((account) => account.type !== 'Investment')
    .map((account) => [account.id, computeBankingValues(account, incomeSources, months)])), [accounts, incomeSources, months]);

  const rows = useMemo<MonthlyNetWorthRow[]>(() => months.map((month) => {
    const valuesByAccountId = new Map<string, number>();
    for (const account of accounts) {
      const value = account.type === 'Investment'
        ? investmentSnapshots[account.id]?.[month.name] ?? (sumHoldingValuesForAccount(account.id, holdings) || account.startingBalance)
        : bankingValues.get(account.id)?.find((item) => item.month === month.name)?.value ?? 0;
      valuesByAccountId.set(account.id, value);
    }
    const accountsTotal = [...valuesByAccountId.values()].reduce((sum, value) => sum + value, 0);
    return { month: month.name, valuesByAccountId, total: accountsTotal + mortgageEquityForMonth(mortgageSchedule, month.dateCode) };
  }), [accounts, bankingValues, holdings, investmentSnapshots, months, mortgageSchedule]);

  const now = new Date();
  const currentMonth = months.find((month) => month.dateCode === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)?.name ?? months[0]?.name ?? '';
  const currentRow = rows.find((row) => row.month === currentMonth) ?? rows[rows.length - 1];
  const currentNetWorth = currentRow?.total ?? 0;
  const varianceAmount = currentNetWorth - DEBUG_BEGINNING_NET_WORTH;
  const variancePercent = varianceAmount / DEBUG_BEGINNING_NET_WORTH * 100;

  const parseSnapshot = (rawValue: string) => {
    const parsed = rawValue.trim() === '' ? 0 : Number(rawValue.replace(/[$,()]/g, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const updateSnapshotLocally = (accountId: string, month: string, rawValue: string) => {
    const parsed = parseSnapshot(rawValue);
    if (parsed === undefined) return;
    setInvestmentSnapshots((current) => ({
      ...current,
      [accountId]: { ...current[accountId], [month]: parsed },
    }));
    setHasDirtySnapshots(true);
    setSaveError(null);
  };

  const saveSnapshots = async () => {
    if (!hasDirtySnapshots || isSavingSnapshots) return;
    setIsSavingSnapshots(true);
    setSaveError(null);
    try {
      const saved = await netWorthRepository.putInvestmentSnapshots(investmentSnapshots);
      setInvestmentSnapshots(saved.investmentSnapshots ?? {});
      setHasDirtySnapshots(false);
    } catch {
      setSaveError('Unable to save snapshot changes. Your edits are still here; try again.');
    } finally {
      setIsSavingSnapshots(false);
    }
  };
  if (isLoading) return <p className="status-copy">Loading net worth...</p>;
  if (loadError) return <p className="status-copy">{loadError}</p>;


  return (
    <section className="app-shell" style={{ paddingTop: 0 }}>
      <header className="page-header compact-header"><div className="page-header-text"><h1>Net Worth</h1><p>Review monthly net worth across Banking and Investing accounts.</p></div></header>
      <div role="tablist" aria-label="Net worth views"><button id="net-worth-tab" role="tab" aria-controls="net-worth-panel" aria-selected={activeTab === 'net-worth'} onClick={() => setActiveTab('net-worth')}>Net Worth</button>{trackMortgage ? <button id="mortgage-schedule-tab" role="tab" aria-controls="mortgage-schedule-panel" aria-selected={activeTab === 'mortgage'} onClick={() => setActiveTab('mortgage')}>Mortgage Schedule</button> : null}</div>
      {activeTab === 'mortgage' && trackMortgage ? <div id="mortgage-schedule-panel" role="tabpanel" aria-labelledby="mortgage-schedule-tab"><MortgageSchedulePanel initial={mortgageSchedule} repository={netWorthRepository} onSaved={setMortgageSchedule} /></div> : <div id="net-worth-panel" role="tabpanel" aria-labelledby="net-worth-tab">
      {accounts.length === 0 ? <section className="empty-state"><h2>Net Worth</h2><p>Add Banking and Investing accounts to see your monthly net worth snapshot.</p></section> : <>
      <section aria-label="Net worth summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, margin: '16px 0 24px' }}>
        {[
          { label: 'Beginning Net Worth', value: formatMoney(DEBUG_BEGINNING_NET_WORTH) },
          { label: `Current Net Worth (${currentMonth})`, value: formatMoney(currentNetWorth) },
          { label: 'Variance Amt', value: formatMoney(varianceAmount) },
          { label: 'Variance %', value: formatPercent(variancePercent) },
        ].map((item) => <div key={item.label} style={{ border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: 16, background: 'var(--md-sys-color-surface)', padding: 16 }}><p style={{ fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.08em' }}>{item.label}</p><strong style={{ display: 'block', marginTop: 6, fontSize: '1.15rem' }}>{item.value}</strong></div>)}
      </section>
      {saveError ? <p role="alert" style={{ color: 'var(--md-sys-color-error)', marginBottom: 12 }}>{saveError}</p> : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="primary-action" type="button" disabled={!hasDirtySnapshots || isSavingSnapshots} onClick={() => void saveSnapshots()}>
          <span className="material-symbols-outlined" aria-hidden="true">save</span>
          {isSavingSnapshots ? 'Saving...' : 'Save changes'}
        </button>
      </div>      <FinanceTable aria-label="Net worth table" className="net-worth-table" wrapperClassName="excel-table-fullwidth" style={{ width: '100%' }}>
        <thead><tr><FinanceTableHeaderCell rowSpan={2}>Month</FinanceTableHeaderCell>{groups.map((group) => <FinanceTableHeaderCell key={group.id} colSpan={group.accounts.length}>{group.label}</FinanceTableHeaderCell>)}<FinanceTableHeaderCell rowSpan={2}>Total</FinanceTableHeaderCell></tr>
          <tr>{groups.flatMap((group) => group.accounts.map((account) => <FinanceTableHeaderCell key={account.id} isEditable={account.type === 'Investment'}>{account.name}</FinanceTableHeaderCell>))}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.month} className={row.month === currentMonth ? 'excel-row-current' : undefined}>
          <td className="excel-bold-col">{row.month}</td>
          {groups.flatMap((group) => group.accounts.map((account) => <td key={`${row.month}-${account.id}`}>{account.type === 'Investment'
            ? <FinanceMoneyCellInput aria-label={`${account.name} ${row.month} snapshot`} value={row.valuesByAccountId.get(account.id) ?? 0} formatValue={formatMoney} onValueChange={(value) => updateSnapshotLocally(account.id, row.month, value)} />
            : <FinanceMoneyCellValue value={row.valuesByAccountId.get(account.id) ?? 0} formatValue={formatMoney} />}</td>))}
          <td className="excel-bold-col"><FinanceMoneyCellValue value={row.total} formatValue={formatMoney} /></td>
        </tr>)}</tbody>
      </FinanceTable>

      <AnnualNetWorthChart rows={rows} />
      </>}</div>}
    </section>
  );
}













