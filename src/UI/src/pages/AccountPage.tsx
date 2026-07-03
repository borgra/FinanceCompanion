import { useEffect, useMemo, useState } from 'react';
import type { IncomeSourceRepository } from '../domain/incomeSourceRepository';
import type { BudgetRepository } from '../domain/budgetRepository';
import type { AccountRepository } from '../domain/accountRepository';
import {
  type Account,
  type AccountDraft,
  type AccountColumn,
  type AccountType,
  emptyAccountDraft,
  toAccountDraft,
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

const formatMoney = (amount: number) => {
  if (amount < 0) {
    return `(${currencyFormatter.format(Math.abs(amount))})`;
  }
  if (amount === 0) {
    return '$   -   ';
  }
  return currencyFormatter.format(amount);
};

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

type ExcelCellInputProps = {
  value: number;
  onChange: (val: string) => void;
  className?: string;
};

function ExcelCellInput({ value, onChange, className = '' }: ExcelCellInputProps) {
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

  return (
    <input
      type="text"
      className={`excel-cell-input ${className}`}
      value={isFocused ? tempValue : formatMoney(value)}
      onChange={(e) => setTempValue(e.target.value)}
      onFocus={() => setIsFocused(true)}
      onBlur={handleBlur}
    />
  );
}

export function AccountPage({
  accountRepository,
}: AccountPageProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
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

  const isEditingAccount = modalAccountId !== null;
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

  // Add Column modal states
  const [isColModalOpen, setIsColModalOpen] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColIcon, setNewColIcon] = useState('payments');

  // Double-sure Column Delete prompt states
  const [colToDelete, setColToDelete] = useState<AccountColumn | null>(null);
  const [colDeleteConfirmInput, setColDeleteConfirmInput] = useState('');

  // Built-in icon options for column modal selector
  const iconOptions = [
    { value: 'payments', label: 'Cash (💵)' },
    { value: 'credit_card', label: 'Credit Card (💳)' },
    { value: 'home', label: 'House (🏠)' },
    { value: 'bolt', label: 'Utilities (⚡)' },
    { value: 'shopping_cart', label: 'Shopping (🛒)' },
    { value: 'directions_car', label: 'Car (🚗)' },
    { value: 'flight', label: 'Travel (✈️)' },
    { value: 'trending_up', label: 'Investing (📈)' },
    { value: 'savings', label: 'Savings (🐷)' },
    { value: 'celebration', label: 'Fun (🎉)' },
  ];

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

  // Load accounts
  const loadAllData = async () => {
    setIsLoading(true);
    setLoadError(undefined);
    try {
      const accts = await accountRepository.listAccounts();
      setAccounts(accts);
      setSelectedAccountId((prev) => prev ?? accts[0]?.id);
    } catch {
      setLoadError('Failed to load accounts. Try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadAllData();
  }, [accountRepository]);

  // Sync draft state on account switch
  useEffect(() => {
    if (!selectedAccount) return;
    setDraftAccount(JSON.parse(JSON.stringify(selectedAccount)));
    setIsDirty(false);
    setSaveError(undefined);
  }, [selectedAccountId, accounts]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId),
    [accounts, selectedAccountId],
  );

  const refreshAccounts = async (preferredSelectedId?: string) => {
    const list = await accountRepository.listAccounts();
    setAccounts(list);
    setSelectedAccountId((prev) => {
      const nextSelectedId = preferredSelectedId ?? prev;
      return nextSelectedId && list.some((a) => a.id === nextSelectedId)
        ? nextSelectedId
        : list[0]?.id;
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
      const draftInput: AccountDraft = {
        name: draftAccount.name,
        type: draftAccount.type,
        startingBalance: String(draftAccount.startingBalance),
        startDate: draftAccount.startDate,
        yieldRate: String(draftAccount.yieldRate),
        columns: draftAccount.columns,
        monthlyRecords: draftAccount.monthlyRecords,
      };
      await accountRepository.updateAccount(selectedAccountId, draftInput);
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
      const draftInput: AccountDraft = {
        name,
        type: modalDraft.type,
        startingBalance: String(balanceNum),
        startDate: modalDraft.startDate || '2026-01-01',
        yieldRate: String(Number(modalDraft.yieldRate) || 0),
        columns: modalDraft.columns,
        monthlyRecords: modalDraft.monthlyRecords,
      };

      if (isEditingAccount && modalAccountId) {
        await accountRepository.updateAccount(modalAccountId, draftInput);
        await refreshAccounts(modalAccountId);
      } else {
        const createdAccount = await accountRepository.createAccount(draftInput);
        await refreshAccounts(createdAccount.id);
      }

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

  // Add category column
  const handleAddColumn = () => {
    if (!draftAccount) return;
    const name = newColName.trim();
    if (!name) return;
    const colId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const existingSoftDeletedIdx = draftAccount.columns.findIndex(c => c.id === colId);
    let nextColumns = [...draftAccount.columns];

    if (existingSoftDeletedIdx > -1) {
      // Reactivate soft-deleted column
      nextColumns[existingSoftDeletedIdx] = {
        ...nextColumns[existingSoftDeletedIdx],
        name,
        icon: newColIcon,
        isDeleted: false,
      };
    } else {
      nextColumns.push({
        id: colId,
        name,
        icon: newColIcon,
      });
    }

    setDraftAccount({
      ...draftAccount,
      columns: nextColumns,
    });
    setIsDirty(true);
    
    // Reset and close
    setNewColName('');
    setNewColIcon('payments');
    setIsColModalOpen(false);
  };

  // Trigger double-sure prompt modal for column soft-deletion
  const triggerSoftDeleteColumn = (col: AccountColumn) => {
    setColToDelete(col);
    setColDeleteConfirmInput('');
  };

  const confirmSoftDeleteColumn = () => {
    if (!draftAccount || !colToDelete) return;
    setDraftAccount({
      ...draftAccount,
      columns: draftAccount.columns.map((c) =>
        c.id === colToDelete.id ? { ...c, isDeleted: true } : c,
      ),
    });
    setIsDirty(true);
    setColToDelete(null);
    setColDeleteConfirmInput('');
  };

  // Reorder active columns in draftAccount
  const moveColumn = (index: number, direction: 'up' | 'down') => {
    if (!draftAccount) return;
    const nextColumns = [...draftAccount.columns];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= nextColumns.length) return;

    // Swap
    const temp = nextColumns[index];
    nextColumns[index] = nextColumns[targetIdx];
    nextColumns[targetIdx] = temp;

    setDraftAccount({
      ...draftAccount,
      columns: nextColumns,
    });
    setIsDirty(true);
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

  // Filter only active (non-soft-deleted) columns for ledger rendering and calculations
  const activeColumns = useMemo(() => {
    if (!draftAccount) return [];
    return draftAccount.columns.filter((c) => !c.isDeleted);
  }, [draftAccount]);

  // Simulation calculations with dynamic balance realization and cascading
  const computedRecords = useMemo((): ComputedRecord[] => {
    if (!draftAccount) return [];

    let currentStart = 0;
    let balanceRealized = false;
    const startCode = draftAccount.startDate ? draftAccount.startDate.slice(0, 7) : '2026-01';

    return draftAccount.monthlyRecords.map((record) => {
      const monthCode = projectionMonths.find((m) => m.name === record.month)?.dateCode || '2026-01';

      let start = 0;
      let credit = 0;
      let expenses = 0;
      const outflows: Record<string, number> = {};
      let invest = 0;
      let savings = 0;
      let net = 0;

      if (monthCode < startCode) {
        start = 0;
        net = 0;
      } else {
        if (!balanceRealized) {
          start = Number(draftAccount.startingBalance) || 0;
          balanceRealized = true;
        } else {
          start = currentStart;
        }

        credit = Number(record.credit) || 0;
        // Map and sum only active column outflow values
        activeColumns.forEach((col) => {
          const val = Number(record.outflows[col.id]) || 0;
          outflows[col.id] = val;
          expenses += val;
        });

        invest = Number(record.invest) || 0;
        savings = Number(record.savings) || 0;
        net = start + credit - expenses - invest - savings;

        currentStart = net;
      }

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
  }, [draftAccount, activeColumns, projectionMonths]);

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
          <p className="eyebrow">Accounting Ledger</p>
          <h1>Account Management</h1>
          <p>
            Forecast monthly allocations and propagate start/end balances over the calendar year.
          </p>
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
            Select Bank Account
          </span>
          <button
            className="secondary-action"
            type="button"
            onClick={openCreateAccountModal}
            style={{ minHeight: '28px', padding: '0 10px', fontSize: '0.75rem', borderRadius: 'var(--md-sys-shape-corner-s)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add</span>
            Add New Account
          </button>
        </div>

        <div className="accounts-vertical-stack" role="list" style={{ maxWidth: accountSelectorMaxWidth }}>
          {isLoading ? (
            <div style={{ fontSize: '0.85rem', padding: '8px' }}>Loading accounts...</div>
          ) : accounts.length === 0 ? (
            <div style={{ fontSize: '0.85rem', padding: '8px', fontStyle: 'italic' }}>No accounts. Add one.</div>
          ) : (
            accounts.map((acc) => {
              const isSelected = acc.id === selectedAccountId;
              const balance = acc.id === draftAccount?.id ? summaryTotals.checkingEnding : (acc.monthlyRecords.slice(-1)[0]?.credit || acc.startingBalance);
              
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
                <span>Start Realization Date</span>
                <input
                  type="date"
                  value={modalDraft.startDate}
                  onChange={(e) => setModalDraft({ ...modalDraft, startDate: e.target.value })}
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

      {/* POP-UP MODAL: ADD SPENDING COLUMN */}
      {isColModalOpen && (
        <div className="modal-overlay" onClick={() => setIsColModalOpen(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <h2>Add Spending Category Column</h2>
            <p>Create a manual column for the ledger grid.</p>
            <div className="modal-form">
              <label className="field">
                <span>Category Name</span>
                <input
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  placeholder="e.g. American Express - Platinum"
                  autoFocus
                />
              </label>

              <label className="field">
                <span>Category Icon</span>
                <select
                  value={newColIcon}
                  onChange={(e) => setNewColIcon(e.target.value)}
                  style={{ border: '1.5px solid var(--md-sys-color-outline)', borderRadius: 'var(--md-sys-shape-corner-s)', height: '48px', color: 'var(--md-sys-color-on-surface)', backgroundColor: 'transparent', padding: '10px' }}
                >
                  {iconOptions.map((opt) => (
                    <option key={opt.value} value={opt.value} style={{ backgroundColor: 'var(--md-sys-color-surface)' }}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="modal-actions">
              <button className="secondary-action" type="button" onClick={() => setIsColModalOpen(false)}>
                Cancel
              </button>
              <button
                className="primary-action"
                type="button"
                onClick={handleAddColumn}
                disabled={!newColName.trim()}
              >
                Add Column
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POP-UP MODAL: DOUBLE-SURE DELETE COLUMN CONFIRM */}
      {colToDelete && (
        <div className="modal-overlay" onClick={() => setColToDelete(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: 'var(--md-sys-color-error)' }}>Doubly-Sure Column Deletion</h2>
            <p>
              Are you sure you want to soft-delete <strong>"{colToDelete.name}"</strong>? 
              Its historical values will be retained, but it will be hidden from the ledger layout and excluded from expenses sum calculations.
            </p>
            <div className="modal-form">
              <label className="field">
                <span>Type the category name exact matching <strong>"{colToDelete.name}"</strong> to confirm:</span>
                <input
                  value={colDeleteConfirmInput}
                  onChange={(e) => setColDeleteConfirmInput(e.target.value)}
                  placeholder={colToDelete.name}
                  autoFocus
                />
              </label>
            </div>

            <div className="modal-actions">
              <button className="secondary-action" type="button" onClick={() => setColToDelete(null)}>
                Cancel
              </button>
              <button
                className="primary-action"
                type="button"
                onClick={confirmSoftDeleteColumn}
                disabled={colDeleteConfirmInput !== colToDelete.name}
                style={{ backgroundColor: 'var(--md-sys-color-error)', color: '#ffffff' }}
              >
                Confirm Soft-Delete
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

            {/* Read-only account details and inline columns chips */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '20px', marginBottom: '16px' }}>
              <div
                aria-label="Account details"
                style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}
              >
                <div className="status-badge" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', padding: '12px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-on-surface-variant)' }}>Start Date</span>
                  <strong style={{ fontSize: '0.95rem' }}>{draftAccount.startDate}</strong>
                </div>
                <div className="status-badge" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', padding: '12px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-on-surface-variant)' }}>Yield / APY</span>
                  <strong style={{ fontSize: '0.95rem' }}>{draftAccount.yieldRate}%</strong>
                </div>
              </div>

              {/* Spending categories columns inline editor */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Spending Columns Order & Categories</span>
                  <button
                    className="secondary-action"
                    type="button"
                    onClick={() => setIsColModalOpen(true)}
                    style={{ minHeight: '26px', padding: '0 8px', fontSize: '0.75rem', borderRadius: 'var(--md-sys-shape-corner-s)' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>add</span>
                    Add Category Column
                  </button>
                </div>

                {/* Compact inline chips for category list with Order Controls */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px', maxHeight: '110px', overflowY: 'auto' }}>
                  {draftAccount.columns.filter(c => !c.isDeleted).length === 0 ? (
                    <span style={{ fontSize: '0.75rem', fontStyle: 'italic', color: 'var(--md-sys-color-on-surface-variant)' }}>
                      No active columns. Click Add Category Column.
                    </span>
                  ) : (
                    draftAccount.columns.map((col, idx) => {
                      if (col.isDeleted) return null;
                      return (
                        <span
                          key={col.id}
                          className="status-badge"
                          style={{
                            backgroundColor: 'var(--md-sys-color-surface-container-high)',
                            border: '1px solid var(--md-sys-color-outline)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 6px',
                            fontSize: '0.75rem',
                            borderRadius: 'var(--md-sys-shape-corner-xs)',
                            textTransform: 'none',
                            color: 'var(--md-sys-color-on-surface)',
                          }}
                        >
                          {col.icon && (
                            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                              {col.icon}
                            </span>
                          )}
                          <strong style={{ marginRight: '4px' }}>{col.name}</strong>

                          {/* Reordering Up/Down controls */}
                          <button
                            type="button"
                            onClick={() => moveColumn(idx, 'up')}
                            disabled={idx === 0}
                            style={{ background: 'transparent', border: 'none', padding: 0, opacity: idx === 0 ? 0.3 : 0.7, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                            title="Move Left"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>arrow_back</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => moveColumn(idx, 'down')}
                            disabled={idx === draftAccount.columns.length - 1}
                            style={{ background: 'transparent', border: 'none', padding: 0, opacity: idx === draftAccount.columns.length - 1 ? 0.3 : 0.7, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                            title="Move Right"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>arrow_forward</span>
                          </button>

                          {/* Soft delete confirmation prompt */}
                          <button
                            type="button"
                            onClick={() => triggerSoftDeleteColumn(col)}
                            style={{ background: 'transparent', border: 'none', padding: 0, display: 'flex', alignItems: 'center', cursor: 'pointer', marginLeft: '2px' }}
                            title="Soft Delete Column"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '13px', color: 'var(--md-sys-color-error)' }}>close</span>
                          </button>
                        </span>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* FULL WIDTH LEDGER GRID WITH TIGHT PADDING AND NO FOOTER TOTALS */}
            <div className="excel-table-fullwidth">
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
                      {activeColumns.map((col) => (
                        <th key={col.id} title={col.name}>
                          <div className="excel-th-content">
                            {col.icon && (
                              <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                                {col.icon}
                              </span>
                            )}
                            <span>{col.name.length > 15 ? `${col.name.slice(0, 12)}...` : col.name}</span>
                            <span className="excel-filter-arrow">▾</span>
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
                      const isCurrent = row.month === 'Jul-26';
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
                            <ExcelCellInput
                              value={row.credit}
                              onChange={(val) => updateCell(m, 'credit', val)}
                              className="excel-col-credit"
                            />
                          </td>
                          {activeColumns.map((col) => (
                            <td key={col.id}>
                              <ExcelCellInput
                                value={row.outflows[col.id] || 0}
                                onChange={(val) => updateOutflowCell(m, col.id, val)}
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
                            />
                          </td>
                          <td className="excel-col-special">
                            <ExcelCellInput
                              value={row.savings}
                              onChange={(val) => updateCell(m, 'savings', val)}
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
