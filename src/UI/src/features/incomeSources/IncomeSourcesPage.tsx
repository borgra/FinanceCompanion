import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  emptyIncomeSourceDraft,
  toIncomeSourceDraft,
  type IncomeSource,
  type IncomeSourceDraft,
  type IncomeSourceFilter,
} from '../../domain/incomeSource';
import type { IncomeSourceRepository } from '../../domain/incomeSourceRepository';
import { IncomeSourceForm } from './IncomeSourceForm';
import {
  calculateMonthlyAmount,
  calculateYearlyNetAmount,
  findCurrentPeriod,
  findDisplayPeriod,
} from './salaryPeriodUtils';
import {
  hasDuplicateNameWarning,
  hasValidationErrors,
  validateIncomeSourceDraft,
  type IncomeSourceValidationResult,
} from './validation';

type ViewState =
  | { name: 'list' }
  | { name: 'create' }
  | { name: 'edit'; sourceId: string };

type IncomeSourcesPageProps = {
  repository: IncomeSourceRepository;
  layout?: 'standalone' | 'embedded';
  headerEyebrow?: string;
};

const filters: IncomeSourceFilter[] = ['All', 'Active', 'Inactive'];

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const formatMoney = (amount: number) => currencyFormatter.format(amount);

const formatMonthlyAmount = (yearlyAmount: number) =>
  formatMoney(calculateMonthlyAmount(yearlyAmount));

const emptyValidationResult = (): IncomeSourceValidationResult => ({
  sourceErrors: {},
  periodErrors: [],
});

const sortSources = (sources: IncomeSource[]) =>
  [...sources].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === 'Active' ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });

