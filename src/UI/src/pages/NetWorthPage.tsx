import { useEffect, useMemo, useState } from 'react';
import { FinanceTable, FinanceTableHeaderCell } from '../components/FinanceTable';
import type { Account } from '../domain/account';
import { projectionMonthsList } from '../domain/account';
import type { AccountRepository } from '../domain/accountRepository';
import type { IncomeSource } from '../domain/incomeSource';
import type { IncomeSourceRepository } from '../domain/incomeSourceRepository';
import type { Holding } from '../domain/holding';
import type { HoldingRepository } from '../domain/holdingRepository';
import { readBeginningNetWorth } from '../domain/netWorthConfiguration';

type NetWorthPageProps = {
  accountRepository: AccountRepository;
  incomeRepository: IncomeSourceRepository;
  holdingRepository: HoldingRepository;
};

type NetWorthGroupId = 'banking' | 'taxable' | 'retirement' | 'hsa';

type NetWorthGroup = {
  id: NetWorthGroupId;
  label: string;
  accounts: Account[];
};

type AccountMonthValue = {
  month: string;
  value: number;
};

type MonthlyNetWorthRow = {
  month: string;
  valuesByAccountId: Map<string, number>;
  total: number;
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const formatMoney = (value: number) => (value < 0 ? `(${currencyFormatter.format(Math.abs(value))})` : currencyFormatter.format(value));

const formatPercent = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

const sumHoldingValuesForAccount = (accountId: string, holdings: Holding[]) =>
  holdings.reduce((total, holding) => {
    const holdingValue = (holding.security.price ?? 0) *
      holding.accountPositions
        .filter((position) => position.accountId === accountId)
        .reduce((positionTotal, position) => positionTotal + position.quantity, 0);
    return total + holdingValue;
  }, 0);

const getProjectionMonths = () =>
  projectionMonthsList.map((month, index) => ({
    name: month,
    dateCode: `2026-${String(index + 1).padStart(2, '0')}`,
  }));

const getMonthlyNetIncomeForMonth = (
  sources: IncomeSource[],
  monthCode: string,
  assignedIncomeSourceIds: string[],
): number => {
  let totalNet = 0;
  const assignedIds = new Set(assignedIncomeSourceIds);
  const activeSources = sources.filter((source) => source.status === 'Active' && assignedIds.has(source.id));

  for (const source of activeSources) {
    const period =
      source.periods.find((candidate) => {
        const startMonth = candidate.startDate.slice(0, 7);
        const endMonth = candidate.endDate ? candidate.endDate.slice(0, 7) : '9999-12';
        return startMonth <= monthCode && monthCode <= endMonth;
      }) ?? source.periods[source.periods.length - 1];

    if (period) {
      const monthlyGross = period.yearlyGrossAmount / 12;
      const monthlyNet = monthlyGross * (period.netPercentage / 100);
      totalNet += monthlyNet;
    }
  }

  return Math.round(totalNet);
};

const computeAccountMonthlyValues = (
  account: Account,
  incomeSources: IncomeSource[],
  projectionMonths: Array<{ name: string; dateCode: string }>,
  currentHoldingValue: number,
): AccountMonthValue[] => {
  let currentStart = 0;
  let balanceRealized = false;
  const startCode = account.startDate ? account.startDate.slice(0, 7) : '2026-01';
  const assignedIncomeSourceIds = account.assignedIncomeSourceIds || [];

  return projectionMonths.map((month) => {
    const record = account.monthlyRecords.find((candidate) => candidate.month === month.name);

    if (month.dateCode < startCode) {
      return { month: month.name, value: 0 };
    }

    if (account.type === 'Investment') {
      return {
        month: month.name,
        value: currentHoldingValue || account.startingBalance,
      };
    }

    if (!record) {
      return {
        month: month.name,
        value: balanceRealized ? currentStart : account.startingBalance,
      };
    }

    if (!balanceRealized) {
      currentStart = Number(account.startingBalance) || 0;
      balanceRealized = true;
    }

    const credit =
      account.type === 'Savings'
        ? Number(record.credit) || 0
        : getMonthlyNetIncomeForMonth(incomeSources, month.dateCode, assignedIncomeSourceIds);

    const expenses = Object.values(record.outflows || {}).reduce((total, amount) => total + (Number(amount) || 0), 0);
    const invest = Number(record.invest) || 0;
    const savings = Number(record.savings) || 0;

    const net =
      account.type === 'Savings'
        ? currentStart + credit - expenses - invest + savings
        : currentStart + credit - expenses - invest - savings;

    currentStart = net;

    return { month: month.name, value: net };
  });
};

const groupAccounts = (accounts: Account[]): NetWorthGroup[] => {
  const sortedByName = (items: Account[]) => [...items].sort((left, right) => left.name.localeCompare(right.name));

  const groups: NetWorthGroup[] = [
    {
      id: 'banking',
      label: 'Banking',
      accounts: sortedByName(accounts.filter((account) => account.type !== 'Investment')),
    },
    {
      id: 'taxable',
      label: 'Investing Taxable',
      accounts: sortedByName(
        accounts.filter(
          (account) => account.type === 'Investment' && account.investmentAccountType === 'Taxable',
        ),
      ),
    },
    {
      id: 'retirement',
      label: 'Investing Retirement',
      accounts: sortedByName(
        accounts.filter(
          (account) =>
            account.type === 'Investment' &&
            (account.investmentAccountType === '401k' || account.investmentAccountType === 'IRA'),
        ),
      ),
    },
    {
      id: 'hsa',
      label: 'Investing HSA',
      accounts: sortedByName(
        accounts.filter(
          (account) => account.type === 'Investment' && account.investmentAccountType === 'HSA',
        ),
      ),
    },
  ];

  return groups.filter((group) => group.accounts.length > 0);
};

export function NetWorthPage({ accountRepository, incomeRepository, holdingRepository }: NetWorthPageProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const beginningNetWorth = readBeginningNetWorth();

  useEffect(() => {
    let isCurrent = true;

    void (async () => {
      try {
        const [nextAccounts, nextIncomeSources, nextHoldings] = await Promise.all([
          accountRepository.listAccounts(),
          incomeRepository.listIncomeSources(),
          holdingRepository.listHoldings(),
        ]);

        if (!isCurrent) {
          return;
        }

        setAccounts(nextAccounts);
        setIncomeSources(nextIncomeSources);
        setHoldings(nextHoldings);
        setLoadError(null);
      } catch {
        if (isCurrent) {
          setLoadError('Unable to load net worth data.');
          setAccounts([]);
          setIncomeSources([]);
          setHoldings([]);
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [accountRepository, holdingRepository, incomeRepository]);

  const projectionMonths = useMemo(() => getProjectionMonths(), []);

  const groupedAccounts = useMemo(() => groupAccounts(accounts), [accounts]);

  const accountMonthValues = useMemo(() => {
    return new Map(
      accounts.map((account) => [
        account.id,
        computeAccountMonthlyValues(
          account,
          incomeSources,
          projectionMonths,
          sumHoldingValuesForAccount(account.id, holdings),
        ),
      ]),
    );
  }, [accounts, holdings, incomeSources, projectionMonths]);

  const monthlyRows = useMemo<MonthlyNetWorthRow[]>(() => {
    return projectionMonths.map((month) => {
      const valuesByAccountId = new Map<string, number>();
      let total = 0;

      for (const group of groupedAccounts) {
        for (const account of group.accounts) {
          const monthValue = accountMonthValues.get(account.id)?.find((item) => item.month === month.name)?.value ?? 0;
          valuesByAccountId.set(account.id, monthValue);
          total += monthValue;
        }
      }

      return {
        month: month.name,
        valuesByAccountId,
        total,
      };
    });
  }, [accountMonthValues, groupedAccounts, projectionMonths]);

  const currentMonthCode = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const currentMonthLabel = useMemo(() => {
    const currentProjectionMonth = projectionMonths.find((month) => month.dateCode === currentMonthCode) ?? projectionMonths[0];
    return currentProjectionMonth?.name ?? projectionMonths[projectionMonths.length - 1]?.name ?? '';
  }, [currentMonthCode, projectionMonths]);

  const currentMonthRow = useMemo(
    () => monthlyRows.find((row) => row.month === currentMonthLabel) ?? monthlyRows[monthlyRows.length - 1],
    [currentMonthLabel, monthlyRows],
  );

  const currentNetWorth = currentMonthRow?.total ?? 0;
  const varianceAmount = beginningNetWorth === undefined ? undefined : currentNetWorth - beginningNetWorth;
  const variancePercent =
    beginningNetWorth && beginningNetWorth !== 0 && varianceAmount !== undefined
      ? (varianceAmount / beginningNetWorth) * 100
      : undefined;

  if (isLoading) {
    return <p className="status-copy">Loading net worth...</p>;
  }

  if (loadError) {
    return <p className="status-copy">{loadError}</p>;
  }

  if (accounts.length === 0) {
    return (
      <section className="empty-state">
        <span className="material-symbols-outlined" aria-hidden="true">
          account_balance_wallet
        </span>
        <h2>Net Worth</h2>
        <p>Add Banking and Investing accounts to see your monthly net worth snapshot.</p>
      </section>
    );
  }

  return (
    <section className="app-shell" style={{ paddingTop: 0 }}>
      <header className="page-header compact-header">
        <div className="page-header-text">
          <h1>Net Worth</h1>
          <p>Review monthly net worth across Banking and Investing accounts.</p>
        </div>
      </header>

      <section
        aria-label="Net worth summary"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          margin: '16px 0 24px',
        }}
      >
        {[
          { label: 'Beginning Net Worth', value: beginningNetWorth === undefined ? 'Set in Configuration' : formatMoney(beginningNetWorth) },
          { label: `Current Net Worth (${currentMonthLabel})`, value: formatMoney(currentNetWorth) },
          { label: 'Variance Amt', value: varianceAmount === undefined ? 'n/a' : formatMoney(varianceAmount) },
          { label: 'Variance %', value: variancePercent === undefined ? 'n/a' : formatPercent(variancePercent) },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              border: '1px solid var(--md-sys-color-outline-variant)',
              borderRadius: '16px',
              background: 'var(--md-sys-color-surface)',
              padding: '16px',
            }}
          >
            <p style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {item.label}
            </p>
            <strong style={{ display: 'block', marginTop: 6, fontSize: '1.15rem', color: 'var(--md-sys-color-on-surface)' }}>
              {item.value}
            </strong>
          </div>
        ))}
      </section>

      {beginningNetWorth === undefined ? (
        <section
          style={{
            border: '1px solid var(--md-sys-color-outline-variant)',
            borderRadius: '16px',
            background: 'var(--md-sys-color-warning-container)',
            color: 'var(--md-sys-color-on-warning)',
            padding: '14px 16px',
            marginBottom: '16px',
          }}
        >
          Set Beginning Net Worth in Configuration to calculate variance.
        </section>
      ) : null}

      <FinanceTable
        aria-label="Net worth table"
        className="net-worth-table"
        wrapperClassName="excel-table-fullwidth"
        style={{ width: '100%' }}
      >
        <thead>
          <tr>
            <FinanceTableHeaderCell rowSpan={2}>Month</FinanceTableHeaderCell>
            {groupedAccounts.map((group) => (
              <FinanceTableHeaderCell key={group.id} colSpan={group.accounts.length}>
                {group.label}
              </FinanceTableHeaderCell>
            ))}
            <FinanceTableHeaderCell rowSpan={2}>Total</FinanceTableHeaderCell>
          </tr>
          <tr>
            {groupedAccounts.flatMap((group) =>
              group.accounts.map((account) => (
                <FinanceTableHeaderCell key={account.id}>{account.name}</FinanceTableHeaderCell>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {monthlyRows.map((row) => (
            <tr key={row.month} className={row.month === currentMonthLabel ? 'excel-row-current' : undefined}>
              <td className="excel-bold-col">{row.month}</td>
              {groupedAccounts.flatMap((group) =>
                group.accounts.map((account) => (
                  <td key={`${row.month}-${account.id}`}>{formatMoney(row.valuesByAccountId.get(account.id) ?? 0)}</td>
                )),
              )}
              <td className="excel-bold-col">{formatMoney(row.total)}</td>
            </tr>
          ))}
        </tbody>
      </FinanceTable>
    </section>
  );
}
