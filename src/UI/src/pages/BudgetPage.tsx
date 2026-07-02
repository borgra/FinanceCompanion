import { useEffect, useMemo, useState } from 'react';
import type { IncomeSourceRepository } from '../domain/incomeSourceRepository';
import type {
  BudgetCategoryWithSubCategories,
  BudgetSubCategory,
} from '../domain/budget';
import type { BudgetRepository } from '../domain/budgetRepository';
import {
  calculateMonthlyAmount,
  calculateYearlyNetAmount,
  findDisplayPeriod,
} from '../features/incomeSources/salaryPeriodUtils';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const formatMoney = (amount: number) => currencyFormatter.format(amount);

type BudgetPageProps = {
  incomeRepository: IncomeSourceRepository;
  budgetRepository: BudgetRepository;
};

type IncomeTotals = {
  monthlyGross: number;
  monthlyNet: number;
  yearlyGross: number;
  yearlyNet: number;
};

const emptyIncomeTotals = (): IncomeTotals => ({
  monthlyGross: 0,
  monthlyNet: 0,
  yearlyGross: 0,
  yearlyNet: 0,
});

const parsePositiveUsd = (raw: string) => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
};

export function BudgetPage({ incomeRepository, budgetRepository }: BudgetPageProps) {
  const [categories, setCategories] = useState<BudgetCategoryWithSubCategories[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] =
    useState<string | undefined>(undefined);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();

  const [incomeTotals, setIncomeTotals] = useState<IncomeTotals>(emptyIncomeTotals());
  const [incomeLoading, setIncomeLoading] = useState(true);
  const [incomeError, setIncomeError] = useState<string | undefined>();

  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  const [newSubName, setNewSubName] = useState('');
  const [newSubAmount, setNewSubAmount] = useState('');
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editingSubName, setEditingSubName] = useState('');
  const [editingSubAmount, setEditingSubAmount] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setLoadError(undefined);
      try {
        const next = await budgetRepository.listCategoriesWithSubCategories();
        if (cancelled) return;
        setCategories(next);
        setSelectedCategoryId((prev) => prev ?? next[0]?.id);
      } catch {
        if (cancelled) return;
        setLoadError('Budget categories could not be loaded. Try again.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [budgetRepository]);

  useEffect(() => {
    let cancelled = false;
    const loadIncomeTotals = async () => {
      setIncomeLoading(true);
      setIncomeError(undefined);
      try {
        const sources = await incomeRepository.listIncomeSources();
        if (cancelled) return;

        const activeSources = sources.filter((s) => s.status === 'Active');

        const monthlyGross = activeSources.reduce((sum, s) => {
          const period = findDisplayPeriod(s);
          return sum + calculateMonthlyAmount(period.yearlyGrossAmount);
        }, 0);

        const monthlyNet = activeSources.reduce((sum, s) => {
          const period = findDisplayPeriod(s);
          return sum + calculateMonthlyAmount(calculateYearlyNetAmount(period));
        }, 0);

        const yearlyGross = monthlyGross * 12;
        const yearlyNet = monthlyNet * 12;

        setIncomeTotals({ monthlyGross, monthlyNet, yearlyGross, yearlyNet });
      } catch {
        if (cancelled) return;
        setIncomeError('Income totals could not be calculated. Try again.');
      } finally {
        if (!cancelled) setIncomeLoading(false);
      }
    };

    void loadIncomeTotals();
    return () => {
      cancelled = true;
    };
  }, [incomeRepository]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === selectedCategoryId),
    [categories, selectedCategoryId],
  );

  const totals = useMemo(() => {
    const totalMonth = categories.reduce(
      (sum, cat) =>
        sum + cat.subCategories.reduce((s, sub) => s + sub.monthlyAmountUsd, 0),
      0,
    );

    const totalYear = totalMonth * 12;

    const percentGross =
      incomeTotals.yearlyGross > 0
        ? (totalYear / incomeTotals.yearlyGross) * 100
        : undefined;
    const percentNet =
      incomeTotals.yearlyNet > 0
        ? (totalYear / incomeTotals.yearlyNet) * 100
        : undefined;

    return {
      totalMonth,
      totalYear,
      percentGross,
      percentNet,
    };
  }, [categories, incomeTotals]);

  const refreshCategories = async () => {
    const next = await budgetRepository.listCategoriesWithSubCategories();
    setCategories(next);
    setSelectedCategoryId((prev) => prev ?? next[0]?.id);
  };

  const startEditCategory = (cat: BudgetCategoryWithSubCategories) => {
    setEditingCategoryId(cat.id);
    setEditingCategoryName(cat.name);
  };

  const cancelEditCategory = () => {
    setEditingCategoryId(null);
    setEditingCategoryName('');
  };

  const startEditSub = (sub: BudgetSubCategory) => {
    setEditingSubId(sub.id);
    setEditingSubName(sub.name);
    setEditingSubAmount(String(sub.monthlyAmountUsd));
  };

  const cancelEditSub = () => {
    setEditingSubId(null);
    setEditingSubName('');
    setEditingSubAmount('');
  };

  const addCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    await budgetRepository.createCategory(name);
    setNewCategoryName('');
    await refreshCategories();
  };

  const saveCategory = async () => {
    if (!editingCategoryId) return;
    const name = editingCategoryName.trim();
    if (!name) return;
    await budgetRepository.updateCategory(editingCategoryId, name);
    cancelEditCategory();
    await refreshCategories();
  };

  const deleteCategory = async (id: string) => {
    if (!window.confirm('Delete this category and all its sub-categories?')) return;
    await budgetRepository.deleteCategory(id);
    cancelEditCategory();
    await refreshCategories();
  };

  const addSubCategory = async () => {
    if (!selectedCategory) return;
    const name = newSubName.trim();
    const monthlyAmountUsd = parsePositiveUsd(newSubAmount);
    if (!name || monthlyAmountUsd === undefined) return;
    await budgetRepository.createSubCategory(
      selectedCategory.id,
      name,
      monthlyAmountUsd,
    );
    setNewSubName('');
    setNewSubAmount('');
    await refreshCategories();
  };

  const saveSubCategory = async () => {
    if (!editingSubId) return;
    const name = editingSubName.trim();
    const monthlyAmountUsd = parsePositiveUsd(editingSubAmount);
    if (!name || monthlyAmountUsd === undefined) return;

    await budgetRepository.updateSubCategory(
      editingSubId,
      name,
      monthlyAmountUsd,
    );
    cancelEditSub();
    await refreshCategories();
  };

  const deleteSubCategory = async (id: string) => {
    if (!window.confirm('Delete this sub-category?')) return;
    await budgetRepository.deleteSubCategory(id);
    cancelEditSub();
    await refreshCategories();
  };

  const currencyPlaceholder = '0.00';

  return (
    <main className="settings-embedded-shell settings-8bit budget-shell">
      <header className="page-header compact-header">
        <div>
          <p className="eyebrow">Configuration</p>
          <h1>Budget (Net)</h1>
          <p>
            Assign monthly $ values to sub-categories. Totals and % of income are calculated
            automatically.
          </p>
        </div>
      </header>

      {loadError ? (
        <div className="alert error-alert" role="alert">
          {loadError}
        </div>
      ) : null}

      <section className="budget-summary" aria-label="Budget summary">
        <div className="budget-summary-card">
          <span className="budget-summary-label">Total @ Month</span>
          <strong className="budget-summary-value">{formatMoney(totals.totalMonth)}</strong>
        </div>
        <div className="budget-summary-card">
          <span className="budget-summary-label">Total @ Year</span>
          <strong className="budget-summary-value">{formatMoney(totals.totalYear)}</strong>
        </div>
        <div className="budget-summary-card">
          <span className="budget-summary-label">% of Income (Gross)</span>
          <strong className="budget-summary-value">
            {incomeLoading ? (
              '—'
            ) : totals.percentGross === undefined ? (
              'N/A'
            ) : (
              `${totals.percentGross.toFixed(1)}%`
            )}
          </strong>
        </div>
        <div className="budget-summary-card">
          <span className="budget-summary-label">% of Income (Net)</span>
          <strong className="budget-summary-value">
            {incomeLoading ? (
              '—'
            ) : totals.percentNet === undefined ? (
              'N/A'
            ) : (
              `${totals.percentNet.toFixed(1)}%`
            )}
          </strong>
        </div>
      </section>

      <section className="budget-main-grid" aria-label="Budget categories">
        <div className="budget-left">
          {isLoading ? (
            <div className="empty-state">Loading categories...</div>
          ) : categories.length === 0 ? (
            <div className="empty-state">
              <h2>No categories yet</h2>
              <p>Add a category to start building your net budget.</p>
            </div>
          ) : (
            <>
              <div className="budget-category-list" role="list">
                {categories.map((cat) => {
                  const isSelected = cat.id === selectedCategoryId;
                  const isEditing = editingCategoryId === cat.id;

                  return (
                    <article
                      key={cat.id}
                      className={
                        isSelected
                          ? 'budget-category-card selected'
                          : 'budget-category-card'
                      }
                    >
                      {isEditing ? (
                        <div className="budget-inline-edit">
                          <label className="field">
                            <span>Category</span>
                            <input
                              value={editingCategoryName}
                              onChange={(e) => setEditingCategoryName(e.target.value)}
                            />
                          </label>
                          <div className="budget-inline-actions">
                            <button
                              className="primary-action"
                              type="button"
                              onClick={() => void saveCategory()}
                            >
                              Save
                            </button>
                            <button
                              className="secondary-action"
                              type="button"
                              onClick={cancelEditCategory}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            className="budget-category-select"
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => setSelectedCategoryId(cat.id)}
                          >
                            <span className="budget-category-name">{cat.name}</span>
                            <span className="budget-category-month">{formatMoney(
                              cat.subCategories.reduce(
                                (sum, sub) => sum + sub.monthlyAmountUsd,
                                0,
                              ),
                            )}</span>
                          </button>
                          <div className="budget-category-row-actions">
                            <button
                              className="link-button"
                              type="button"
                              onClick={() => startEditCategory(cat)}
                            >
                              Edit
                            </button>
                            <button
                              className="link-button"
                              type="button"
                              onClick={() => void deleteCategory(cat.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </article>
                  );
                })}
              </div>

              <div className="budget-add-category">
                <label className="field">
                  <span>Add category</span>
                  <input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="e.g. Housing"
                  />
                </label>
                <div className="budget-add-category-actions">
                  <button
                    className="primary-action"
                    type="button"
                    onClick={() => void addCategory()}
                    disabled={!newCategoryName.trim()}
                  >
                    Add
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="budget-right">
          {selectedCategory ? (
            <>
              <header className="budget-right-header">
                <h2>{selectedCategory.name}</h2>
                <p>
                  Sub-categories roll up into totals used for Total @ Month / Year and % of
                  income.
                </p>
              </header>

              <section className="budget-subcategory-editor" aria-label="Sub-categories">
                {editingSubId ? (
                  <div className="budget-inline-edit budget-sub-edit">
                    <label className="field">
                      <span>Name</span>
                      <input
                        value={editingSubName}
                        onChange={(e) => setEditingSubName(e.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Monthly amount ($)</span>
                      <input
                        value={editingSubAmount}
                        onChange={(e) => setEditingSubAmount(e.target.value)}
                        inputMode="decimal"
                        placeholder={currencyPlaceholder}
                      />
                    </label>
                    <div className="budget-inline-actions">
                      <button
                        className="primary-action"
                        type="button"
                        onClick={() => void saveSubCategory()}
                      >
                        Save
                      </button>
                      <button
                        className="secondary-action"
                        type="button"
                        onClick={cancelEditSub}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="budget-subcategory-list" role="list">
                  {selectedCategory.subCategories.map((sub) => {
                    return (
                      <article
                        key={sub.id}
                        className="budget-subcategory-row"
                        role="listitem"
                      >
                        <div className="budget-subcategory-main">
                          <span className="budget-subcategory-name">{sub.name}</span>
                          <span className="budget-subcategory-amount">
                            {formatMoney(sub.monthlyAmountUsd)}
                          </span>
                        </div>
                        <div className="budget-subcategory-actions">
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => startEditSub(sub)}
                          >
                            Edit
                          </button>
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => void deleteSubCategory(sub.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="budget-add-subcategory" aria-label="Add sub-category">
                  <h3>Add sub-category</h3>
                  <div className="budget-add-sub-grid">
                    <label className="field">
                      <span>Name</span>
                      <input
                        value={newSubName}
                        onChange={(e) => setNewSubName(e.target.value)}
                        placeholder="e.g. HOA"
                      />
                    </label>
                    <label className="field">
                      <span>Monthly amount ($)</span>
                      <input
                        value={newSubAmount}
                        onChange={(e) => setNewSubAmount(e.target.value)}
                        inputMode="decimal"
                        placeholder={currencyPlaceholder}
                      />
                    </label>
                  </div>
                  <div className="budget-add-sub-actions">
                    <button
                      className="primary-action"
                      type="button"
                      onClick={() => void addSubCategory()}
                      disabled={
                        !newSubName.trim() ||
                        parsePositiveUsd(newSubAmount) === undefined
                      }
                    >
                      Add
                    </button>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <div className="empty-state">
              <h2>Select a category</h2>
              <p>Choose a category on the left to manage its sub-categories.</p>
            </div>
          )}

          {incomeError ? (
            <div className="alert error-alert" role="alert">
              {incomeError}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
