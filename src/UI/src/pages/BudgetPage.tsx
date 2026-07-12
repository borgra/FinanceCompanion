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

type BudgetSort = 'amount' | 'name';

const budgetColors = [
  { name: 'Green', value: '#00e676' },
  { name: 'Sky', value: '#38bdf8' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Rose', value: '#fb7185' },
  { name: 'Violet', value: '#a78bfa' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Slate', value: '#94a3b8' },
];

const categoryIcons = [
  ['category', 'General'],
  ['home', 'Housing'],
  ['shopping_cart', 'Shopping'],
  ['restaurant', 'Dining'],
  ['directions_car', 'Transportation'],
  ['health_and_safety', 'Healthcare'],
  ['subscriptions', 'Subscriptions'],
  ['savings', 'Savings'],
  ['volunteer_activism', 'Giving'],
  ['payments', 'Payments'],
] as const;

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
  const [newCategoryIcon, setNewCategoryIcon] = useState('category');
  const [newCategoryIsEssential, setNewCategoryIsEssential] = useState(true);
  const [isAddCatModalOpen, setIsAddCatModalOpen] = useState(false);
  const [sortBy, setSortBy] = useState<BudgetSort>('amount');
  const [hoveredCategoryId, setHoveredCategoryId] = useState<string | undefined>();

  const [newSubName, setNewSubName] = useState('');
  const [newSubMonthlyAmount, setNewSubMonthlyAmount] = useState('');

  const closeAddCatModal = () => {
    setNewCategoryName('');
    setNewCategoryColorHex('#00e676');
    setNewCategoryIcon('category');
    setNewCategoryIsEssential(true);
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
    const essentialMonth = derivedCategoriesForTotals.reduce(
      (sum, cat) => sum + (cat.isEssential
        ? cat.subCategories.reduce((subTotal, sub) => subTotal + sub.monthlyAmountUsd, 0)
        : 0),
      0,
    );
    const essentialYear = essentialMonth * 12;

    const percentGross =
      incomeTotals.yearlyGross > 0 ? (totalYear / incomeTotals.yearlyGross) * 100 : undefined;
    const percentNet =
      incomeTotals.yearlyNet > 0 ? (totalYear / incomeTotals.yearlyNet) * 100 : undefined;
    const essentialPercentNet =
      incomeTotals.yearlyNet > 0 ? (essentialYear / incomeTotals.yearlyNet) * 100 : undefined;

    return { totalMonth, totalYear, essentialMonth, essentialYear, percentGross, percentNet, essentialPercentNet };
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

  const categorySummaries = useMemo(() => {
    return derivedCategoriesForTotals.map((category) => {
      const monthlyAmount = category.subCategories.reduce(
        (sum, subCategory) => sum + subCategory.monthlyAmountUsd,
        0,
      );
      return {
        category,
        monthlyAmount,
        percentage: totals.totalMonth > 0 ? (monthlyAmount / totals.totalMonth) * 100 : 0,
      };
    });
  }, [derivedCategoriesForTotals, totals.totalMonth]);

  const sortedCategories = useMemo(() => {
    return [...categorySummaries].sort((a, b) => {
      if (sortBy === 'name') return a.category.name.localeCompare(b.category.name);
      return b.monthlyAmount - a.monthlyAmount || a.category.name.localeCompare(b.category.name);
    });
  }, [categorySummaries, sortBy]);

  const pieSegments = useMemo(() => {
    let start = 0;
    return categorySummaries
      .filter((item) => item.monthlyAmount > 0)
      .map((item) => {
        const end = start + item.percentage * 3.6;
        const segment = { ...item, start, end };
        start = end;
        return segment;
      });
  }, [categorySummaries]);

  const pieGradient = useMemo(() => {
    if (pieSegments.length === 0) return 'conic-gradient(var(--md-sys-color-surface-container-highest) 0deg 360deg)';
    return `conic-gradient(${pieSegments
      .map((segment) => `${segment.category.colorHex} ${segment.start}deg ${segment.end}deg`)
      .join(', ')})`;
  }, [pieSegments]);

  const hoveredCategory = categorySummaries.find((item) => item.category.id === hoveredCategoryId);

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
      if (
        draftCategory.name !== initial.name ||
        draftCategory.colorHex !== initial.colorHex ||
        draftCategory.icon !== initial.icon ||
        draftCategory.isEssential !== initial.isEssential
      ) {
        await budgetRepository.updateCategory(
          initial.id,
          draftCategory.name.trim(),
          draftCategory.colorHex,
          draftCategory.icon,
          draftCategory.isEssential,
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
    await budgetRepository.createCategory(name, newCategoryColorHex, newCategoryIcon, newCategoryIsEssential);
    setNewCategoryName('');
    setNewCategoryColorHex('#00e676');
    setNewCategoryIcon('category');
    setNewCategoryIsEssential(true);
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

      <section className="budget-overview" aria-label="Budget overview">
        <article className="budget-hero-card">
          <div className="budget-hero-topline">
            <span className="budget-section-label">Monthly Posture</span>
            <span
              className={`budget-health-pill budget-health-pill-${budgetHealthTone}`}
              aria-label={`Budget health ${budgetHealthLabel}`}
            >
              {budgetHealthLabel}
            </span>
          </div>

          <div className="budget-hero-main">
            <div className="budget-posture-summary">
              <span className="budget-summary-label">Budgeted Amount</span>
              <div className="budget-total-line">
                <strong>
                  {formatMoney(totals.totalMonth)}
                </strong>
                <span>
                  / {incomeLoading ? '—' : formatMoney(incomeTotals.monthlyNet)} budgeted
                </span>
              </div>

              <div className="budget-progress-panel">
                <div className="budget-progress-header">
                  <span>Essential coverage</span>
                  <strong>{incomeLoading ? '—' : formatPercent(totals.essentialPercentNet)}</strong>
                </div>
                <div className="budget-progress-track" aria-hidden="true">
                  <span className="budget-progress-fill" style={{ width: `${clampPercent(totals.essentialPercentNet ?? 0)}%` }} />
                </div>
              </div>
              <div className="budget-progress-panel">
                <div className="budget-progress-header">
                  <span>Total coverage</span>
                  <strong>{incomeLoading ? '—' : formatPercent(totals.percentNet)}</strong>
                </div>
                <div className="budget-progress-track" aria-hidden="true">
                  <span
                    className={`budget-progress-fill ${isOverBudget ? 'budget-progress-fill-over' : ''}`}
                    style={{ width: `${clampPercent(allocationRate)}%` }}
                  />
                </div>
              </div>
            </div>

            <section className="budget-allocation-panel" aria-label="Budget allocation">
              <div
                className="budget-pie-chart"
                role="img"
                aria-label="Budget allocation pie chart"
                style={{ background: pieGradient }}
                onMouseMove={(event) => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const x = event.clientX - bounds.left - bounds.width / 2;
                  const y = event.clientY - bounds.top - bounds.height / 2;
                  const distance = Math.sqrt(x * x + y * y);
                  if (distance > bounds.width / 2 || distance < bounds.width * 0.22) {
                    setHoveredCategoryId(undefined);
                    return;
                  }
                  const angle = (Math.atan2(y, x) * 180 / Math.PI + 450) % 360;
                  setHoveredCategoryId(
                    pieSegments.find((segment) => angle >= segment.start && angle < segment.end)?.category.id,
                  );
                }}
                onMouseLeave={() => setHoveredCategoryId(undefined)}
              >
                <span className="budget-pie-center">
                  <strong>{formatMoney(totals.totalMonth)}</strong>
                  <span>monthly</span>
                </span>
              </div>
              <div className="budget-pie-details" aria-live="polite">
                {hoveredCategory ? (
                  <>
                    <span className="budget-pie-detail-name">
                      <i style={{ backgroundColor: hoveredCategory.category.colorHex }} aria-hidden="true" />
                      {hoveredCategory.category.name}
                    </span>
                    <strong>{formatMoney(hoveredCategory.monthlyAmount)}</strong>
                    <span>{formatPercent(hoveredCategory.percentage)}</span>
                  </>
                ) : (
                  <span>Hover a section for category details</span>
                )}
              </div>
              <div className="budget-pie-legend">
                {pieSegments.map((segment) => (
                  <button
                    key={segment.category.id}
                    type="button"
                    onMouseEnter={() => setHoveredCategoryId(segment.category.id)}
                    onFocus={() => setHoveredCategoryId(segment.category.id)}
                    onMouseLeave={() => setHoveredCategoryId(undefined)}
                    aria-label={`${segment.category.name}: ${formatMoney(segment.monthlyAmount)}, ${formatPercent(segment.percentage)}`}
                  >
                    <i style={{ backgroundColor: segment.category.colorHex }} aria-hidden="true" />
                    {segment.category.name}
                  </button>
                ))}
              </div>
            </section>
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
            <div className="budget-master-actions">
              <label className="budget-sort-control">
                <span>Sort</span>
                <select aria-label="Sort categories" value={sortBy} onChange={(event) => setSortBy(event.target.value as BudgetSort)}>
                  <option value="amount">Amount: high to low</option>
                  <option value="name">Name: A to Z</option>
                </select>
              </label>
              <button className="primary-action" type="button" onClick={() => setIsAddCatModalOpen(true)}>
                <span className="material-symbols-outlined" aria-hidden="true">add</span>
                Add Category
              </button>
            </div>
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
              {sortedCategories.map(({ category: cat }) => {
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
                        <span className="material-symbols-outlined budget-category-icon" aria-hidden="true">
                          {effectiveCat.icon}
                        </span>
                        <span className="budget-category-copy">
                          <span className="budget-category-name">{effectiveCat.name || 'Untitled'}</span>
                          <span className="budget-category-meta">
                            {effectiveCat.subCategories.length} component
                            {effectiveCat.subCategories.length === 1 ? '' : 's'}
                            {' · '}{effectiveCat.isEssential ? 'Essential' : 'Discretionary'}
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
                            <div className="field budget-color-field">
                              <span>Category color</span>
                              <div className="budget-color-palette" role="group" aria-label="Category color">
                                {budgetColors.map((color) => (
                                  <button
                                    key={color.value}
                                    className={draftCategory.colorHex === color.value ? 'budget-color-swatch budget-color-swatch-selected' : 'budget-color-swatch'}
                                    type="button"
                                    aria-label={`Use ${color.name} color`}
                                    aria-pressed={draftCategory.colorHex === color.value}
                                    style={{ backgroundColor: color.value }}
                                    onClick={() => {
                                      setDraftCategory((prev) => prev ? { ...prev, colorHex: color.value } : prev);
                                      setIsDirty(true);
                                    }}
                                  />
                                ))}
                              </div>
                            </div>
                            <label className="field budget-icon-field">
                              <span>Category icon</span>
                              <select
                                aria-label="Category icon"
                                value={draftCategory.icon}
                                onChange={(event) => {
                                  setDraftCategory((prev) => prev ? { ...prev, icon: event.target.value } : prev);
                                  setIsDirty(true);
                                }}
                              >
                                {categoryIcons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                              </select>
                            </label>
                            <label className="budget-essential-toggle">
                              <input
                                type="checkbox"
                                checked={draftCategory.isEssential}
                                onChange={(event) => {
                                  setDraftCategory((prev) => prev ? { ...prev, isEssential: event.target.checked } : prev);
                                  setIsDirty(true);
                                }}
                              />
                              <span>{draftCategory.isEssential ? 'Essential' : 'Discretionary'}</span>
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
              <div className="field budget-color-field">
                <span>Color</span>
                <div className="budget-color-palette" role="group" aria-label="New category color">
                  {budgetColors.map((color) => (
                    <button
                      key={color.value}
                      className={newCategoryColorHex === color.value ? 'budget-color-swatch budget-color-swatch-selected' : 'budget-color-swatch'}
                      type="button"
                      aria-label={`Use ${color.name} color`}
                      aria-pressed={newCategoryColorHex === color.value}
                      style={{ backgroundColor: color.value }}
                      onClick={() => setNewCategoryColorHex(color.value)}
                    />
                  ))}
                </div>
              </div>
              <label className="field budget-icon-field">
                <span>Icon</span>
                <select aria-label="New category icon" value={newCategoryIcon} onChange={(event) => setNewCategoryIcon(event.target.value)}>
                  {categoryIcons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="budget-essential-toggle">
                <input type="checkbox" checked={newCategoryIsEssential} onChange={(event) => setNewCategoryIsEssential(event.target.checked)} />
                <span>{newCategoryIsEssential ? 'Essential' : 'Discretionary'}</span>
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
