import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import type { IncomeSourceRepository } from '../domain/incomeSourceRepository';
import type { BudgetRepository } from '../domain/budgetRepository';
import type { AccountRepository } from '../domain/accountRepository';
import type { IncomeSource } from '../domain/incomeSource';
import type { BudgetCategoryWithSubCategories } from '../domain/budget';
import {
  type Account,
  type AccountDraft,
  type AccountType,
  emptyAccountDraft,
  toAccountDraft,
  defaultMonthlyRecords,
} from '../domain/account';

type AccountPageProps = {
  incomeRepository: IncomeSourceRepository;
  budgetRepository: BudgetRepository;
  accountRepository: AccountRepository;
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});
const accountSelectorMaxWidth = '960px';
const maxAccountNameLength = 100;
const maxAccountBalance = 999_999_999.99;
const accountTypeOrder: Record<AccountType, number> = {
  Checking: 0,
  Savings: 1,
};

const toMonthInputValue = (dateValue: string) => dateValue.slice(0, 7);

const toStoredMonthStart = (monthValue: string) => `${monthValue || '2026-01'}-01`;

const formatMonthYear = (dateValue: string) => {
  const [year, month] = toMonthInputValue(dateValue).split('-');
  if (!year || !month) return dateValue;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, 1)));
};

