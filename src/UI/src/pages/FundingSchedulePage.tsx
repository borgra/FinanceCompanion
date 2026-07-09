import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FinanceMoneyCellInput,
  FinanceMoneyCellValue,
  FinanceTable,
  FinanceTableHeaderCell,
} from '../components/FinanceTable';
import type { AccountRepository } from '../domain/accountRepository';
import type { IncomeSource } from '../domain/incomeSource';
import type { IncomeSourceRepository } from '../domain/incomeSourceRepository';
import {
  defaultMonthlyRecords,
  projectionMonthsList,
  toAccountDraft,
  type Account,
  type AccountDraft,
  type InvestmentBrokerage,
  type InvestmentAccountType,
  type MonthlyRecord,
} from '../domain/account';

type FundingSchedulePageProps = {
  accountRepository: AccountRepository;
  incomeRepository: IncomeSourceRepository;
};

type InvestmentGroupId = 'taxable' | 'retirement' | 'hsa';

type ScheduleMetricScope = 'all' | InvestmentGroupId;

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const payrollDeductibleTypes: InvestmentAccountType[] = ['401k', 'HSA'];
const maxAccountNameLength = 100;
const maxAccountBalance = 999_999_999.99;
const currentProjectionMonthIndex = Math.max(
  0,
  Math.min(projectionMonthsList.length - 1, new Date().getMonth()),
);
const investmentGroups: Array<{
  id: InvestmentGroupId;
  label: string;
  description: string;
}> = [
  {
    id: 'taxable',
    label: 'After-Tax Accounts',
    description: 'Funded from after-tax investment dollars available.',
  },
  {
    id: 'retirement',
    label: 'Before-Tax Accounts',
    description: 'Driven by planned contributions and employer match rules.',
  },
  {
    id: 'hsa',
    label: 'HSA',
    description: 'Driven by planned contributions and employer match rules.',
  },
];

type InvestmentAccountDraft = {
  name: string;
  investmentAccountType: InvestmentAccountType;
  investmentBrokerage: InvestmentBrokerage;
  manageHoldings: boolean;
  startingBalance: string;
  startDate: string;
  yieldRate: string;
  yearlyContribution: string;
  employerIncomeSourceId: string;
  employerMatchRatePercent: string;
  employerMatchCapPercent: string;
  employerMatchStartDate: string;
  employerMatchAmount: string;
  employerMatchPercent: string;
};

const brokerageOptions: Array<{
  value: InvestmentBrokerage;
  label: string;
  icon: string;
  className: string;
}> = [
  { value: 'Fidelity', label: 'Fidelity', icon: 'F', className: 'brokerage-fidelity' },
  { value: 'eTrade', label: 'eTrade', icon: 'E', className: 'brokerage-etrade' },
  { value: 'Robinhood', label: 'Robinhood', icon: 'R', className: 'brokerage-robinhood' },
];

const formatMoney = (amount: number) => {
  if (amount === 0) return '$   -   ';
  return currencyFormatter.format(amount);
};

const formatPercent = (value: number | undefined) =>
  value === undefined ? '-' : `${value.toFixed(1)}%`;

const getBrokerageOption = (brokerage: InvestmentBrokerage | undefined) =>
  brokerageOptions.find((option) => option.value === brokerage) ?? brokerageOptions[0];

const parseMoneyInput = (value: string) => Number(value.replace(/[$,\s]/g, '')) || 0;

const toMonthInputValue = (dateValue: string) => dateValue.slice(0, 7);

const toStoredMonthStart = (monthValue: string) => `${monthValue || '2026-01'}-01`;

const isPayrollDeductible = (account: Account) =>
  account.type === 'Investment' &&
  payrollDeductibleTypes.includes(account.investmentAccountType || 'Taxable');

const isAfterTaxAssignable = (account: Account) =>
  account.type === 'Investment' &&
  (account.investmentAccountType === 'Taxable' || account.investmentAccountType === 'IRA');

const getInvestmentGroupIdForType = (
  investmentAccountType: InvestmentAccountType | undefined,
): InvestmentGroupId => {
  if (investmentAccountType === 'HSA') return 'hsa';
  if (investmentAccountType === 'Taxable' || investmentAccountType === 'IRA') return 'taxable';
  return 'retirement';
};

const getInvestmentGroupId = (account: Account): InvestmentGroupId =>
  getInvestmentGroupIdForType(account.investmentAccountType);

const getRecordForMonth = (account: Account, month: string): MonthlyRecord =>
  account.monthlyRecords.find((record) => record.month === month) ?? {
    month,
    credit: 0,
    outflows: {},
    invest: 0,
    savings: 0,
  };

const ensureScheduleRecords = (account: Account) => {
  const existingRecords = new Map(account.monthlyRecords.map((record) => [record.month, record]));
  return projectionMonthsList.map(
    (month) =>
      existingRecords.get(month) ?? {
        month,
        credit: 0,
        outflows: {},
        invest: 0,
        savings: 0,
      },
  );
};

