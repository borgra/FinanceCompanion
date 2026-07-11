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
const formatPercent = (value: number | undefined) =>
  value === undefined ? 'N/A' : `${value.toFixed(1)}%`;

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const parsePositiveUsd = (raw: string) => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
};

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

const tmpId = () => `tmp-${crypto.randomUUID()}`;

export function BudgetPage({ incomeRepository, budgetRepository }: BudgetPageProps) {
  const [categories, setCategories] = useState<BudgetCategoryWithSubCategories[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();

  const [incomeTotals, setIncomeTotals] = useState<IncomeTotals>(emptyIncomeTotals());
  const [incomeLoading, setIncomeLoading] = useState(true);
  const [incomeError, setIncomeError] = useState<string | undefined>();

  // Draft for the currently selected category. Changes are only persisted with the
  // single “Save changes” button.
  const [draftCategory, setDraftCategory] = useState<BudgetCategoryWithSubCategories>();
  const [removedSubCategoryIds, setRemovedSubCategoryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isDirty, setIsDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColorHex, setNewCategoryColorHex] = useState('#00e676');
  const [isAddCatModalOpen, setIsAddCatModalOpen] = useState(false);

  const [newSubName, setNewSubName] = useState('');
  const [newSubMonthlyAmount, setNewSubMonthlyAmount] = useState('');

  const closeAddCatModal = () => {
    setNewCategoryName('');
    setNewCategoryColorHex('#00e676');
    setIsAddCatModalOpen(false);
  };

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === selectedCategoryId),
    [categories, selectedCategoryId],
  );

  const derivedCategoriesForTotals = useMemo(() => {
    if (!draftCategory) return categories;
    return categories.map((c) => (c.id === draftCategory.id ? draftCategory : c));
  }, [categories, draftCategory]);

  const totals = useMemo(() => {
    const totalMonth = derivedCategoriesForTotals.reduce(
      (sum, cat) => sum + cat.subCategories.reduce((s, sub) => s + sub.monthlyAmountUsd, 0),
      0,
    );
    const totalYear = totalMonth * 12;

    const percentGross =
      incomeTotals.yearlyGross > 0 ? (totalYear / incomeTotals.yearlyGross) * 100 : undefined;
    const percentNet =
      incomeTotals.yearlyNet > 0 ? (totalYear / incomeTotals.yearlyNet) * 100 : undefined;

    return { totalMonth, totalYear, percentGross, percentNet };
  }, [derivedCategoriesForTotals, incomeTotals]);

  const monthlyMargin = incomeTotals.monthlyNet - totals.totalMonth;
  const allocationRate = totals.percentNet ?? 0;
  const isOverBudget = monthlyMargin < 0;
  const budgetHealthLabel = isOverBudget
    ? 'Overplanned'
    : allocationRate >= 90
    ? 'Tight'
    : allocationRate >= 75
    ? 'Balanced'
    : 'Flexible';
  const budgetHealthTone = isOverBudget ? 'critical' : allocationRate >= 90 ? 'caution' : 'healthy';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setLoadError(undefined);
      try {
        const next = await budgetRepository.listCategoriesWithSubCategories();
        if (cancelled) return;
        setCategories(next);
        setSelectedCategoryId((prev) => (prev && next.some((c) => c.id === prev) ? prev : undefined));
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

        setIncomeTotals({
          monthlyGross,
          monthlyNet,
          yearlyGross: monthlyGross * 12,
          yearlyNet: monthlyNet * 12,
        });
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

  // When the selected category changes, reset the draft.
  useEffect(() => {
    if (!selectedCategory) {
      setDraftCategory(undefined);
      setRemovedSubCategoryIds(new Set());
      setIsDirty(false);
      setSaveError(undefined);
      return;
    }
    // Deep clone to detach from repository state.
    const cloned: BudgetCategoryWithSubCategories = JSON.parse(JSON.stringify(selectedCategory));
    setDraftCategory(cloned);
    setRemovedSubCategoryIds(new Set());
    setIsDirty(false);
    setSaveError(undefined);
  }, [selectedCategory]);

  const refreshCategories = async () => {
    const next = await budgetRepository.listCategoriesWithSubCategories();
    setCategories(next);
    setSelectedCategoryId((prev) => (prev && next.some((c) => c.id === prev) ? prev : undefined));
  };

  const hasUnsavedChanges = () => isDirty;

  const toggleCategoryExpansion = async (nextId: string) => {
    const nextSelectedCategoryId = nextId === selectedCategoryId ? undefined : nextId;

    if (!hasUnsavedChanges()) {
      setSelectedCategoryId(nextSelectedCategoryId);
      return;
    }

    const okToSave = window.confirm('You have unsaved changes. Save before changing categories?');
    if (!okToSave) return;
    const saved = await saveChanges();
    if (!saved) return;
    setSelectedCategoryId(nextSelectedCategoryId);
  };

  const saveChanges = async () => {
    if (!draftCategory) return false;
    if (!selectedCategory) return false;

    // Validate inputs.
    if (!draftCategory.name.trim()) return false;

    const initial = selectedCategory;
    const initialSubsById = new Map(initial.subCategories.map((s) => [s.id, s] as const));

    setIsSaving(true);
    setSaveError(undefined);
    try {
      if (draftCategory.name !== initial.name || draftCategory.colorHex !== initial.colorHex) {
        await budgetRepository.updateCategory(
          initial.id,
          draftCategory.name.trim(),
          draftCategory.colorHex,
        );
      }

      // Upserts + creates
      for (const sub of draftCategory.subCategories) {
        const initialSub = initialSubsById.get(sub.id);
        if (!initialSub) {
          // New sub-category (draft-only)
          await budgetRepository.createSubCategory(
            draftCategory.id,
            sub.name.trim(),
            sub.monthlyAmountUsd,
          );
        } else {
          if (
            initialSub.name !== sub.name ||
            initialSub.monthlyAmountUsd !== sub.monthlyAmountUsd
          ) {
            await budgetRepository.updateSubCategory(
              sub.id,
              sub.name.trim(),
              sub.monthlyAmountUsd,
            );
          }
        }
      }

      // Deletes
      for (const id of removedSubCategoryIds) {
        await budgetRepository.deleteSubCategory(id);
      }

      await refreshCategories();
      // Draft reset runs via effect.
      return true;
    } catch {
      setSaveError('Unable to save budget changes. Try again.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const deleteCategory = async (id: string) => {
    // If the current selected category is dirty and we're deleting it, force save first.
    if (id === selectedCategoryId && hasUnsavedChanges()) {
      const okToSave = window.confirm('You have unsaved changes. Save before deleting this category?');
      if (okToSave) {
        const saved = await saveChanges();
        if (!saved) return;
      }
      else return;
    }

    const ok = window.confirm('Delete this category and all its sub-categories?');
    if (!ok) return;
    await budgetRepository.deleteCategory(id);
    await refreshCategories();
  };

  const createCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    await budgetRepository.createCategory(name, newCategoryColorHex);
    setNewCategoryName('');
    setNewCategoryColorHex('#00e676');
    setIsAddCatModalOpen(false);
    await refreshCategories();
  };

  const addSubCategoryToDraft = () => {
    if (!draftCategory) return;
    const name = newSubName.trim();
    const monthlyAmountUsd = parsePositiveUsd(newSubMonthlyAmount);
    if (!name || monthlyAmountUsd === undefined) return;

    const nextSub: BudgetSubCategory = {
      id: tmpId(),
      categoryId: draftCategory.id,
      name,
      monthlyAmountUsd,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setDraftCategory({
      ...draftCategory,
      subCategories: [...draftCategory.subCategories, nextSub].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    });
    setRemovedSubCategoryIds(new Set(removedSubCategoryIds));
    setIsDirty(true);
    setNewSubName('');
    setNewSubMonthlyAmount('');
  };

  const updateSubInDraft = (id: string, patch: Partial<BudgetSubCategory>) => {
    if (!draftCategory) return;
    setDraftCategory({
      ...draftCategory,
      subCategories: draftCategory.subCategories.map((s) =>
        s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s,
      ),
    });
    setIsDirty(true);
  };

  const deleteSubFromDraft = (subId: string) => {
    if (!draftCategory) return;
    const stillInDraft = draftCategory.subCategories.some((s) => s.id === subId);
    if (!stillInDraft) return;

    setDraftCategory({
      ...draftCategory,
      subCategories: draftCategory.subCategories.filter((s) => s.id !== subId),
    });

    // If this is an existing sub-category, remember deletion.
    if (!subId.startsWith('tmp-')) {
      setRemovedSubCategoryIds((prev) => {
        const next = new Set(prev);
        next.add(subId);
        return next;
      });
    }

    setIsDirty(true);
  };

  const selectedCategoryMonthlyTotal = (cat?: BudgetCategoryWithSubCategories) => {
    if (!cat) return 0;
    return cat.subCategories.reduce((sum, sub) => sum + sub.monthlyAmountUsd, 0);
  };

  return (
    <main className="app-shell budget-shell">
      <header className="page-header compact-header">
        <div className="page-header-text">
          <p className="eyebrow">Budget Planning</p>
          <h1>Monthly Plan</h1>
        </div>
      </header>

      {loadError ? (
        <div className="alert error-alert" role="alert">
          <span className="material-symbols-outlined" aria-hidden="true">error</span>
          <span>{loadError}</span>
        </div>
      ) : null}

      <section className="budget-overview" aria-label="Budget overview" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
        <article className="budget-hero-card" style={{ width: '100%' }}>
          <div className="budget-hero-topline" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span className="budget-section-label" style={{ fontSize: '0.85rem', letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 'bold' }}>Monthly Posture</span>
            <span
              className={`budget-health-pill budget-health-pill-${budgetHealthTone}`}
              aria-label={`Budget health ${budgetHealthLabel}`}
            >
              {budgetHealthLabel}
            </span>
          </div>

          <div className="budget-hero-main" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <span className="budget-summary-label" style={{ display: 'block', fontSize: '0.75rem', color: 'var(--md-sys-color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Budgeted Amount</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <strong style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--md-sys-color-primary)' }}>
                  {formatMoney(totals.totalMonth)}
                </strong>
                <span style={{ fontSize: '1rem', color: 'var(--md-sys-color-on-surface-variant)' }}>
                  / {incomeLoading ? '—' : formatMoney(incomeTotals.monthlyNet)} budgeted
                </span>
              </div>
            </div>

            <div className="budget-progress-panel" style={{ marginTop: 0 }}>
              <div className="budget-progress-header" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: '6px' }}>
                <span>Income Budgeted</span>
                <strong>{incomeLoading ? '—' : formatPercent(totals.percentNet)}</strong>
              </div>
              <div className="budget-progress-track" aria-hidden="true" style={{ height: '8px', backgroundColor: 'var(--md-sys-color-surface-container-highest)', borderRadius: '4px', overflow: 'hidden' }}>
                <span
                  className={`budget-progress-fill ${isOverBudget ? 'budget-progress-fill-over' : ''}`}
                  style={{
                    display: 'block',
                    height: '100%',
                    backgroundColor: isOverBudget ? 'var(--md-sys-color-error)' : 'var(--md-sys-color-primary)',
                    width: `${clampPercent(allocationRate)}%`,
                    transition: 'width 0.3s ease'
                  }}
                />
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="budget-main-grid budget-master-list-grid" aria-label="Budget categories">
        <div className="budget-left budget-master-list-panel">
          <section className="budget-left-intro budget-master-list-header">
            <div>
              <span className="budget-section-label">Master categories</span>
              <h2>Budget category list</h2>
              <p>Expand a category to edit the group and the line items that make it up.</p>
            </div>
            <button
              className="primary-action"
              type="button"
              onClick={() => setIsAddCatModalOpen(true)}
            >
              <span className="material-symbols-outlined" aria-hidden="true">add</span>
              Add Category
            </button>
          </section>

          {isLoading ? (
            <div className="empty-state">
              <span className="material-symbols-outlined" aria-hidden="true">sync</span>
              Loading categories...
            </div>
          ) : categories.length === 0 ? (
            <div className="empty-state">
              <span className="material-symbols-outlined" aria-hidden="true">folder_off</span>
              <h2>No categories yet</h2>
              <p>Add a category to start building your master budget list.</p>
            </div>
          ) : (
            <div className="budget-category-list budget-accordion-list" role="list">
              {categories.map((cat) => {
                const isExpanded = cat.id === selectedCategoryId;
                const effectiveCat =
                  isExpanded && draftCategory ? draftCategory : cat;
                const categoryMonthlyTotal = selectedCategoryMonthlyTotal(effectiveCat);
                const categoryShare =
                  totals.totalMonth > 0 ? (categoryMonthlyTotal / totals.totalMonth) * 100 : 0;
                const panelId = `budget-category-panel-${cat.id}`;
                const buttonId = `budget-category-trigger-${cat.id}`;

                return (
                  <article
                    key={cat.id}
                    className={
                      isExpanded
                        ? 'budget-category-card budget-category-card-selected'
                        : 'budget-category-card'
                    }
                    style={
                      {
                        '--category-color': effectiveCat.colorHex,
                      } as React.CSSProperties
                    }
                    role="listitem"
                  >
                    <div className="budget-category-row">
                      <button
                        id={buttonId}
                        className="budget-category-select"
                        type="button"
                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${effectiveCat.name || 'Untitled'} category`}
                        aria-expanded={isExpanded}
                        aria-controls={panelId}
                        onClick={() => void toggleCategoryExpansion(cat.id)}
                      >
                        <span className="material-symbols-outlined budget-accordion-icon" aria-hidden="true">
                          {isExpanded ? 'expand_less' : 'expand_more'}
                        </span>
                        <span className="budget-category-color-dot" aria-hidden="true" />
                        <span className="budget-category-copy">
                          <span className="budget-category-name">{effectiveCat.name || 'Untitled'}</span>
                          <span className="budget-category-meta">
                            {effectiveCat.subCategories.length} component
                            {effectiveCat.subCategories.length === 1 ? '' : 's'}
                          </span>
                        </span>
                        <span className="budget-category-metrics">
                          <span className="budget-category-month">{formatMoney(categoryMonthlyTotal)}</span>
                          <span className="budget-category-share">{formatPercent(categoryShare)}</span>
                        </span>
                      </button>

                      <button
                        className="link-button link-button-danger budget-icon-action"
                        type="button"
                        onClick={() => void deleteCategory(cat.id)}
                        aria-label={`Delete ${cat.name} category`}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                      </button>
                    </div>

                    <div className="budget-category-progress" aria-hidden="true">
                      <span style={{ width: `${clampPercent(categoryShare)}%` }} />
                    </div>

                    {isExpanded && draftCategory ? (
                      <section
                        id={panelId}
                        className="budget-accordion-panel"
                        aria-labelledby={buttonId}
                      >
                        <div className="budget-accordion-toolbar">
                          <div className="budget-category-focus">
                            <article className="budget-focus-card">
                              <span className="budget-summary-label">Monthly total</span>
                              <strong className="budget-summary-value">{formatMoney(categoryMonthlyTotal)}</strong>
                            </article>
                            <article className="budget-focus-card">
                              <span className="budget-summary-label">Share of budget</span>
                              <strong className="budget-summary-value">{formatPercent(categoryShare)}</strong>
                            </article>
                            <article className="budget-focus-card">
                              <span className="budget-summary-label">Components</span>
                              <strong className="budget-summary-value">{draftCategory.subCategories.length}</strong>
                            </article>
                          </div>

                          <button
                            className="primary-action"
                            type="button"
                            disabled={!isDirty || isSaving}
                            onClick={() => void saveChanges()}
                          >
                            <span className="material-symbols-outlined" aria-hidden="true">save</span>
                            {isSaving ? 'Saving...' : 'Save changes'}
                          </button>
                        </div>

                        {saveError ? (
                          <div className="alert error-alert" role="alert">
                            <span className="material-symbols-outlined" aria-hidden="true">error</span>
                            <span>{saveError}</span>
                          </div>
                        ) : null}

                        <section className="budget-subcategory-editor" aria-label={`${draftCategory.name} components`}>
                          <div className="budget-category-inline-editor">
                            <label className="field">
                              <span>Category name</span>
                              <input
                                value={draftCategory.name}
                                onChange={(e) => {
                                  setDraftCategory((prev) => {
                                    if (!prev) return prev;
                                    return { ...prev, name: e.target.value };
                                  });
                                  setIsDirty(true);
                                }}
                              />
                            </label>
                            <label className="field budget-color-field">
                              <span>Category color</span>
                              <input
                                type="color"
                                value={draftCategory.colorHex}
                                onChange={(e) => {
                                  const nextColorHex = e.target.value;
                                  setDraftCategory((prev) => {
                                    if (!prev) return prev;
                                    return { ...prev, colorHex: nextColorHex };
                                  });
                                  setIsDirty(true);
                                }}
                              />
                            </label>
                          </div>

                          <div className="budget-subcategory-table" role="list">
                            <div className="subcategory-header" aria-hidden="true">
                              <div>Component</div>
                              <div>Monthly Budget</div>
                              <div>Yearly Budget</div>
                              <div>Actions</div>
                            </div>

                            <div className="budget-subcategory-row budget-subcategory-row-new">
                              <label className="field budget-subcategory-name-field">
                                <span>New component name</span>
                                <input
                                  value={newSubName}
                                  onChange={(e) => setNewSubName(e.target.value)}
                                  placeholder="e.g. HOA or Rent"
                                />
                              </label>

                              <label className="field budget-subcategory-amount-field">
                                <span>Monthly amount ($)</span>
                                <div className="input-wrapper">
                                  <span className="input-prefix" aria-hidden="true">$</span>
                                  <input
                                    value={newSubMonthlyAmount}
                                    onChange={(e) => setNewSubMonthlyAmount(e.target.value)}
                                    inputMode="decimal"
                                    data-has-prefix="true"
                                    placeholder="0.00"
                                  />
                                </div>
                              </label>

                              <div className="budget-subcategory-annual">
                                {newSubMonthlyAmount && parsePositiveUsd(newSubMonthlyAmount) !== undefined
                                  ? formatMoney(Number(newSubMonthlyAmount) * 12)
                                  : '$0.00'}
                              </div>

                              <div className="budget-subcategory-actions">
                                <button
                                  className="primary-action compact-add-action"
                                  type="button"
                                  onClick={addSubCategoryToDraft}
                                  disabled={!newSubName.trim() || parsePositiveUsd(newSubMonthlyAmount) === undefined}
                                >
                                  <span className="material-symbols-outlined" aria-hidden="true">add</span>
                                  Add
                                </button>
                              </div>
                            </div>

                            {draftCategory.subCategories.length === 0 ? (
                              <div className="budget-component-empty">
                                No components yet. Add the first monthly item above.
                              </div>
                            ) : (
                              draftCategory.subCategories.map((sub) => (
                                <article
                                  key={sub.id}
                                  className="budget-subcategory-row"
                                  role="listitem"
                                >
                                  <label className="field budget-subcategory-name-field">
                                    <span>Name</span>
                                    <input
                                      value={sub.name}
                                      onChange={(e) =>
                                        updateSubInDraft(sub.id, { name: e.target.value })
                                      }
                                    />
                                  </label>

                                  <label className="field budget-subcategory-amount-field">
                                    <span>Monthly amount ($)</span>
                                    <div className="input-wrapper">
                                      <span className="input-prefix" aria-hidden="true">$</span>
                                      <input
                                        value={String(sub.monthlyAmountUsd)}
                                        onChange={(e) => {
                                          const parsed = parsePositiveUsd(e.target.value);
                                          updateSubInDraft(sub.id, {
                                            monthlyAmountUsd: parsed ?? 0,
                                          });
                                        }}
                                        data-has-prefix="true"
                                        inputMode="decimal"
                                      />
                                    </div>
                                  </label>

                                  <div className="budget-subcategory-annual" aria-label={`${sub.name} yearly budget`}>
                                    {formatMoney(sub.monthlyAmountUsd * 12)}
                                  </div>

                                  <div className="budget-subcategory-actions">
                                    <button
                                      className="link-button link-button-danger"
                                      type="button"
                                      onClick={() => deleteSubFromDraft(sub.id)}
                                    >
                                      <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                                      Delete
                                    </button>
                                  </div>
                                </article>
                              ))
                            )}
                          </div>
                        </section>
                      </section>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}

          {incomeError ? (
            <div className="alert error-alert" role="alert">
              <span className="material-symbols-outlined" aria-hidden="true">error</span>
              <span>{incomeError}</span>
            </div>
          ) : null}
        </div>
      </section>

      {/* POP-UP MODAL: ADD CATEGORY */}
      {isAddCatModalOpen && (
        <div className="modal-overlay" onClick={closeAddCatModal}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <h2>New category</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--md-sys-color-on-surface-variant)', marginBottom: '16px' }}>
              Add a group for a major area of monthly spending.
            </p>
            <div className="modal-form">
              <label className="field">
                <span>Category name</span>
                <input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g. Housing or Subscriptions"
                  autoFocus
                />
              </label>
              <label className="field budget-color-field">
                <span>Color</span>
                <input
                  type="color"
                  value={newCategoryColorHex}
                  onChange={(e) => setNewCategoryColorHex(e.target.value)}
                />
              </label>
            </div>

            <div className="modal-actions">
              <button className="secondary-action" type="button" onClick={closeAddCatModal}>
                Cancel
              </button>
              <button
                className="primary-action"
                type="button"
                onClick={() => void createCategory()}
                disabled={!newCategoryName.trim()}
              >
                Add Category
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