export function IncomeSourcesPage({
  repository,
  layout = 'standalone',
  headerEyebrow = 'Income Management',
}: IncomeSourcesPageProps) {
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [filter, setFilter] = useState<IncomeSourceFilter>('Active');
  const [view, setView] = useState<ViewState>({ name: 'list' });
  const [draft, setDraft] = useState<IncomeSourceDraft>(emptyIncomeSourceDraft);
  const [initialDraft, setInitialDraft] =
    useState<IncomeSourceDraft>(emptyIncomeSourceDraft);
  const [validationResult, setValidationResult] = useState<IncomeSourceValidationResult>(
    emptyValidationResult,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const refreshSources = useCallback(async () => {
    setIsLoading(true);
    setLoadError(undefined);
    try {
      setSources(await repository.listIncomeSources());
    } catch {
      setLoadError('Income sources could not be loaded. Try again.');
    } finally {
      setIsLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    void refreshSources();
  }, [refreshSources]);

  const sortedSources = useMemo(() => sortSources(sources), [sources]);
  const filteredSources = useMemo(
    () =>
      filter === 'All'
        ? sortedSources
        : sortedSources.filter((source) => source.status === filter),
    [filter, sortedSources],
  );

  const editingSource =
    view.name === 'edit'
      ? sources.find((source) => source.id === view.sourceId)
      : undefined;

  const isDirty = view.name !== 'list' && JSON.stringify(draft) !== JSON.stringify(initialDraft);

  const startCreate = () => {
    const nextDraft = emptyIncomeSourceDraft();
    setDraft(nextDraft);
    setInitialDraft(nextDraft);
    setValidationResult(emptyValidationResult());
    setSaveError(undefined);
    setView({ name: 'create' });
  };

  const startEdit = (source: IncomeSource) => {
    const nextDraft = toIncomeSourceDraft(source);
    setDraft(nextDraft);
    setInitialDraft(nextDraft);
    setValidationResult(emptyValidationResult());
    setSaveError(undefined);
    setView({ name: 'edit', sourceId: source.id });
  };

  const returnToList = () => {
    setView({ name: 'list' });
    window.setTimeout(() => headingRef.current?.focus(), 0);
  };

  const cancelForm = () => {
    if (isDirty && !window.confirm('Discard unsaved changes?')) {
      return;
    }
    returnToList();
  };

  const saveDraft = async () => {
    const nextValidationResult = validateIncomeSourceDraft(draft);
    setValidationResult(nextValidationResult);
    setSaveError(undefined);

    if (hasValidationErrors(nextValidationResult)) {
      return;
    }

    setIsSaving(true);
    try {
      if (view.name === 'edit') {
        await repository.updateIncomeSource(view.sourceId, draft);
      } else {
        await repository.createIncomeSource(draft);
      }
      await refreshSources();
      if (draft.status === 'Active') {
        setFilter('Active');
      }
      returnToList();
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : 'Unable to save income source. Try again.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const changeExpandedSource = (source?: IncomeSource) => {
    if (isDirty && !window.confirm('Discard unsaved changes?')) {
      return;
    }

    if (!source) {
      returnToList();
      return;
    }

    startEdit(source);
  };

  if (view.name === 'create') {
    return (
      <IncomeSourceForm
        draft={draft}
        duplicateNameWarning={hasDuplicateNameWarning(
          draft,
          sources,
          editingSource?.id,
        )}
        errors={validationResult.sourceErrors}
        isSaving={isSaving}
        mode={view.name}
        periodErrors={validationResult.periodErrors}
        saveError={saveError}
        source={editingSource}
        layout={layout}
        onCancel={cancelForm}
        onChange={setDraft}
        onSubmit={saveDraft}
      />
    );
  }

  return (
    <main
      className={
        layout === 'embedded'
          ? 'settings-embedded-shell app-shell'
          : 'app-shell'
      }
    >
      <header className="page-header">
        <div className="page-header-text">
          <p className="eyebrow">{headerEyebrow}</p>
          <h1 ref={headingRef} tabIndex={-1}>
            Income Sources
          </h1>
          <p>
            Define and maintain the income sources you rely on before planning
            or budgeting work begins.
          </p>
        </div>
        <button className="primary-action" type="button" onClick={startCreate}>
          <span className="material-symbols-outlined" aria-hidden="true">add</span>
          Add income source
        </button>
      </header>

      {loadError ? (
        <div className="alert error-alert" role="alert">
          <span>{loadError}</span>
          <button className="link-button link-button-danger" type="button" onClick={refreshSources}>
            Retry
          </button>
        </div>
      ) : null}

      {saveError && view.name !== 'edit' ? (
        <div className="alert error-alert" role="alert">
          <span>{saveError}</span>
        </div>
      ) : null}

      <section className="toolbar" aria-label="Income source filters">
        <div className="filter-tabs" role="tablist" aria-label="Filter sources">
          {filters.map((nextFilter) => (
            <button
              aria-selected={filter === nextFilter}
              className="filter-tab"
              key={nextFilter}
              role="tab"
              type="button"
              onClick={() => setFilter(nextFilter)}
            >
              {nextFilter}
            </button>
          ))}
        </div>
      </section>

      {isLoading ? (
        <section className="empty-state" aria-live="polite">
          <span className="material-symbols-outlined" aria-hidden="true">sync</span>
          Loading income sources...
        </section>
      ) : sources.length === 0 ? (
        <section className="empty-state">
          <span className="material-symbols-outlined" aria-hidden="true">account_balance</span>
          <h2>No income sources yet</h2>
          <p>
            Add your first source to create a starting point for future planning.
          </p>
          <button className="primary-action" type="button" onClick={startCreate}>
            <span className="material-symbols-outlined" aria-hidden="true">add</span>
            Add income source
          </button>
        </section>
      ) : filteredSources.length === 0 ? (
        <section className="empty-state">
          <span className="material-symbols-outlined" aria-hidden="true">filter_list_off</span>
          <h2>No {filter.toLowerCase()} sources</h2>
          <p>Reset the filter to review every source you have added.</p>
          <button
            className="secondary-action"
            type="button"
            onClick={() => setFilter('All')}
          >
            Show all sources
          </button>
        </section>
      ) : (
        <section className="source-list source-master-list" aria-label="Income source list">
          {filteredSources.map((source) => {
            const displayPeriod = findDisplayPeriod(source);
            const isCurrentPeriod = findCurrentPeriod(source)?.id === displayPeriod?.id;
            const isExpanded = view.name === 'edit' && view.sourceId === source.id;
            const panelId = `income-source-panel-${source.id}`;
            const buttonId = `income-source-trigger-${source.id}`;

            return (
              <article
                className={isExpanded ? 'source-row source-row-expanded' : 'source-row'}
                key={source.id}
              >
                <div className="source-row-summary">
                  <button
                    id={buttonId}
                    className="source-row-toggle"
                    type="button"
                    aria-controls={panelId}
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${source.name} source`}
                    onClick={() => changeExpandedSource(isExpanded ? undefined : source)}
                  >
                    <span className="material-symbols-outlined source-accordion-icon" aria-hidden="true">
                      {isExpanded ? 'expand_less' : 'expand_more'}
                    </span>
                    <span className="source-main">
                      <span className="source-title">
                        {source.name}
                      </span>
                      <span className="source-subtitle">
                        {source.type} &middot; {source.cadence} &middot; {source.periods.length}{' '}
                        {source.periods.length === 1 ? 'period' : 'periods'}
                      </span>
                    </span>
                    <span className={`status-badge status-badge-${source.status.toLowerCase()}`}>
                      {source.status}
                    </span>
                  </button>
                  <dl className="source-meta">
                    {displayPeriod ? (
                      <>
                        <div>
                          <dt>{isCurrentPeriod ? 'Current period' : 'Latest period'}</dt>
                          <dd>
                            {displayPeriod.startDate} to{' '}
                            {displayPeriod.endDate ?? 'Present'}
                          </dd>
                        </div>
                        <div>
                          <dt>Net percentage</dt>
                          <dd>{displayPeriod.netPercentage}%</dd>
                        </div>
                        <div>
                          <dt>Gross monthly</dt>
                          <dd>
                            {formatMonthlyAmount(displayPeriod.yearlyGrossAmount)}
                          </dd>
                        </div>
                        <div>
                          <dt>Net monthly</dt>
                          <dd>
                            {formatMonthlyAmount(
                              calculateYearlyNetAmount(displayPeriod),
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Gross yearly</dt>
                          <dd>{formatMoney(displayPeriod.yearlyGrossAmount)}</dd>
                        </div>
                        <div>
                          <dt>Net yearly</dt>
                          <dd>{formatMoney(calculateYearlyNetAmount(displayPeriod))}</dd>
                        </div>
                      </>
                    ) : (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <dt>Income periods</dt>
                        <dd>None configured</dd>
                      </div>
                    )}
                  </dl>
                </div>

                {isExpanded && editingSource ? (
                  <section
                    id={panelId}
                    className="source-accordion-panel"
                    aria-labelledby={buttonId}
                  >
                    <IncomeSourceForm
                      draft={draft}
                      duplicateNameWarning={hasDuplicateNameWarning(
                        draft,
                        sources,
                        editingSource.id,
                      )}
                      errors={validationResult.sourceErrors}
                      isSaving={isSaving}
                      mode="edit"
                      periodErrors={validationResult.periodErrors}
                      presentation="inline"
                      saveError={saveError}
                      source={editingSource}
                      layout={layout}
                      onCancel={cancelForm}
                      onChange={setDraft}
                      onSubmit={saveDraft}
                    />
                  </section>
                ) : null}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
