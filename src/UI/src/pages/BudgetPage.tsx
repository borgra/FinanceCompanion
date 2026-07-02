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

const parsePositiveUsd = (raw: string) => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
};

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
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
  const [newCategoryColorHex, setNewCategoryColorHex] = useState('#00ff9a');

  const [newSubName, setNewSubName] = useState('');
  const [newSubMonthlyAmount, setNewSubMonthlyAmount] = useState('');

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
    if (!selectedCategory) return;
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
    setSelectedCategoryId((prev) => (prev && next.some((c) => c.id === prev) ? prev : next[0]?.id));
  };

  const hasUnsavedChanges = () => isDirty;

  const ensureSavedBeforeSwitch = async (nextId: string) => {
    if (nextId === selectedCategoryId) return;
    if (!hasUnsavedChanges()) {
      setSelectedCategoryId(nextId);
      return;
    }

    const okToSave = window.confirm('You have unsaved changes. Save before switching categories?');
    if (!okToSave) return;
    await saveChanges();
    setSelectedCategoryId(nextId);
  };

  const saveChanges = async () => {
    if (!draftCategory) return;
    if (!selectedCategory) return;

    // Validate inputs (only basic checks in V1).
    if (!draftCategory.name.trim()) return;

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
    } catch {
      setSaveError('Unable to save budget changes. Try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteCategory = async (id: string) => {
    // If the current selected category is dirty and we're deleting it, force save first.
    if (id === selectedCategoryId && hasUnsavedChanges()) {
      const okToSave = window.confirm('You have unsaved changes. Save before deleting this category?');
      if (okToSave) await saveChanges();
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
    setNewCategoryColorHex('#00ff9a');
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

  const categoryCardStyle = (cat: BudgetCategoryWithSubCategories) => {
    const bg = hexToRgba(cat.colorHex, 0.12);
    const border = hexToRgba(cat.colorHex, 0.75);
    return {
      background: bg,
      borderColor: border,
    } as const;
  };

  const selectedCategoryMonthlyTotal = (cat?: BudgetCategoryWithSubCategories) => {
    if (!cat) return 0;
    return cat.subCategories.reduce((sum, sub) => sum + sub.monthlyAmountUsd, 0);
  };

  return (
    <main className="settings-embedded-shell settings-8bit budget-shell">
      <header className="page-header compact-header">
        <div>
          <p className="eyebrow">Budget</p>
          <h1>Budget (Net)</h1>
          <p>
            Edit category colors and sub-category amounts inline. Totals and % of income are
            calculated automatically.
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
            {incomeLoading ?
              '—' :
              totals.percentGross === undefined ? 'N/A' : `${totals.percentGross.toFixed(1)}%`}
          </strong>
        </div>
        <div className="budget-summary-card">
          <span className="budget-summary-label">% of Income (Net)</span>
          <strong className="budget-summary-value">
            {incomeLoading ?
              '—' :
              totals.percentNet === undefined ? 'N/A' : `${totals.percentNet.toFixed(1)}%`}
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
                  const effectiveCat =
                    isSelected && draftCategory ? draftCategory : cat;

                  return (
                    <article
                      key={cat.id}
                      className={
                        isSelected
                          ? 'budget-category-card budget-category-card-selected'
                          : 'budget-category-card'
                      }
                      style={categoryCardStyle(effectiveCat)}
                    >
                      <button
                        className="budget-category-select"
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => void ensureSavedBeforeSwitch(cat.id)}
                      >
                        <span className="budget-category-name">{cat.name}</span>
                        <span className="budget-category-month">
                          {formatMoney(selectedCategoryMonthlyTotal(effectiveCat))}
                        </span>
                      </button>

                      <div className="budget-category-row-actions">
                        <button
                          className="link-button"
                          type="button"
                          onClick={() => void deleteCategory(cat.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="budget-add-category" aria-label="Add category">
                <label className="field">
                  <span>Add category</span>
                  <input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="e.g. Housing"
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
                <div className="budget-add-category-actions">
                  <button
                    className="primary-action"
                    type="button"
                    onClick={() => void createCategory()}
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
          {draftCategory ? (
            <>
              <header className="budget-right-header">
                <div className="budget-right-header-row">
                  <div className="budget-right-title">
                    <h2 className="budget-right-title-text">{draftCategory.name || 'Untitled'}</h2>
                    <p>Save changes to persist edits. Switching categories forces saving.</p>
                  </div>
                  <div className="budget-save-actions">
                    <button
                      className="primary-action"
                      type="button"
                      disabled={!isDirty || isSaving}
                      onClick={() => void saveChanges()}
                    >
                      {isSaving ? 'Saving...' : 'Save changes'}
                    </button>
                  </div>
                </div>
              </header>

              {saveError ? (
                <div className="alert error-alert" role="alert">
                  {saveError}
                </div>
              ) : null}

              <section className="budget-subcategory-editor" aria-label="Sub-categories">
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
                  {draftCategory.subCategories.map((sub) => (
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
                        <input
                          value={String(sub.monthlyAmountUsd)}
                          onChange={(e) => {
                            const parsed = parsePositiveUsd(e.target.value);
                            updateSubInDraft(sub.id, {
                              monthlyAmountUsd: parsed ?? 0,
                            });
                          }}
                          inputMode="decimal"
                        />
                      </label>

                      <div className="budget-subcategory-actions">
                        <button
                          className="link-button"
                          type="button"
                          onClick={() => deleteSubFromDraft(sub.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="budget-add-subcategory" aria-label="Add sub-category">
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
                        value={newSubMonthlyAmount}
                        onChange={(e) => setNewSubMonthlyAmount(e.target.value)}
                        inputMode="decimal"
                        placeholder="0.00"
                      />
                    </label>
                  </div>
                  <div className="budget-add-sub-actions">
                    <button
                      className="secondary-action"
                      type="button"
                      onClick={addSubCategoryToDraft}
                      disabled={!newSubName.trim() || parsePositiveUsd(newSubMonthlyAmount) === undefined}
                    >
                      Add sub-category
                    </button>
                  </div>
                </div>
              </section>

              {incomeError ? (
                <div className="alert error-alert" role="alert">
                  {incomeError}
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-state">
              <h2>Select a category</h2>
              <p>Choose a category on the left to edit its sub-categories.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