const createColumnId = (name: string) => {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${base || 'column'}-${crypto.randomUUID().slice(0, 6)}`;
};

const budgetCategoryColumnId = (categoryId: string) => `budget-category-${categoryId}`;

const budgetSubCategoryColumnId = (subCategoryId: string) => `budget-sub-category-${subCategoryId}`;

const formatMoney = (amount: number) => {
  if (amount < 0) {
    return `(${currencyFormatter.format(Math.abs(amount))})`;
  }
  if (amount === 0) {
    return '$   -   ';
  }
  return currencyFormatter.format(amount);
};

const getMonthlyNetIncomeForMonth = (
  sources: IncomeSource[],
  monthCode: string,
  assignedIncomeSourceIds: string[],
): number => {
  let totalNet = 0;
  const assignedIds = new Set(assignedIncomeSourceIds);
  const activeSources = sources.filter((s) => s.status === 'Active' && assignedIds.has(s.id));
  for (const source of activeSources) {
    const period = source.periods.find((p) => {
      const startMonth = p.startDate.slice(0, 7);
      const endMonth = p.endDate ? p.endDate.slice(0, 7) : '9999-12';
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

const sortAccounts = (items: Account[]) =>
  [...items].sort((a, b) => {
    const typeDelta = accountTypeOrder[a.type] - accountTypeOrder[b.type];
    return typeDelta || a.name.localeCompare(b.name);
  });

type ComputedRecord = {
  month: string;
  start: number;
  credit: number;
  outflows: Record<string, number>;
  expenses: number;
  subtotal: number;
  invest: number;
  savings: number;
  net: number;
};

type ProjectionMonth = {
  name: string;
  dateCode: string;
};

type ColumnModalMode = 'custom' | 'budget';

const getCurrentProjectionMonth = (projectionMonths: ProjectionMonth[]) => {
  const now = new Date();
  const currentDateCode = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return projectionMonths.find((month) => month.dateCode === currentDateCode) ?? projectionMonths[0];
};

const computeAccountRecords = (
  account: Account,
  incomeSources: IncomeSource[],
  projectionMonths: ProjectionMonth[],
): ComputedRecord[] => {
  let currentStart = 0;
  let balanceRealized = false;
  const startCode = account.startDate ? account.startDate.slice(0, 7) : '2026-01';
  const assignedIncomeSourceIds = account.assignedIncomeSourceIds || [];

  return account.monthlyRecords.map((record) => {
    const monthCode = projectionMonths.find((m) => m.name === record.month)?.dateCode || '2026-01';

    let start = 0;
    let credit = 0;
    const outflows: Record<string, number> = {};
    let expenses = 0;
    let invest = 0;
    let savings = 0;
    let net = 0;

    if (monthCode < startCode) {
      return {
        month: record.month,
        start,
        credit,
        outflows,
        expenses,
        subtotal: 0,
        invest,
        savings,
        net,
      };
    }

    if (!balanceRealized) {
      start = Number(account.startingBalance) || 0;
      balanceRealized = true;
    } else {
      start = currentStart;
    }

    credit = getMonthlyNetIncomeForMonth(incomeSources, monthCode, assignedIncomeSourceIds);

    account.columns.forEach((col) => {
      const val = Number(record.outflows[col.id]) || 0;
      outflows[col.id] = val;
      expenses += val;
    });

    invest = Number(record.invest) || 0;
    savings = Number(record.savings) || 0;
    if (account.type === 'Savings') {
      net = start + credit - expenses - invest + savings;
    } else {
      net = start + credit - expenses - invest - savings;
    }
    currentStart = net;

    return {
      month: record.month,
      start,
      credit,
      outflows,
      expenses,
      subtotal: start + credit - expenses,
      invest,
      savings,
      net,
    };
  });
};

type ExcelCellInputProps = {
  value: number;
  onChange: (val: string) => void;
  className?: string;
  disabled?: boolean;
  focusId?: string;
  nextFocusId?: string;
  fillDownLabel?: string;
  onFillDown?: (val: string) => void;
};

function ExcelCellInput({
  value,
  onChange,
  className = '',
  disabled = false,
  focusId,
  nextFocusId,
  fillDownLabel,
  onFillDown,
}: ExcelCellInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [tempValue, setTempValue] = useState(String(value));

  // Sync state with parent when not active
  useEffect(() => {
    if (!isFocused) {
      setTempValue(value === 0 ? '' : String(value));
    }
  }, [value, isFocused]);

  const handleBlur = () => {
    setIsFocused(false);
    onChange(tempValue);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    onChange(tempValue);
    setIsFocused(false);

    if (nextFocusId) {
      window.requestAnimationFrame(() => {
        const nextInput = document.querySelector<HTMLInputElement>(
          `[data-ledger-cell="${nextFocusId}"]`,
        );
        nextInput?.focus();
      });
    }
  };

  const handleFillDown = () => {
    onFillDown?.(tempValue);
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        className={`excel-cell-input ${className}`}
        data-ledger-cell={focusId}
        value={isFocused ? tempValue : formatMoney(value)}
        onChange={(e) => setTempValue(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        style={isFocused && onFillDown ? { paddingLeft: '22px' } : undefined}
      />
      {isFocused && onFillDown ? (
        <button
          type="button"
          className="link-button"
          aria-label={fillDownLabel}
          title={fillDownLabel}
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleFillDown}
          style={{
            position: 'absolute',
            left: '2px',
            top: '50%',
            transform: 'translateY(-50%)',
            minHeight: '18px',
            width: '18px',
            padding: 0,
            color: 'var(--md-sys-color-primary)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>keyboard_double_arrow_down</span>
        </button>
      ) : null}
    </div>
  );
}

export function AccountPage({
  incomeRepository,
  budgetRepository,
  accountRepository,
}: AccountPageProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategoryWithSubCategories[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();

  // Draft editing states
  const [draftAccount, setDraftAccount] = useState<Account>();
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();

  // Account modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalAccountId, setModalAccountId] = useState<string | null>(null);
  const [modalDraft, setModalDraft] = useState<AccountDraft>(() => emptyAccountDraft());
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [columnModalMode, setColumnModalMode] = useState<ColumnModalMode>('custom');
  const [hoveredColumnId, setHoveredColumnId] = useState<string | null>(null);
  const [newColumnName, setNewColumnName] = useState('');
  const [selectedBudgetCategoryId, setSelectedBudgetCategoryId] = useState('');
  const [selectedBudgetSubCategoryId, setSelectedBudgetSubCategoryId] = useState('');

  const isEditingAccount = modalAccountId !== null;
  const sortedAccounts = useMemo(() => sortAccounts(accounts), [accounts]);
  const assignedIncomeAccountBySourceId = useMemo(() => {
    const assignments = new Map<string, Account>();
    accounts.forEach((account) => {
      if (account.id === modalAccountId) return;
      (account.assignedIncomeSourceIds || []).forEach((sourceId) => {
        assignments.set(sourceId, account);
      });
    });
    return assignments;
  }, [accounts, modalAccountId]);
  const selectedBudgetCategory = useMemo(
    () => budgetCategories.find((category) => category.id === selectedBudgetCategoryId),
    [budgetCategories, selectedBudgetCategoryId],
  );
  const selectedBudgetSubCategory = useMemo(
    () =>
      selectedBudgetCategory?.subCategories.find(
        (subCategory) => subCategory.id === selectedBudgetSubCategoryId,
      ),
    [selectedBudgetCategory, selectedBudgetSubCategoryId],
  );
  const selectedBudgetAssociation = useMemo(() => {
    if (!selectedBudgetCategory) return undefined;

    if (selectedBudgetSubCategory) {
      return {
        columnId: budgetSubCategoryColumnId(selectedBudgetSubCategory.id),
        name: selectedBudgetSubCategory.name,
        monthlyAmount: selectedBudgetSubCategory.monthlyAmountUsd,
      };
    }

    return {
      columnId: budgetCategoryColumnId(selectedBudgetCategory.id),
      name: selectedBudgetCategory.name,
      monthlyAmount: selectedBudgetCategory.subCategories.reduce(
        (total, subCategory) => total + subCategory.monthlyAmountUsd,
        0,
      ),
    };
  }, [selectedBudgetCategory, selectedBudgetSubCategory]);
  const parsedModalBalance = Number(modalDraft.startingBalance);
  const isModalBalanceValid =
    modalDraft.startingBalance !== '' &&
    !Number.isNaN(parsedModalBalance) &&
    parsedModalBalance >= 0 &&
    parsedModalBalance <= maxAccountBalance;
  const isModalAccountValid =
    modalDraft.name.trim().length > 0 &&
    modalDraft.name.trim().length <= maxAccountNameLength &&
    isModalBalanceValid;

  const openCreateAccountModal = () => {
    setModalAccountId(null);
    setModalDraft(emptyAccountDraft());
    setSaveError(undefined);
    setIsModalOpen(true);
  };

  const openEditAccountModal = (account: Account) => {
    setModalAccountId(account.id);
    setModalDraft(toAccountDraft(account));
    setSaveError(undefined);
    setIsModalOpen(true);
  };

  const closeAccountModal = () => {
    setModalAccountId(null);
    setModalDraft(emptyAccountDraft());
    setIsModalOpen(false);
  };

  const openColumnModal = () => {
    setColumnModalMode('custom');
    setNewColumnName('');
    setSelectedBudgetCategoryId('');
    setSelectedBudgetSubCategoryId('');
    setIsColumnModalOpen(true);
  };

  const closeColumnModal = () => {
    setIsColumnModalOpen(false);
    setNewColumnName('');
    setSelectedBudgetCategoryId('');
    setSelectedBudgetSubCategoryId('');
  };

  const projectionMonths = useMemo(() => [
    { name: 'Jan-26', dateCode: '2026-01' },
    { name: 'Feb-26', dateCode: '2026-02' },
    { name: 'Mar-26', dateCode: '2026-03' },
    { name: 'Apr-26', dateCode: '2026-04' },
    { name: 'May-26', dateCode: '2026-05' },
    { name: 'Jun-26', dateCode: '2026-06' },
    { name: 'Jul-26', dateCode: '2026-07' },
    { name: 'Aug-26', dateCode: '2026-08' },
    { name: 'Sep-26', dateCode: '2026-09' },
    { name: 'Oct-26', dateCode: '2026-10' },
    { name: 'Nov-26', dateCode: '2026-11' },
    { name: 'Dec-26', dateCode: '2026-12' },
  ], []);

  // Load all accounts, income sources, and budget categories.
  useEffect(() => {
    const loadAllData = async () => {
      setIsLoading(true);
      setLoadError(undefined);
      try {
        const [accts, sources, categories] = await Promise.all([
          accountRepository.listAccounts(),
          incomeRepository.listIncomeSources(),
          budgetRepository.listCategoriesWithSubCategories(),
        ]);
        const sorted = sortAccounts(accts);
        setAccounts(sorted);
        setIncomeSources(sources);
        setBudgetCategories(categories);
        setSelectedAccountId((prev) => prev ?? sorted[0]?.id);
      } catch {
        setLoadError('Failed to load required finance data. Try again.');
      } finally {
        setIsLoading(false);
      }
    };

    void loadAllData();
  }, [accountRepository, incomeRepository, budgetRepository]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId),
    [accounts, selectedAccountId],
  );

  // Sync draft state on account switch
  useEffect(() => {
    if (!selectedAccount) return;
    const accountCopy = JSON.parse(JSON.stringify(selectedAccount));
    if (!accountCopy.monthlyRecords || accountCopy.monthlyRecords.length === 0) {
      accountCopy.monthlyRecords = defaultMonthlyRecords();
    }
    setDraftAccount(accountCopy);
    setNewColumnName('');
    setIsDirty(false);
    setSaveError(undefined);
  }, [selectedAccount]);

  const refreshAccounts = async (preferredSelectedId?: string) => {
    const list = await accountRepository.listAccounts();
    const sorted = sortAccounts(list);
    setAccounts(sorted);
    setSelectedAccountId((prev) => {
      const nextSelectedId = preferredSelectedId ?? prev;
      return nextSelectedId && sorted.some((a) => a.id === nextSelectedId)
        ? nextSelectedId
        : sorted[0]?.id;
    });
  };

  // Check unsaved changes
  const ensureSavedBeforeSwitch = async (nextId: string) => {
    if (nextId === selectedAccountId) return;
    if (!isDirty) {
      setSelectedAccountId(nextId);
      return;
    }
    const ok = window.confirm('You have unsaved account changes. Save before switching?');
    if (!ok) return;
    await saveAccountChanges();
    setSelectedAccountId(nextId);
  };

  const saveAccountChanges = async () => {
    if (!draftAccount || !selectedAccountId) return;
    setIsSaving(true);
    setSaveError(undefined);
    try {
      const columnsPayload = activeColumns.map((col) => ({
        id: col.id,
        name: col.name,
        icon: col.icon,
      }));

      const recordsPayload = draftAccount.monthlyRecords.map((r, mIdx) => {
        const monthCode = projectionMonths[mIdx]?.dateCode || '2026-01';
        const derivedCredit = getMonthlyNetIncomeForMonth(
          incomeSources,
          monthCode,
          draftAccount.assignedIncomeSourceIds || [],
        );
        return {
          ...r,
          credit: derivedCredit,
          outflows: activeColumns.reduce((acc, col) => {
            acc[col.id] = r.outflows[col.id] || 0;
            return acc;
          }, {} as Record<string, number>),
        };
      });

      const draftInput: AccountDraft = {
        name: draftAccount.name,
        type: draftAccount.type,
        startingBalance: String(draftAccount.startingBalance),
        startDate: draftAccount.startDate,
        yieldRate: String(draftAccount.yieldRate),
        assignedIncomeSourceIds: draftAccount.assignedIncomeSourceIds || [],
        savingsAccountId: draftAccount.savingsAccountId || '',
        columns: columnsPayload,
        monthlyRecords: recordsPayload,
      };
      await accountRepository.updateAccount(selectedAccountId, draftInput);

      if (draftInput.type === 'Checking' && draftInput.savingsAccountId) {
        const savingsAcc = accounts.find((a) => a.id === draftInput.savingsAccountId);
        if (savingsAcc) {
          const updatedSavingsRecords = savingsAcc.monthlyRecords.map((savRecord) => {
            const checkRecord = recordsPayload.find((r) => r.month === savRecord.month);
            return {
              ...savRecord,
              savings: checkRecord ? checkRecord.savings : savRecord.savings,
            };
          });
          const savingsDraft: AccountDraft = {
            ...toAccountDraft(savingsAcc),
            monthlyRecords: updatedSavingsRecords,
          };
          await accountRepository.updateAccount(savingsAcc.id, savingsDraft);
        }
      }

      setIsDirty(false);
      await refreshAccounts();
    } catch {
      setSaveError('Failed to save account configurations. Try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const saveModalAccount = async () => {
    const name = modalDraft.name.trim();
    const balanceNum = Number(modalDraft.startingBalance);

    if (
      !name ||
      name.length > maxAccountNameLength ||
      Number.isNaN(balanceNum) ||
      modalDraft.startingBalance === '' ||
      balanceNum < 0 ||
      balanceNum > maxAccountBalance
    ) {
      return;
    }

    setIsSaving(true);
    setSaveError(undefined);

    try {
      const modalColumns = modalDraft.columns.filter((col) => !col.isDeleted);
      const columnsPayload = modalColumns.map((col) => ({
        id: col.id,
        name: col.name,
        icon: col.icon,
      }));

      const recordsPayload = (modalDraft.monthlyRecords.length > 0 ? modalDraft.monthlyRecords : emptyAccountDraft().monthlyRecords).map((r, mIdx) => {
        const monthCode = projectionMonths[mIdx]?.dateCode || '2026-01';
        const derivedCredit = getMonthlyNetIncomeForMonth(
          incomeSources,
          monthCode,
          modalDraft.assignedIncomeSourceIds,
        );
        return {
          ...r,
          credit: derivedCredit,
          outflows: modalColumns.reduce((acc, col) => {
            acc[col.id] = r.outflows[col.id] || 0;
            return acc;
          }, {} as Record<string, number>),
        };
      });

      const draftInput: AccountDraft = {
        name,
        type: modalDraft.type,
        startingBalance: String(balanceNum),
        startDate: modalDraft.startDate || '2026-01-01',
        yieldRate: String(Number(modalDraft.yieldRate) || 0),
        assignedIncomeSourceIds: modalDraft.assignedIncomeSourceIds,
        savingsAccountId: modalDraft.savingsAccountId || '',
        columns: columnsPayload,
        monthlyRecords: recordsPayload,
      };

      let targetAccountId = '';
      if (isEditingAccount && modalAccountId) {
        await accountRepository.updateAccount(modalAccountId, draftInput);
        targetAccountId = modalAccountId;
      } else {
        const createdAccount = await accountRepository.createAccount(draftInput);
        targetAccountId = createdAccount.id;
      }

      if (draftInput.type === 'Checking' && draftInput.savingsAccountId) {
        const savingsAcc = accounts.find((a) => a.id === draftInput.savingsAccountId);
        if (savingsAcc) {
          const updatedSavingsRecords = savingsAcc.monthlyRecords.map((savRecord) => {
            const checkRecord = recordsPayload.find((r) => r.month === savRecord.month);
            return {
              ...savRecord,
              savings: checkRecord ? checkRecord.savings : savRecord.savings,
            };
          });
          const savingsDraft: AccountDraft = {
            ...toAccountDraft(savingsAcc),
            monthlyRecords: updatedSavingsRecords,
          };
          await accountRepository.updateAccount(savingsAcc.id, savingsDraft);
        }
      }

      await refreshAccounts(targetAccountId);

      closeAccountModal();
    } catch {
      setSaveError(
        isEditingAccount ? 'Failed to update account. Try again.' : 'Failed to create account. Try again.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const deleteAccount = async (id: string) => {
    if (id === selectedAccountId && isDirty) {
      const ok = window.confirm('Unsaved changes will be lost. Save before deleting?');
      if (ok) await saveAccountChanges();
      else return;
    }
    const ok = window.confirm('Are you sure you want to delete this account?');
    if (!ok) return;
    await accountRepository.deleteAccount(id);
    await refreshAccounts();
  };

  const updateCell = (index: number, field: 'credit' | 'invest' | 'savings', value: string) => {
    if (!draftAccount) return;
    const val = Number(value) || 0;
    const nextRecords = draftAccount.monthlyRecords.map((r, idx) =>
      idx === index ? { ...r, [field]: val } : r,
    );
    setDraftAccount({ ...draftAccount, monthlyRecords: nextRecords });
    setIsDirty(true);
  };

  const updateOutflowCell = (index: number, colId: string, value: string) => {
    if (!draftAccount) return;
    const val = Number(value) || 0;
    const nextRecords = draftAccount.monthlyRecords.map((r, idx) =>
      idx === index
        ? {
            ...r,
            outflows: {
              ...r.outflows,
              [colId]: val,
            },
          }
        : r,
    );
    setDraftAccount({ ...draftAccount, monthlyRecords: nextRecords });
    setIsDirty(true);
  };

  const fillDownCell = (
    index: number,
    field: 'invest' | 'savings',
    value: string,
  ) => {
    if (!draftAccount) return;
    const val = Number(value) || 0;
    const nextRecords = draftAccount.monthlyRecords.map((record, rowIndex) =>
      rowIndex >= index ? { ...record, [field]: val } : record,
    );
    setDraftAccount({ ...draftAccount, monthlyRecords: nextRecords });
    setIsDirty(true);
  };

  const fillDownOutflowCell = (index: number, colId: string, value: string) => {
    if (!draftAccount) return;
    const val = Number(value) || 0;
    const nextRecords = draftAccount.monthlyRecords.map((record, rowIndex) =>
      rowIndex >= index
        ? {
            ...record,
            outflows: {
              ...record.outflows,
              [colId]: val,
            },
          }
        : record,
    );
    setDraftAccount({ ...draftAccount, monthlyRecords: nextRecords });
    setIsDirty(true);
  };

  const addAccountColumn = () => {
    if (!draftAccount) return false;
    const name = newColumnName.trim();
    if (!name) return false;

    const column = {
      id: createColumnId(name),
      name,
      icon: 'payments',
    };
    const monthlyRecords = draftAccount.monthlyRecords.map((record) => ({
      ...record,
      outflows: {
        ...record.outflows,
        [column.id]: 0,
      },
    }));

    setDraftAccount({
      ...draftAccount,
      columns: [...draftAccount.columns, column],
      monthlyRecords,
    });
    setNewColumnName('');
    setIsDirty(true);
    return true;
  };

  const associateBudgetSelectionToAccount = () => {
    if (!draftAccount || !selectedBudgetAssociation) return false;

    const existingColumn = draftAccount.columns.find(
      (column) => column.id === selectedBudgetAssociation.columnId,
    );
    const nextColumns = existingColumn
      ? draftAccount.columns.map((column) =>
          column.id === selectedBudgetAssociation.columnId
            ? { ...column, name: selectedBudgetAssociation.name, icon: 'payments', isDeleted: false }
            : column,
        )
      : [
          ...draftAccount.columns,
          {
            id: selectedBudgetAssociation.columnId,
            name: selectedBudgetAssociation.name,
            icon: 'payments',
          },
        ];
    const monthlyRecords = draftAccount.monthlyRecords.map((record) => ({
      ...record,
      outflows: {
        ...record.outflows,
        [selectedBudgetAssociation.columnId]: selectedBudgetAssociation.monthlyAmount,
      },
    }));

    setDraftAccount({
      ...draftAccount,
      columns: nextColumns,
      monthlyRecords,
    });
    setIsDirty(true);
    return true;
  };

  const addColumnFromModal = () => {
    const didAdd =
      columnModalMode === 'custom'
        ? addAccountColumn()
        : associateBudgetSelectionToAccount();
    if (didAdd) {
      closeColumnModal();
    }
  };

  const moveAccountColumn = (columnId: string, direction: -1 | 1) => {
    if (!draftAccount) return;
    const columns = [...draftAccount.columns];
    const index = columns.findIndex((column) => column.id === columnId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= columns.length) return;

    const [column] = columns.splice(index, 1);
    columns.splice(nextIndex, 0, column);
    setDraftAccount({ ...draftAccount, columns });
    setIsDirty(true);
  };

  const removeAccountColumn = (columnId: string) => {
    if (!draftAccount) return;
    const columns = draftAccount.columns.filter((column) => column.id !== columnId);
    const monthlyRecords = draftAccount.monthlyRecords.map((record) => {
      const outflows = { ...record.outflows };
      delete outflows[columnId];
      return {
        ...record,
        outflows,
      };
    });
    setDraftAccount({ ...draftAccount, columns, monthlyRecords });
    setHoveredColumnId((current) => (current === columnId ? null : current));
    setIsDirty(true);
  };

  const toggleModalIncomeSource = (sourceId: string) => {
    const assigned = new Set(modalDraft.assignedIncomeSourceIds);
    if (assigned.has(sourceId)) {
      assigned.delete(sourceId);
    } else {
      assigned.add(sourceId);
    }
    setModalDraft({ ...modalDraft, assignedIncomeSourceIds: [...assigned] });
  };

  // Active columns are owned by the account so each account can keep a distinct ledger shape.
  const activeColumns = useMemo(() => {
    return (draftAccount?.columns || []).filter((col) => !col.isDeleted);
  }, [draftAccount]);

  // Simulation calculations with dynamic balance realization and cascading
  const computedRecords = useMemo((): ComputedRecord[] => {
    if (!draftAccount) return [];

    return computeAccountRecords(draftAccount, incomeSources, projectionMonths);
  }, [draftAccount, projectionMonths, incomeSources]);

  const currentProjectionMonth = useMemo(
    () => getCurrentProjectionMonth(projectionMonths),
    [projectionMonths],
  );

  const currentBalanceByAccountId = useMemo(() => {
    return new Map(
      accounts.map((account) => {
        const records = computeAccountRecords(account, incomeSources, projectionMonths);
        const currentRecord = records.find((record) => record.month === currentProjectionMonth.name);
        return [account.id, currentRecord?.net ?? account.startingBalance];
      }),
    );
  }, [accounts, currentProjectionMonth.name, incomeSources, projectionMonths]);

  // Overall sums/averages for KPIs and Summary Table footer
  const summaryTotals = useMemo(() => {
    if (computedRecords.length === 0) return { creditSum: 0, expenseSum: 0, investSum: 0, savingsSum: 0, checkingEnding: 0 };
    
    let creditSum = 0;
    let expenseSum = 0;
    let investSum = 0;
    let savingsSum = 0;
    
    computedRecords.forEach((r) => {
      creditSum += r.credit;
      expenseSum += r.expenses;
      investSum += r.invest;
      savingsSum += r.savings;
    });

    const checkingEnding = computedRecords[computedRecords.length - 1]?.net || 0;

    return {
      creditSum,
      expenseSum,
      investSum,
      savingsSum,
      checkingEnding,
    };
  }, [computedRecords]);

  return (
    <main className="app-shell budget-shell">
      <header className="page-header compact-header">
        <div className="page-header-text">
          <h1>Account Management</h1>
        </div>
      </header>

      {loadError ? (
        <div className="alert error-alert" role="alert">
          <span className="material-symbols-outlined" aria-hidden="true">error</span>
          <span>{loadError}</span>
        </div>
      ) : null}

      {saveError ? (
        <div className="alert error-alert" role="alert">
          <span className="material-symbols-outlined" aria-hidden="true">error</span>
          <span>{saveError}</span>
        </div>
      ) : null}

      {/* TOP SECTION: SELECTORS WITH A SMALL FOOTPRINT */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }} aria-label="Bank accounts selectors">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: accountSelectorMaxWidth }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', color: '#d97706', letterSpacing: '0.05em' }}>
            Select Account
          </span>
          <button
            className="secondary-action"
            type="button"
            onClick={openCreateAccountModal}
            style={{ minHeight: '28px', padding: '0 10px', fontSize: '0.75rem', borderRadius: 'var(--md-sys-shape-corner-s)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }} aria-hidden="true">add</span>
            Add Account
          </button>
        </div>

        <div className="accounts-vertical-stack" role="list" style={{ maxWidth: accountSelectorMaxWidth }}>
          {isLoading ? (
            <div style={{ fontSize: '0.85rem', padding: '8px' }}>Loading accounts...</div>
          ) : sortedAccounts.length === 0 ? (
            <div style={{ fontSize: '0.85rem', padding: '8px', fontStyle: 'italic' }}>No accounts. Add one.</div>
          ) : (
            sortedAccounts.map((acc) => {
              const isSelected = acc.id === selectedAccountId;
              const balance = currentBalanceByAccountId.get(acc.id) ?? 0;
              
              return (
                <div
                  key={acc.id}
                  className={isSelected ? 'account-selector-item active' : 'account-selector-item'}
                  onClick={() => void ensureSavedBeforeSwitch(acc.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      void ensureSavedBeforeSwitch(acc.id);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="account-selector-item-left">
                    <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: acc.type === 'Checking' ? '#d97706' : '#a78bfa' }}>
                      {acc.type === 'Checking' ? 'payments' : 'savings'}
                    </span>
                    <span className="account-selector-item-name">{acc.name}</span>
                    <span className="account-selector-item-type">({acc.type})</span>
                  </div>
                  <div className="account-selector-item-right">
                    <span className="account-selector-item-bal">Current Balance: {formatMoney(balance)}</span>
                    <button
                      className="link-button"
                      type="button"
                      aria-label={`Edit ${acc.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditAccountModal(acc);
                      }}
                      style={{ minHeight: 'auto', padding: 0 }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>edit</span>
                    </button>
                    <button
                      className="link-button link-button-danger"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteAccount(acc.id);
                      }}
                      style={{ minHeight: 'auto', padding: 0 }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>close</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* POP-UP MODAL: ADD ACCOUNT */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={closeAccountModal}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <h2>{isEditingAccount ? 'Edit Account' : 'Add New Account'}</h2>
            <p>Configure starting details for a checking or savings account.</p>
            <div className="modal-form">
              <label className="field">
                <span>Account Name</span>
                <input
                  value={modalDraft.name}
                  onChange={(e) => setModalDraft({ ...modalDraft, name: e.target.value })}
                  placeholder="e.g. Liberty Federal Credit Union"
                  maxLength={maxAccountNameLength}
                  autoFocus
                />
              </label>
              
              <label className="field">
                <span>Account Type</span>
                <select
                  value={modalDraft.type}
                  onChange={(e) =>
                    setModalDraft({ ...modalDraft, type: e.target.value as AccountType })
                  }
                  style={{ border: '1.5px solid var(--md-sys-color-outline)', borderRadius: 'var(--md-sys-shape-corner-s)', height: '48px', color: 'var(--md-sys-color-on-surface)', backgroundColor: 'transparent', padding: '10px' }}
                >
                  <option value="Checking" style={{ backgroundColor: 'var(--md-sys-color-surface)' }}>Checking</option>
                  <option value="Savings" style={{ backgroundColor: 'var(--md-sys-color-surface)' }}>Savings</option>
                </select>
              </label>

              <label className="field">
                <span>Starting Balance</span>
                <div className="input-wrapper">
                  <span className="input-prefix" aria-hidden="true">$</span>
                  <input
                    value={modalDraft.startingBalance}
                    onChange={(e) =>
                      setModalDraft({ ...modalDraft, startingBalance: e.target.value })
                    }
                    placeholder="0.00"
                    inputMode="decimal"
                    maxLength={14}
                    data-has-prefix="true"
                  />
                </div>
              </label>

              <label className="field">
                <span>Start Month</span>
                <input
                  type="month"
                  value={toMonthInputValue(modalDraft.startDate)}
                  onChange={(e) =>
                    setModalDraft({ ...modalDraft, startDate: toStoredMonthStart(e.target.value) })
                  }
                />
              </label>

              <label className="field">
                <span>Yield / APY (%)</span>
                <input
                  type="number"
                  step="0.01"
                  value={modalDraft.yieldRate}
                  onChange={(e) => setModalDraft({ ...modalDraft, yieldRate: e.target.value })}
                  placeholder="e.g. 4.5"
                />
              </label>

              {modalDraft.type === 'Checking' && (
                <label className="field">
                  <span>Associated Savings Account</span>
                  <select
                    value={modalDraft.savingsAccountId}
                    onChange={(e) =>
                      setModalDraft({ ...modalDraft, savingsAccountId: e.target.value })
                    }
                    style={{ border: '1.5px solid var(--md-sys-color-outline)', borderRadius: 'var(--md-sys-shape-corner-s)', height: '48px', color: 'var(--md-sys-color-on-surface)', backgroundColor: 'transparent', padding: '10px' }}
                  >
                    <option value="" style={{ backgroundColor: 'var(--md-sys-color-surface)' }}>-- No Associated Savings Account --</option>
                    {(accounts || [])
                      .filter((acc) => acc.type === 'Savings' && acc.id !== modalAccountId)
                      .map((acc) => (
                        <option key={acc.id} value={acc.id} style={{ backgroundColor: 'var(--md-sys-color-surface)' }}>
                          {acc.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}

              <fieldset className="field compact-fieldset">
                <span>Credited Income</span>
                <div className="income-credit-table">
                  {incomeSources.length === 0 ? (
                    <span className="income-credit-empty">
                      No income sources available.
                    </span>
                  ) : (
                    <>
                      <div className="income-credit-row income-credit-row-header" aria-hidden="true">
                        <span>Use</span>
                        <span>Income Source</span>
                        <span>Status</span>
                      </div>
                      {incomeSources.map((source) => {
                        const assignedAccount = assignedIncomeAccountBySourceId.get(source.id);
                        const isChecked = modalDraft.assignedIncomeSourceIds.includes(source.id);
                        const isDisabled = Boolean(assignedAccount);

                        return (
                          <label
                            key={source.id}
                            className={`income-credit-row${isDisabled ? ' income-credit-row-disabled' : ''}`}
                          >
                            <span className="income-credit-control">
                              <input
                                className="income-credit-checkbox"
                                type="checkbox"
                                aria-label={`Credit ${source.name} to this account`}
                                checked={isChecked}
                                disabled={isDisabled}
                                onChange={() => toggleModalIncomeSource(source.id)}
                              />
                            </span>
                            <span className="income-credit-name">{source.name}</span>
                            <span className="income-credit-status">
                              {assignedAccount
                                ? `Assigned to ${assignedAccount.name}`
                                : isChecked
                                  ? 'Credits this account'
                                  : 'Available'}
                            </span>
                          </label>
                        );
                      })}
                    </>
                  )}
                </div>
              </fieldset>
            </div>

            <div className="modal-actions">
              <button className="secondary-action" type="button" onClick={closeAccountModal}>
                Cancel
              </button>
              <button
                className="primary-action"
                type="button"
                onClick={() => void saveModalAccount()}
                disabled={
                  !isModalAccountValid ||
                  isSaving
                }
              >
                {isSaving ? 'Saving...' : isEditingAccount ? 'Save Account' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isColumnModalOpen && (
        <div className="modal-overlay" onClick={closeColumnModal}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <h2>Add Ledger Column</h2>
            <div className="modal-form">
              <fieldset className="field compact-fieldset">
                <span>Column Type</span>
                <div className="column-mode-options">
                  <label className={`column-mode-option${columnModalMode === 'custom' ? ' selected' : ''}`}>
                    <input
                      className="compact-radio"
                      type="radio"
                      name="column-mode"
                      checked={columnModalMode === 'custom'}
                      onChange={() => setColumnModalMode('custom')}
                    />
                    <span>Add Custom Column</span>
                  </label>
                  <label className={`column-mode-option${columnModalMode === 'budget' ? ' selected' : ''}`}>
                    <input
                      className="compact-radio"
                      type="radio"
                      name="column-mode"
                      checked={columnModalMode === 'budget'}
                      onChange={() => setColumnModalMode('budget')}
                    />
                    <span>Add Budget Item</span>
                  </label>
                </div>
              </fieldset>

              {columnModalMode === 'custom' ? (
                <label className="field">
                  <span>Column Name</span>
                  <input
                    aria-label="New account column name"
                    value={newColumnName}
                    onChange={(e) => setNewColumnName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addColumnFromModal();
                      }
                    }}
                    placeholder="Column name"
                    autoFocus
                  />
                </label>
              ) : (
                <>
                  <label className="field">
                    <span>Budget Category</span>
                    <select
                      aria-label="Budget category to associate"
                      value={selectedBudgetCategoryId}
                      onChange={(e) => {
                        setSelectedBudgetCategoryId(e.target.value);
                        setSelectedBudgetSubCategoryId('');
                      }}
                    >
                      <option value="">Budget category</option>
                      {budgetCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Budget Sub-Category</span>
                    <select
                      aria-label="Budget sub-category to associate"
                      value={selectedBudgetSubCategoryId}
                      onChange={(e) => setSelectedBudgetSubCategoryId(e.target.value)}
                      disabled={!selectedBudgetCategory}
                    >
                      <option value="">--</option>
                      {selectedBudgetCategory?.subCategories.map((subCategory) => (
                        <option key={subCategory.id} value={subCategory.id}>
                          {subCategory.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>

            <div className="modal-actions">
              <button className="secondary-action" type="button" onClick={closeColumnModal}>
                Cancel
              </button>
              <button
                className="primary-action"
                type="button"
                onClick={addColumnFromModal}
                disabled={
                  columnModalMode === 'custom'
                    ? !newColumnName.trim()
                    : !selectedBudgetAssociation
                }
              >
                Add Column
              </button>
            </div>
          </div>
        </div>
      )}

      {draftAccount ? (
        <>
          {/* WORKSPACE DETAIL WORKSPACE WITH INLINE SPENDING COLUMN CONFIGURATOR */}
          <section className="budget-right" style={{ padding: '20px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--md-sys-color-outline-variant)', paddingBottom: '12px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--md-sys-font-display)', fontWeight: 800 }}>
                  {draftAccount.name || 'Untitled Account'}
                  <button className="edit-title-btn" aria-label="Edit account" onClick={() => openEditAccountModal(draftAccount)}>
                    <span className="material-symbols-outlined">edit</span>
                  </button>
                </h2>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="primary-action"
                  type="button"
                  disabled={!isDirty || isSaving}
                  onClick={() => void saveAccountChanges()}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }} aria-hidden="true">save</span>
                  {isSaving ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </div>

            {/* Outlined Summary Section containing the remaining four badges */}
            <div style={{ border: '1.5px solid var(--md-sys-color-outline-variant)', borderRadius: 'var(--md-sys-shape-corner-m)', padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px', backgroundColor: 'rgba(255, 255, 255, 0.015)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--md-sys-color-on-surface-variant)' }}>Total Credits (Year)</span>
                <strong style={{ fontSize: '1.1rem', fontWeight: 800, color: '#34d399' }}>{formatMoney(summaryTotals.creditSum)}</strong>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--md-sys-color-on-surface-variant)' }}>Total Expenses (Year)</span>
                <strong style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--md-sys-color-error)' }}>
                  {summaryTotals.expenseSum > 0 ? `-${formatMoney(summaryTotals.expenseSum)}` : formatMoney(0)}
                </strong>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--md-sys-color-on-surface-variant)' }}>Total Investments (Year)</span>
                <strong style={{ fontSize: '1.1rem', fontWeight: 800, color: '#38bdf8' }}>{formatMoney(summaryTotals.investSum)}</strong>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--md-sys-color-on-surface-variant)' }}>Total Savings (Year)</span>
                <strong style={{ fontSize: '1.1rem', fontWeight: 800, color: '#38bdf8' }}>{formatMoney(summaryTotals.savingsSum)}</strong>
              </div>
            </div>

            {/* Read-only account details */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 420px)', gap: '20px', marginBottom: '16px' }}>
              <div
                aria-label="Account details"
                style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}
              >
                <div className="status-badge" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', padding: '12px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-on-surface-variant)' }}>Start Month</span>
                  <strong style={{ fontSize: '0.95rem' }}>{formatMonthYear(draftAccount.startDate)}</strong>
                </div>
                <div className="status-badge" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', padding: '12px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-on-surface-variant)' }}>Yield / APY</span>
                  <strong style={{ fontSize: '0.95rem' }}>{draftAccount.yieldRate}%</strong>
                </div>
              </div>
            </div>

            {/* FULL WIDTH LEDGER GRID WITH TIGHT PADDING AND NO FOOTER TOTALS */}
            <div className="excel-table-fullwidth">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                <button
                  className="secondary-action"
                  type="button"
                  onClick={openColumnModal}
                  style={{ minHeight: '30px', padding: '0 10px', fontSize: '0.75rem' }}
                >
                  Add
                </button>
              </div>
              <div className="excel-wrapper" style={{ margin: 0 }}>
                <table className="excel-table">
                  <thead>
                    <tr>
                      <th><div className="excel-th-content">Month<span className="excel-filter-arrow">▾</span></div></th>
                      <th><div className="excel-th-content">Start<span className="excel-filter-arrow">▾</span></div></th>
                      
                      {/* Credit Header: always green, has derivation tooltip */}
                      <th title="Credit inflows, derivable from Income Management rules" style={{ borderBottom: '2.5px solid #34d399' }}>
                        <div className="excel-th-content excel-col-credit">
                          <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>add_circle</span>
                          <span>Credit</span>
                          <span className="excel-filter-arrow">▾</span>
                        </div>
                      </th>

                      {/* Active category columns */}
                      {activeColumns.map((col, index) => (
                        <th
                          key={col.id}
                          title={col.name}
                          onMouseEnter={() => setHoveredColumnId(col.id)}
                          onMouseLeave={() => setHoveredColumnId((current) => (current === col.id ? null : current))}
                        >
                          <div className="excel-th-content" style={{ gap: '4px' }}>
                            <button
                              className="link-button"
                              type="button"
                              aria-label={`Move ${col.name} left`}
                              disabled={index === 0}
                              onClick={() => moveAccountColumn(col.id, -1)}
                              style={{
                                minHeight: 'auto',
                                padding: 0,
                                visibility: hoveredColumnId === col.id ? 'visible' : 'hidden',
                              }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>chevron_left</span>
                            </button>
                            {col.icon && (
                              <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                                {col.icon}
                              </span>
                            )}
                            <span>{col.name.length > 15 ? `${col.name.slice(0, 12)}...` : col.name}</span>
                            <button
                              className="link-button"
                              type="button"
                              aria-label={`Remove ${col.name}`}
                              onClick={() => removeAccountColumn(col.id)}
                              style={{ minHeight: 'auto', padding: 0 }}
                            >
                              <span style={{ fontSize: '0.85rem', lineHeight: 1 }}>[x]</span>
                            </button>
                            <button
                              className="link-button"
                              type="button"
                              aria-label={`Move ${col.name} right`}
                              disabled={index === activeColumns.length - 1}
                              onClick={() => moveAccountColumn(col.id, 1)}
                              style={{
                                minHeight: 'auto',
                                padding: 0,
                                visibility: hoveredColumnId === col.id ? 'visible' : 'hidden',
                              }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>chevron_right</span>
                            </button>
                          </div>
                        </th>
                      ))}
                      <th><div className="excel-th-content">Expenses<span className="excel-filter-arrow">▾</span></div></th>
                      <th><div className="excel-th-content">SubTotal<span className="excel-filter-arrow">▾</span></div></th>
                      
                      {/* Invest Column Header: Special style */}
                      <th className="excel-col-special-header" title="Investment outflows">
                        <div className="excel-th-content">
                          <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>trending_up</span>
                          <span>Invest</span>
                          <span className="excel-filter-arrow">▾</span>
                        </div>
                      </th>

                      {/* Savings Column Header: Special style */}
                      <th className="excel-col-special-header" title="Savings allocations">
                        <div className="excel-th-content">
                          <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>savings</span>
                          <span>Savings</span>
                          <span className="excel-filter-arrow">▾</span>
                        </div>
                      </th>

                      <th style={{ color: 'var(--md-sys-color-primary)' }}><div className="excel-th-content">Net Total<span className="excel-filter-arrow">▾</span></div></th>
                    </tr>
                  </thead>
                  <tbody>
                    {computedRecords.map((row, m) => {
                      const isCurrent = row.month === currentProjectionMonth.name;
                      // Forecast calculations are standard, no amber highlighting
                      const isForecast = ['Aug-26', 'Sep-26', 'Oct-26', 'Nov-26', 'Dec-26'].includes(row.month);
                      const rowClass = isCurrent
                        ? 'excel-row-current'
                        : isForecast
                        ? 'excel-row-forecast'
                        : 'excel-row-actual';

                      return (
                        <tr key={row.month} className={rowClass}>
                          <td className="excel-bold-col" style={{ color: isCurrent ? '#a78bfa' : 'var(--md-sys-color-on-surface)' }}>{row.month}</td>
                          <td>
                            <span className="excel-cell-val">{formatMoney(row.start)}</span>
                          </td>
                          <td className="excel-col-credit">
                            <span className="excel-cell-val excel-bold-col" style={{ color: '#34d399' }}>
                              {formatMoney(row.credit)}
                            </span>
                          </td>
                          {activeColumns.map((col) => (
                            <td key={col.id}>
                              <ExcelCellInput
                                value={row.outflows[col.id] || 0}
                                onChange={(val) => updateOutflowCell(m, col.id, val)}
                                focusId={`outflow-${col.id}-${m}`}
                                nextFocusId={
                                  m < computedRecords.length - 1 ? `outflow-${col.id}-${m + 1}` : undefined
                                }
                                fillDownLabel={`Auto-populate ${col.name} from ${row.month} down`}
                                onFillDown={(val) => fillDownOutflowCell(m, col.id, val)}
                              />
                            </td>
                          ))}
                          <td>
                            <span className="excel-cell-val excel-bold-col" style={{ color: 'var(--md-sys-color-error)' }}>
                              {row.expenses > 0 ? `-${formatMoney(row.expenses)}` : (row.expenses < 0 ? formatMoney(Math.abs(row.expenses)) : '$   -   ')}
                            </span>
                          </td>
                          <td>
                            <span className="excel-cell-val excel-bold-col">{formatMoney(row.subtotal)}</span>
                          </td>
                          <td className="excel-col-special">
                            <ExcelCellInput
                              value={row.invest}
                              onChange={(val) => updateCell(m, 'invest', val)}
                              focusId={`invest-${m}`}
                              nextFocusId={m < computedRecords.length - 1 ? `invest-${m + 1}` : undefined}
                              fillDownLabel={`Auto-populate Invest from ${row.month} down`}
                              onFillDown={(val) => fillDownCell(m, 'invest', val)}
                            />
                          </td>
                          <td className="excel-col-special">
                            <ExcelCellInput
                              value={row.savings}
                              onChange={(val) => updateCell(m, 'savings', val)}
                              focusId={`savings-${m}`}
                              nextFocusId={m < computedRecords.length - 1 ? `savings-${m + 1}` : undefined}
                              fillDownLabel={`Auto-populate Savings from ${row.month} down`}
                              onFillDown={(val) => fillDownCell(m, 'savings', val)}
                              disabled={
                                draftAccount?.type === 'Savings' ||
                                (draftAccount?.type === 'Checking' && !draftAccount?.savingsAccountId)
                              }
                            />
                          </td>
                          <td>
                            <span className="excel-cell-val excel-bold-col" style={{ color: 'var(--md-sys-color-primary)', fontWeight: '800' }}>
                              {formatMoney(row.net)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      ) : (
        <div className="empty-state">
          <span className="material-symbols-outlined" aria-hidden="true">ads_click</span>
          <h2>Select an account</h2>
          <p>Choose an account above to edit ledger values and forecast.</p>
        </div>
      )}
    </main>
  );
}