const emptyInvestmentDraft = (): InvestmentAccountDraft => ({
  name: '',
  investmentAccountType: 'Taxable',
  investmentBrokerage: 'Fidelity',
  manageHoldings: true,
  startingBalance: '',
  startDate: '2026-01-01',
  yieldRate: '',
  yearlyContribution: '',
  employerIncomeSourceId: '',
  employerMatchRatePercent: '100',
  employerMatchCapPercent: '3',
  employerMatchStartDate: '',
  employerMatchAmount: '',
  employerMatchPercent: '0',
});

const accountToInvestmentDraft = (account: Account): InvestmentAccountDraft => ({
  name: account.name,
  investmentAccountType: account.investmentAccountType || 'Taxable',
  investmentBrokerage: account.investmentBrokerage || 'Fidelity',
  manageHoldings: account.manageHoldings ?? account.investmentAccountType !== '401k',
  startingBalance: String(account.startingBalance),
  startDate: account.startDate || '2026-01-01',
  yieldRate: String(account.yieldRate || 0),
  yearlyContribution:
    account.yearlyContribution !== undefined ? String(account.yearlyContribution) : '',
  employerIncomeSourceId: account.employerIncomeSourceId || '',
  employerMatchRatePercent:
    account.employerMatchRatePercent !== undefined
      ? String(account.employerMatchRatePercent)
      : '100',
  employerMatchCapPercent:
    account.employerMatchCapPercent !== undefined
      ? String(account.employerMatchCapPercent)
      : '3',
  employerMatchStartDate: account.employerMatchStartDate || '',
  employerMatchAmount:
    account.employerMatchAmount !== undefined
      ? String(account.employerMatchAmount)
      : account.employerMatchPercent !== undefined && account.yearlyContribution !== undefined
        ? String((account.yearlyContribution * account.employerMatchPercent) / 100)
        : '',
  employerMatchPercent:
    account.employerMatchPercent !== undefined ? String(account.employerMatchPercent) : '0',
});

const draftToAccountDraft = (draft: InvestmentAccountDraft): AccountDraft => ({
  name: draft.name.trim(),
  type: 'Investment',
  startingBalance: String(Number(draft.startingBalance) || 0),
  startDate: draft.startDate || '2026-01-01',
  yieldRate: String(Number(draft.yieldRate) || 0),
  assignedIncomeSourceIds: [],
  savingsAccountId: '',
  investmentAccountType: draft.investmentAccountType,
  investmentBrokerage: draft.investmentBrokerage,
  manageHoldings: draft.manageHoldings,
  yearlyContribution: String(Number(draft.yearlyContribution) || 0),
  employerIncomeSourceId: draft.employerIncomeSourceId,
  employerMatchRatePercent: String(Number(draft.employerMatchRatePercent) || 0),
  employerMatchCapPercent: String(Number(draft.employerMatchCapPercent) || 0),
  employerMatchStartDate: draft.employerMatchStartDate,
  employerMatchAmount: String(Number(draft.employerMatchAmount) || 0),
  employerMatchPercent: draft.employerMatchPercent,
  columns: [],
  monthlyRecords: defaultMonthlyRecords(),
});

const getIncomeSourceBasePay = (source: IncomeSource | undefined) => {
  if (!source) return 0;
  const sortedPeriods = [...source.periods].sort((left, right) =>
    left.startDate.localeCompare(right.startDate),
  );
  return sortedPeriods[sortedPeriods.length - 1]?.yearlyGrossAmount ?? 0;
};

const getTotalGrossIncome = (sources: IncomeSource[]) =>
  sources.reduce((sum, source) => sum + getIncomeSourceBasePay(source), 0);

const getTotalNetIncome = (sources: IncomeSource[]) =>
  sources.reduce((sum, source) => {
    const gross = getIncomeSourceBasePay(source);
    const sortedPeriods = [...source.periods].sort((left, right) =>
      left.startDate.localeCompare(right.startDate),
    );
    const netPercentage = sortedPeriods[sortedPeriods.length - 1]?.netPercentage ?? 0;
    return sum + gross * (netPercentage / 100);
  }, 0);

const getEmployerMatchDefaultStartDate = (source: IncomeSource | undefined) => {
  if (!source?.periods.length) return '';
  const firstPeriod = [...source.periods].sort((left, right) =>
    left.startDate.localeCompare(right.startDate),
  )[0];
  const start = new Date(`${firstPeriod.startDate}T00:00:00.000Z`);
  start.setUTCFullYear(start.getUTCFullYear() + 1);
  return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-01`;
};

const monthToDateCode = (month: string) => {
  const [monthName, shortYear] = month.split('-');
  const monthIndex = [
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
  ].indexOf(monthName);
  return `20${shortYear}-${String(monthIndex + 1).padStart(2, '0')}`;
};

const calculateEmployerMatch = (
  account: Account,
  incomeSources: IncomeSource[],
  month: string,
) => {
  if (!isPayrollDeductible(account)) return 0;
  const matchStartCode = account.employerMatchStartDate?.slice(0, 7);
  if (matchStartCode && monthToDateCode(month) < matchStartCode) return 0;

  if (!account.employerIncomeSourceId) {
    return account.employerMatchAmount ?? 0;
  }

  const employer = incomeSources.find((source) => source.id === account.employerIncomeSourceId);
  const basePay = getIncomeSourceBasePay(employer);
  const employeeAnnualContribution = account.yearlyContribution || 0;
  const matchableContribution = Math.min(
    employeeAnnualContribution,
    basePay * ((account.employerMatchCapPercent || 0) / 100),
  );

  return (matchableContribution * ((account.employerMatchRatePercent || 0) / 100)) / 12;
};

const getMonthlyContribution = (
  account: Account,
  month: string,
  incomeSources: IncomeSource[],
) => {
  if (isPayrollDeductible(account)) {
    return (account.yearlyContribution || 0) / 12 + calculateEmployerMatch(account, incomeSources, month);
  }
  return getRecordForMonth(account, month).invest;
};

const getScopeContribution = (
  accounts: Account[],
  month: string,
  incomeSources: IncomeSource[],
  scope: ScheduleMetricScope,
) =>
  accounts
    .filter((account) => scope === 'all' || getInvestmentGroupId(account) === scope)
    .reduce((sum, account) => sum + getMonthlyContribution(account, month, incomeSources), 0);

const getAccountCurrentContribution = (account: Account, incomeSources: IncomeSource[]) =>
  projectionMonthsList
    .slice(0, currentProjectionMonthIndex + 1)
    .reduce((sum, month) => sum + getMonthlyContribution(account, month, incomeSources), 0);

export function FundingSchedulePage({
  accountRepository,
  incomeRepository,
}: FundingSchedulePageProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [draftAccounts, setDraftAccounts] = useState<Account[]>([]);
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<InvestmentGroupId>('taxable');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountDraft, setAccountDraft] =
    useState<InvestmentAccountDraft>(() => emptyInvestmentDraft());
  const [investmentAccountOrder, setInvestmentAccountOrder] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [accountError, setAccountError] = useState<string>();

  const syncInvestmentAccountOrder = useCallback((loadedAccounts: Account[]) => {
    const investmentIds = loadedAccounts
      .filter((account) => account.type === 'Investment')
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((account) => account.id);

    setInvestmentAccountOrder((currentOrder) => [
      ...currentOrder.filter((id) => investmentIds.includes(id)),
      ...investmentIds.filter((id) => !currentOrder.includes(id)),
    ]);
  }, []);

  const refreshAccounts = useCallback(async () => {
    const loadedAccounts = await accountRepository.listAccounts();
    setAccounts(loadedAccounts);
    setDraftAccounts(loadedAccounts.map((account) => ({ ...account })));
    syncInvestmentAccountOrder(loadedAccounts);
  }, [accountRepository, syncInvestmentAccountOrder]);

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      setLoadError(undefined);
      try {
        const [loadedAccounts, loadedIncomeSources] = await Promise.all([
          accountRepository.listAccounts(),
          incomeRepository.listIncomeSources(),
        ]);
        setAccounts(loadedAccounts);
        setDraftAccounts(loadedAccounts.map((account) => ({ ...account })));
        syncInvestmentAccountOrder(loadedAccounts);
        setIncomeSources(loadedIncomeSources.filter((source) => source.status === 'Active'));
      } catch {
        setLoadError('Investment accounts could not be loaded. Try again.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [accountRepository, incomeRepository, syncInvestmentAccountOrder]);

  const checkingAccounts = useMemo(
    () => accounts.filter((account) => account.type === 'Checking'),
    [accounts],
  );
  const investmentAccounts = useMemo(
    () => {
      const orderIndex = new Map(investmentAccountOrder.map((id, index) => [id, index]));
      return draftAccounts
        .filter((account) => account.type === 'Investment')
        .sort((left, right) => {
          const leftIndex = orderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER;
          const rightIndex = orderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER;
          return leftIndex - rightIndex || left.name.localeCompare(right.name);
        });
    },
    [draftAccounts, investmentAccountOrder],
  );
  const investmentAccountsByGroup = useMemo(
    () => ({
      taxable: investmentAccounts.filter((account) => getInvestmentGroupId(account) === 'taxable'),
      retirement: investmentAccounts.filter((account) => getInvestmentGroupId(account) === 'retirement'),
      hsa: investmentAccounts.filter((account) => getInvestmentGroupId(account) === 'hsa'),
    }),
    [investmentAccounts],
  );
  const nonPayrollInvestmentAccounts = useMemo(
    () => investmentAccounts.filter(isAfterTaxAssignable),
    [investmentAccounts],
  );
  const annualGrossIncome = useMemo(() => getTotalGrossIncome(incomeSources), [incomeSources]);
  const annualNetIncome = useMemo(() => getTotalNetIncome(incomeSources), [incomeSources]);
  const monthlyGrossIncome = annualGrossIncome / 12;
  const monthlyNetIncome = annualNetIncome / 12;
  const activeGroup = investmentGroups.find((group) => group.id === activeGroupId) ?? investmentGroups[0];
  const activeInvestmentAccounts = investmentAccountsByGroup[activeGroup.id];
  const showsRemainingColumn = activeGroup.id === 'taxable';

  const yearlyMetrics = useMemo(() => {
    const totalByScope = (scope: ScheduleMetricScope) =>
      projectionMonthsList.reduce(
        (sum, month) => sum + getScopeContribution(investmentAccounts, month, incomeSources, scope),
        0,
      );

    return {
      all: totalByScope('all'),
      taxable: totalByScope('taxable'),
      retirement: totalByScope('retirement'),
      hsa: totalByScope('hsa'),
    };
  }, [incomeSources, investmentAccounts]);

  const updateNonPayrollAllocation = (accountId: string, month: string, value: string) => {
    const available = checkingAccounts.reduce(
      (sum, account) => sum + getRecordForMonth(account, month).invest,
      0,
    );
    const otherAssigned = nonPayrollInvestmentAccounts
      .filter((account) => account.id !== accountId)
      .reduce((sum, account) => sum + getRecordForMonth(account, month).invest, 0);
    const nextValue = Math.min(
      parseMoneyInput(value),
      Math.max(0, available - otherAssigned),
    );
    setDraftAccounts((currentAccounts) =>
      currentAccounts.map((account) => {
        if (account.id !== accountId) return account;
        const records = ensureScheduleRecords(account).map((record) =>
          record.month === month ? { ...record, invest: nextValue } : record,
        );
        return { ...account, monthlyRecords: records };
      }),
    );
  };

  const fillDownNonPayrollAllocation = (
    accountId: string,
    startMonthIndex: number,
    value: string,
  ) => {
    const parsedValue = parseMoneyInput(value);

    setDraftAccounts((currentAccounts) =>
      currentAccounts.map((account) => {
        if (account.id !== accountId) return account;

        const records = ensureScheduleRecords(account).map((record, rowIndex) => {
          if (rowIndex < startMonthIndex) return record;

          const available = checkingAccounts.reduce(
            (sum, checkingAccount) =>
              sum + getRecordForMonth(checkingAccount, record.month).invest,
            0,
          );
          const otherAssigned = currentAccounts
            .filter(
              (candidate) =>
                candidate.id !== accountId && isAfterTaxAssignable(candidate),
            )
            .reduce(
              (sum, candidate) =>
                sum + getRecordForMonth(candidate, record.month).invest,
              0,
            );
          const nextValue = Math.min(parsedValue, Math.max(0, available - otherAssigned));

          return { ...record, invest: nextValue };
        });

        return { ...account, monthlyRecords: records };
      }),
    );
  };

  const moveInvestmentAccountColumn = (accountId: string, direction: -1 | 1) => {
    const visibleIds = activeInvestmentAccounts.map((account) => account.id);
    const visibleIndex = visibleIds.indexOf(accountId);
    const nextVisibleIndex = visibleIndex + direction;
    if (
      visibleIndex < 0 ||
      nextVisibleIndex < 0 ||
      nextVisibleIndex >= visibleIds.length
    ) {
      return;
    }

    const swapWithId = visibleIds[nextVisibleIndex];
    setInvestmentAccountOrder((currentOrder) => {
      const knownIds = investmentAccounts.map((account) => account.id);
      const nextOrder = [
        ...currentOrder.filter((id) => knownIds.includes(id)),
        ...knownIds.filter((id) => !currentOrder.includes(id)),
      ];
      const currentIndex = nextOrder.indexOf(accountId);
      const swapIndex = nextOrder.indexOf(swapWithId);
      if (currentIndex < 0 || swapIndex < 0) return currentOrder;

      [nextOrder[currentIndex], nextOrder[swapIndex]] = [
        nextOrder[swapIndex],
        nextOrder[currentIndex],
      ];
      return nextOrder;
    });
  };

  const openCreateAccountModal = () => {
    setEditingAccountId(null);
    setAccountDraft(emptyInvestmentDraft());
    setAccountError(undefined);
    setIsAccountModalOpen(true);
  };

  const openEditAccountModal = (account: Account) => {
    setEditingAccountId(account.id);
    setAccountDraft(accountToInvestmentDraft(account));
    setAccountError(undefined);
    setIsAccountModalOpen(true);
  };

  const closeAccountModal = () => {
    setEditingAccountId(null);
    setAccountDraft(emptyInvestmentDraft());
    setAccountError(undefined);
    setIsAccountModalOpen(false);
  };

  const saveInvestmentAccount = async () => {
    const name = accountDraft.name.trim();
    const startingBalance = Number(accountDraft.startingBalance);
    const matchRate = Number(accountDraft.employerMatchRatePercent);
    const matchCap = Number(accountDraft.employerMatchCapPercent);
    const employerMatchAmount = Number(accountDraft.employerMatchAmount);
    const yearlyContribution = Number(accountDraft.yearlyContribution);
    const needsPayrollSettings = payrollDeductibleTypes.includes(
      accountDraft.investmentAccountType,
    );

    if (
      !name ||
      name.length > maxAccountNameLength ||
      Number.isNaN(startingBalance) ||
      startingBalance < 0 ||
      startingBalance > maxAccountBalance ||
      (needsPayrollSettings &&
        (Number.isNaN(yearlyContribution) ||
          yearlyContribution < 0 ||
          (accountDraft.employerIncomeSourceId &&
            (Number.isNaN(matchRate) ||
              matchRate < 0 ||
              Number.isNaN(matchCap) ||
              matchCap < 0)) ||
          (!accountDraft.employerIncomeSourceId &&
            (Number.isNaN(employerMatchAmount) || employerMatchAmount < 0))))
    ) {
      return;
    }

    setIsSaving(true);
    setAccountError(undefined);
    try {
      const payload = draftToAccountDraft(accountDraft);
      if (editingAccountId) {
        const existingAccount = investmentAccounts.find((account) => account.id === editingAccountId);
        await accountRepository.updateAccount(editingAccountId, {
          ...payload,
          monthlyRecords: existingAccount
            ? ensureScheduleRecords(existingAccount)
            : defaultMonthlyRecords(),
        });
      } else {
        await accountRepository.createAccount(payload);
      }
      await refreshAccounts();
      setActiveGroupId(getInvestmentGroupIdForType(accountDraft.investmentAccountType));
      closeAccountModal();
    } catch {
      setAccountError('Investment account could not be saved. Try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteInvestmentAccount = async (account: Account) => {
    if (!window.confirm(`Delete ${account.name}?`)) return;
    setIsSaving(true);
    setAccountError(undefined);
    try {
      await accountRepository.deleteAccount(account.id);
      await refreshAccounts();
    } catch {
      setAccountError('Investment account could not be deleted. Try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const saveSchedule = async () => {
    setIsSaving(true);
    setSaveError(undefined);
    try {
      await Promise.all(
        investmentAccounts.map((account) =>
          accountRepository.updateAccount(account.id, {
            ...toAccountDraft(account),
            monthlyRecords: ensureScheduleRecords(account),
          }),
        ),
      );
      const refreshed = await accountRepository.listAccounts();
      setAccounts(refreshed);
      setDraftAccounts(refreshed.map((account) => ({ ...account })));
      syncInvestmentAccountOrder(refreshed);
    } catch {
      setSaveError('Funding schedule could not be saved. Try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <section className="empty-state" aria-live="polite">
        <span className="material-symbols-outlined" aria-hidden="true">
          sync
        </span>
        Loading funding schedule...
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="empty-state" role="alert">
        <span className="material-symbols-outlined" aria-hidden="true">
          error
        </span>
        <h2>Schedule unavailable</h2>
        <p>{loadError}</p>
      </section>
    );
  }

  return (
    <section className="funding-schedule-shell" aria-label="Investment funding schedule">
      <div className="funding-schedule-summary" aria-label="Funding schedule summary">
        {[
          { label: 'All Accounts', total: yearlyMetrics.all, showNet: true },
          { label: 'After-Tax Accounts', total: yearlyMetrics.taxable, showNet: true },
          { label: 'Before-Tax Accounts', total: yearlyMetrics.retirement, showNet: false },
          { label: 'HSA', total: yearlyMetrics.hsa, showNet: false },
        ].map((metric) => (
          <div key={metric.label}>
            <span>{metric.label} / Year</span>
            <strong>{formatMoney(metric.total)}</strong>
            <p>
              {formatPercent(annualGrossIncome > 0 ? (metric.total / annualGrossIncome) * 100 : undefined)} gross
              {metric.showNet
                ? ` / ${formatPercent(annualNetIncome > 0 ? (metric.total / annualNetIncome) * 100 : undefined)} net`
                : ''}
            </p>
          </div>
        ))}
      </div>

      {saveError ? (
        <div className="alert error-alert" role="alert">
          <span>{saveError}</span>
        </div>
      ) : null}
      {accountError ? (
        <div className="alert error-alert" role="alert">
          <span>{accountError}</span>
        </div>
      ) : null}

      <section className="investment-workspace" aria-label="Investment account workspace">
        <div className="filter-tabs" role="tablist" aria-label="Investment account type">
          {investmentGroups.map((group) => (
            <button
              aria-selected={activeGroupId === group.id}
              className="filter-tab"
              key={group.id}
              role="tab"
              type="button"
              onClick={() => setActiveGroupId(group.id)}
            >
              {group.label}
            </button>
          ))}
        </div>
      </section>

      <section className="investment-account-manager" aria-label={`${activeGroup.label} investment accounts`}>
        <div className="investment-account-manager-header">
          <div>
            <h2>{activeGroup.label.endsWith('Accounts') ? activeGroup.label : `${activeGroup.label} Accounts`}</h2>
            <p>
              {activeGroup.description} Current contributions include January through {projectionMonthsList[currentProjectionMonthIndex]}.
            </p>
          </div>
        </div>

        <div className="funding-section-actions investment-list-actions">
          <button
            className="secondary-action compact-add-action"
            type="button"
            onClick={openCreateAccountModal}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              add
            </span>
            Add Account
          </button>
        </div>

        {activeInvestmentAccounts.length === 0 ? (
          <p className="investment-account-empty">
            No {activeGroup.label.toLowerCase()} accounts. Add one to start planning this section.
          </p>
        ) : (
          <div className="investment-account-list compact-investment-list" role="list">
            {activeInvestmentAccounts.map((account) => {
              const brokerage = getBrokerageOption(account.investmentBrokerage);

              return (
                <article
                  className="account-selector-item investment-account-row"
                  key={account.id}
                  role="listitem"
                >
                  <div className="account-selector-item-left investment-account-row-main">
                    <span
                      className={`brokerage-icon ${brokerage.className}`}
                      aria-hidden="true"
                    >
                      {brokerage.icon}
                    </span>
                    <div className="investment-account-row-labels">
                      <span className="account-selector-item-name">{account.name}</span>
                      <span className="account-selector-item-type">
                        {brokerage.label}
                        {isPayrollDeductible(account)
                          ? ` - ${formatMoney(account.yearlyContribution || 0)} yearly, ${
                              account.employerIncomeSourceId
                                ? `${account.employerMatchRatePercent || 0}% up to ${
                                    account.employerMatchCapPercent || 0
                                  }% of pay`
                                : `${formatMoney(account.employerMatchAmount || 0)} employer match`
                            }`
                          : ''}
                      </span>
                    </div>
                  </div>
                  <div className="account-selector-item-right">
                    <span className="account-selector-item-bal">
                      Current Contributions: {formatMoney(getAccountCurrentContribution(account, incomeSources))}
                    </span>
                    <div className="investment-account-actions">
                      <button
                        className="link-button"
                        type="button"
                        aria-label={`Edit ${account.name}`}
                        onClick={() => openEditAccountModal(account)}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          edit
                        </span>
                      </button>
                      <button
                        className="link-button link-button-danger"
                        type="button"
                        aria-label={`Delete ${account.name}`}
                        onClick={() => void deleteInvestmentAccount(account)}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          close
                        </span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {activeInvestmentAccounts.length === 0 ? (
        <section className="empty-state">
          <span className="material-symbols-outlined" aria-hidden="true">
            account_balance
          </span>
          <h2>No {activeGroup.label.toLowerCase()} accounts configured</h2>
          <p>Add an account above before assigning funding in this section.</p>
        </section>
      ) : (
        <>
          <div className="funding-section-actions table-save-actions">
            <button
              className="primary-action"
              type="button"
              onClick={() => void saveSchedule()}
              disabled={isSaving}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                save
              </span>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
          <div className="excel-table-fullwidth">
            <FinanceTable wrapperStyle={{ margin: 0 }}>
              <thead>
                <tr>
                  <FinanceTableHeaderCell>Month</FinanceTableHeaderCell>
                  <FinanceTableHeaderCell>Budget</FinanceTableHeaderCell>
                  {activeInvestmentAccounts.flatMap((account, accountIndex) => {
                    const columnActions = {
                      isMoveLeftDisabled: accountIndex === 0,
                      isMoveRightDisabled: accountIndex === activeInvestmentAccounts.length - 1,
                      onMoveLeft: () => moveInvestmentAccountColumn(account.id, -1),
                      onMoveRight: () => moveInvestmentAccountColumn(account.id, 1),
                    };

                    if (isPayrollDeductible(account)) {
                      return [
                        <FinanceTableHeaderCell
                          key={`${account.id}-employee`}
                          {...columnActions}
                        >
                          {`${account.name} Employee`}
                        </FinanceTableHeaderCell>,
                        <FinanceTableHeaderCell key={`${account.id}-employer`}>
                          {`${account.name} Employer Match`}
                        </FinanceTableHeaderCell>,
                      ];
                    }

                    return [
                      <FinanceTableHeaderCell
                        key={account.id}
                        isEditable
                        {...columnActions}
                      >
                        {account.name}
                      </FinanceTableHeaderCell>,
                    ];
                  })}
                  <FinanceTableHeaderCell>Total</FinanceTableHeaderCell>
                  <FinanceTableHeaderCell>% Income (Gross)</FinanceTableHeaderCell>
                  <FinanceTableHeaderCell>% Income (Net)</FinanceTableHeaderCell>
                  {showsRemainingColumn ? (
                    <FinanceTableHeaderCell>Remaining</FinanceTableHeaderCell>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {projectionMonthsList.map((month, monthIndex) => {
                  const available = checkingAccounts.reduce(
                    (sum, account) => sum + getRecordForMonth(account, month).invest,
                    0,
                  );
                  const assignedNonPayroll = nonPayrollInvestmentAccounts.reduce(
                    (sum, account) => sum + getRecordForMonth(account, month).invest,
                    0,
                  );
                  const activeGroupTotal = getScopeContribution(
                    activeInvestmentAccounts,
                    month,
                    incomeSources,
                    'all',
                  );
                  const remaining = available - assignedNonPayroll;
                  const rowClass =
                    monthIndex === currentProjectionMonthIndex
                      ? 'excel-row-current'
                      : monthIndex > currentProjectionMonthIndex
                        ? 'excel-row-forecast'
                        : 'excel-row-actual';

                  return (
                    <tr key={month} className={rowClass}>
                      <td className="excel-bold-col">{month}</td>
                      <td>
                        <span className="excel-cell-val excel-bold-col">
                          {formatMoney(available)}
                        </span>
                      </td>
                      {activeInvestmentAccounts.flatMap((account) => {
                        const payrollAccount = isPayrollDeductible(account);
                        const monthlyContribution =
                          payrollAccount ? (account.yearlyContribution || 0) / 12 : 0;
                        const monthlyMatch =
                          payrollAccount
                            ? calculateEmployerMatch(account, incomeSources, month)
                            : 0;
                        const value = getRecordForMonth(account, month).invest;

                        if (payrollAccount) {
                          return [
                            <td key={`${account.id}-employee`}>
                              <FinanceMoneyCellValue
                                className="excel-bold-col"
                                formatValue={formatMoney}
                                value={monthlyContribution}
                              />
                            </td>,
                            <td key={`${account.id}-employer`}>
                              <FinanceMoneyCellValue
                                formatValue={formatMoney}
                                value={monthlyMatch}
                              />
                            </td>,
                          ];
                        }

                        return [
                          <td key={account.id}>
                              <FinanceMoneyCellInput
                                aria-label={`${account.name} ${month} allocation`}
                                fillDownLabel={`Auto-populate ${account.name} from ${month} down`}
                                focusId={`investment-${account.id}-${monthIndex}`}
                                formatValue={formatMoney}
                                nextFocusId={
                                  monthIndex < projectionMonthsList.length - 1
                                    ? `investment-${account.id}-${monthIndex + 1}`
                                    : undefined
                                }
                                value={value}
                                onFillDown={(nextValue) =>
                                  fillDownNonPayrollAllocation(
                                    account.id,
                                    monthIndex,
                                    nextValue,
                                  )
                                }
                                onValueChange={(nextValue) =>
                                  updateNonPayrollAllocation(
                                    account.id,
                                    month,
                                    nextValue,
                                  )
                                }
                              />
                          </td>,
                        ];
                      })}
                      <td><span className="excel-cell-val excel-bold-col">{formatMoney(activeGroupTotal)}</span></td>
                      <td><span className="excel-cell-val">{formatPercent(monthlyGrossIncome > 0 ? (activeGroupTotal / monthlyGrossIncome) * 100 : undefined)}</span></td>
                      <td><span className="excel-cell-val">{formatPercent(monthlyNetIncome > 0 && activeGroup.id !== 'retirement' && activeGroup.id !== 'hsa' ? (activeGroupTotal / monthlyNetIncome) * 100 : undefined)}</span></td>
                      {showsRemainingColumn ? (
                        <td>
                          <span
                            className="excel-cell-val excel-bold-col"
                            style={{
                              color:
                                remaining === available
                                  ? 'var(--md-sys-color-primary)'
                                  : remaining > 0 && remaining < available
                                    ? 'var(--md-sys-color-warning)'
                                    : remaining === 0
                                      ? 'var(--md-sys-color-on-surface-variant)'
                                      : 'var(--md-sys-color-error)',
                            }}
                          >
                            {formatMoney(remaining)}
                          </span>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </FinanceTable>
          </div>

        </>
      )}

      {isAccountModalOpen ? (
        <div className="modal-overlay" onClick={closeAccountModal}>
          <div className="modal-container" onClick={(event) => event.stopPropagation()}>
            <h2>{editingAccountId ? 'Edit Account' : 'Add Account'}</h2>
            <div className="modal-form">
              <label className="field">
                <span>Account Name</span>
                <input
                  value={accountDraft.name}
                  onChange={(event) =>
                    setAccountDraft({ ...accountDraft, name: event.target.value })
                  }
                  placeholder="e.g. Brokerage"
                  maxLength={maxAccountNameLength}
                  autoFocus
                />
              </label>

              <label className="field">
                <span>Investment Account Type</span>
                <select
                  value={accountDraft.investmentAccountType}
                  onChange={(event) => {
                    const nextType = event.target.value as InvestmentAccountType;
                    setAccountDraft({
                      ...accountDraft,
                      investmentAccountType: nextType,
                      manageHoldings:
                        nextType === '401k' ? false : accountDraft.manageHoldings,
                    });
                  }}
                  style={{ border: '1.5px solid var(--md-sys-color-outline)', borderRadius: 'var(--md-sys-shape-corner-s)', height: '48px', color: 'var(--md-sys-color-on-surface)', backgroundColor: 'transparent', padding: '10px' }}
                >
                  <option value="Taxable" style={{ backgroundColor: 'var(--md-sys-color-surface)' }}>Taxable</option>
                  <option value="401k" style={{ backgroundColor: 'var(--md-sys-color-surface)' }}>401k</option>
                  <option value="IRA" style={{ backgroundColor: 'var(--md-sys-color-surface)' }}>IRA</option>
                  <option value="HSA" style={{ backgroundColor: 'var(--md-sys-color-surface)' }}>HSA</option>
                </select>
              </label>

              <label className={`column-mode-option${accountDraft.manageHoldings ? ' selected' : ''}`}>
                <input
                  className="income-credit-checkbox"
                  type="checkbox"
                  checked={accountDraft.manageHoldings}
                  onChange={(event) =>
                    setAccountDraft({
                      ...accountDraft,
                      manageHoldings: event.target.checked,
                    })
                  }
                />
                <span>Manage Holdings</span>
              </label>

              <label className="field">
                <span>Brokerage</span>
                <select
                  value={accountDraft.investmentBrokerage}
                  onChange={(event) =>
                    setAccountDraft({
                      ...accountDraft,
                      investmentBrokerage: event.target.value as InvestmentBrokerage,
                    })
                  }
                  style={{ border: '1.5px solid var(--md-sys-color-outline)', borderRadius: 'var(--md-sys-shape-corner-s)', height: '48px', color: 'var(--md-sys-color-on-surface)', backgroundColor: 'transparent', padding: '10px' }}
                >
                  {brokerageOptions.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      style={{ backgroundColor: 'var(--md-sys-color-surface)' }}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Starting Balance</span>
                <div className="input-wrapper">
                  <span className="input-prefix" aria-hidden="true">$</span>
                  <input
                    value={accountDraft.startingBalance}
                    onChange={(event) =>
                      setAccountDraft({
                        ...accountDraft,
                        startingBalance: event.target.value,
                      })
                    }
                    placeholder="0.00"
                    inputMode="decimal"
                    data-has-prefix="true"
                  />
                </div>
              </label>

              <label className="field">
                <span>Start Month</span>
                <input
                  type="month"
                  value={toMonthInputValue(accountDraft.startDate)}
                  onChange={(event) =>
                    setAccountDraft({
                      ...accountDraft,
                      startDate: toStoredMonthStart(event.target.value),
                    })
                  }
                />
              </label>

              <label className="field">
                <span>Yield / APY (%)</span>
                <input
                  type="number"
                  step="0.01"
                  value={accountDraft.yieldRate}
                  onChange={(event) =>
                    setAccountDraft({ ...accountDraft, yieldRate: event.target.value })
                  }
                  placeholder="e.g. 7"
                />
              </label>

              {payrollDeductibleTypes.includes(accountDraft.investmentAccountType) ? (
                <>
                  <label className="field">
                    <span>Yearly Contribution</span>
                    <div className="input-wrapper">
                      <span className="input-prefix" aria-hidden="true">$</span>
                      <input
                        value={accountDraft.yearlyContribution}
                        onChange={(event) =>
                          setAccountDraft({
                            ...accountDraft,
                            yearlyContribution: event.target.value,
                          })
                        }
                        placeholder="0.00"
                        inputMode="decimal"
                        data-has-prefix="true"
                      />
                    </div>
                  </label>

                  <label className="field">
                    <span>Employer</span>
                    <select
                      value={accountDraft.employerIncomeSourceId}
                      onChange={(event) => {
                        const selectedEmployer = incomeSources.find(
                          (source) => source.id === event.target.value,
                        );
                        setAccountDraft({
                          ...accountDraft,
                          employerIncomeSourceId: event.target.value,
                          employerMatchStartDate: event.target.value
                            ? getEmployerMatchDefaultStartDate(selectedEmployer)
                            : '',
                        });
                      }}
                      style={{ border: '1.5px solid var(--md-sys-color-outline)', borderRadius: 'var(--md-sys-shape-corner-s)', height: '48px', color: 'var(--md-sys-color-on-surface)', backgroundColor: 'transparent', padding: '10px' }}
                    >
                      <option value="" style={{ backgroundColor: 'var(--md-sys-color-surface)' }}>No employer attached</option>
                      {incomeSources.map((source) => (
                        <option key={source.id} value={source.id} style={{ backgroundColor: 'var(--md-sys-color-surface)' }}>
                          {source.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {accountDraft.employerIncomeSourceId ? (
                    <>
                      <label className="field">
                        <span>Match Start Month</span>
                        <input
                          type="month"
                          value={toMonthInputValue(accountDraft.employerMatchStartDate)}
                          onChange={(event) =>
                            setAccountDraft({
                              ...accountDraft,
                              employerMatchStartDate: toStoredMonthStart(event.target.value),
                            })
                          }
                        />
                      </label>

                      <label className="field">
                        <span>Match Rate (%)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={accountDraft.employerMatchRatePercent}
                          onChange={(event) =>
                            setAccountDraft({
                              ...accountDraft,
                              employerMatchRatePercent: event.target.value,
                            })
                          }
                          placeholder="100"
                        />
                      </label>

                      <label className="field">
                        <span>Match Cap (% of pay)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={accountDraft.employerMatchCapPercent}
                          onChange={(event) =>
                            setAccountDraft({
                              ...accountDraft,
                              employerMatchCapPercent: event.target.value,
                            })
                          }
                          placeholder="3"
                        />
                      </label>
                    </>
                  ) : (
                    <label className="field">
                      <span>Expected Monthly Employer Match</span>
                      <div className="input-wrapper">
                        <span className="input-prefix" aria-hidden="true">$</span>
                        <input
                          value={accountDraft.employerMatchAmount}
                          onChange={(event) =>
                            setAccountDraft({
                              ...accountDraft,
                              employerMatchAmount: event.target.value,
                            })
                          }
                          placeholder="0.00"
                          inputMode="decimal"
                          data-has-prefix="true"
                        />
                      </div>
                    </label>
                  )}
                </>
              ) : null}
            </div>

            <div className="modal-actions">
              <button className="secondary-action" type="button" onClick={closeAccountModal}>
                Cancel
              </button>
              <button
                className="primary-action"
                type="button"
                onClick={() => void saveInvestmentAccount()}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : editingAccountId ? 'Save Account' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
