import type { FormEvent } from 'react';
import {
  emptyIncomePeriodDraft,
  salaryIncomeCadence,
  salaryIncomeType,
  type IncomePeriodDraft,
  type IncomeSource,
  type IncomeSourceDraft,
} from '../../domain/incomeSource';
import {
  calculateMonthlyAmount,
  calculateYearlyNetAmount,
} from './salaryPeriodUtils';
import type { IncomePeriodFormErrors, IncomeSourceFormErrors } from './validation';

type IncomeSourceFormProps = {
  draft: IncomeSourceDraft;
  errors: IncomeSourceFormErrors;
  periodErrors: IncomePeriodFormErrors[];
  duplicateNameWarning: boolean;
  isSaving: boolean;
  saveError?: string;
  mode: 'create' | 'edit';
  source?: IncomeSource;
  layout?: 'standalone' | 'embedded';
  presentation?: 'page' | 'inline';
  onChange: (draft: IncomeSourceDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function IncomeSourceForm({
  draft,
  errors,
  periodErrors,
  duplicateNameWarning,
  isSaving,
  saveError,
  mode,
  source,
  layout = 'standalone',
  presentation = 'page',
  onChange,
  onSubmit,
  onCancel,
}: IncomeSourceFormProps) {
  const title =
    mode === 'create' ? 'Add income source' : `Edit ${source?.name ?? 'source'}`;

  const updateField = (field: keyof IncomeSourceDraft, value: string) => {
    onChange({ ...draft, [field]: value });
  };

  const updatePeriod = (
    index: number,
    field: keyof IncomePeriodDraft,
    value: string,
  ) => {
    onChange({
      ...draft,
      periods: draft.periods.map((period, periodIndex) =>
        periodIndex === index ? { ...period, [field]: value } : period,
      ),
    });
  };

  const addPeriod = () => {
    onChange({ ...draft, periods: [...draft.periods, emptyIncomePeriodDraft()] });
  };

  const removePeriod = (index: number) => {
    onChange({
      ...draft,
      periods: draft.periods.filter((_, periodIndex) => periodIndex !== index),
    });
  };

  const submitForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  const formContent = (
    <>
      {saveError ? (
        <div className="alert error-alert" role="alert">
          <span className="material-symbols-outlined" aria-hidden="true">error</span>
          <span>{saveError}</span>
        </div>
      ) : null}

      <form
        className={presentation === 'inline' ? 'source-form source-form-inline' : 'source-form'}
        onSubmit={submitForm}
        noValidate
      >
        <div className="form-grid">
          <label className="field">
            <span>Source name</span>
            <input
              aria-describedby={[
                errors.name ? 'name-error' : '',
                duplicateNameWarning ? 'name-warning' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-invalid={errors.name ? 'true' : 'false'}
              value={draft.name}
              onChange={(event) => updateField('name', event.target.value)}
            />
            {errors.name ? (
              <span className="field-error" id="name-error">
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">error</span>
                {errors.name}
              </span>
            ) : null}
            {duplicateNameWarning ? (
              <span className="field-warning" id="name-warning">
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">warning</span>
                A source with this name already exists. You can still save it.
              </span>
            ) : null}
          </label>

          <div className="read-only-field" aria-label="Income type">
            <span>Income type</span>
            <strong>{salaryIncomeType}</strong>
          </div>

          <div className="read-only-field" aria-label="Cadence">
            <span>Cadence</span>
            <strong>{salaryIncomeCadence}</strong>
          </div>

          <section className="period-section full-width" aria-label="Income periods">
            <div className="period-section-header">
              <h2>Income periods</h2>
              <button className="secondary-action" type="button" onClick={addPeriod}>
                <span className="material-symbols-outlined" aria-hidden="true">add</span>
                Add period
              </button>
            </div>
            {errors.periods ? (
              <span className="field-error" style={{ marginBottom: '8px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">error</span>
                {errors.periods}
              </span>
            ) : null}
            <div className="period-list">
              {draft.periods.map((period, index) => (
                <IncomePeriodEditor
                  errors={periodErrors[index] ?? {}}
                  index={index}
                  key={period.id}
                  period={period}
                  removable={draft.periods.length > 1}
                  onRemove={() => removePeriod(index)}
                  onUpdate={(field, value) => updatePeriod(index, field, value)}
                />
              ))}
            </div>
          </section>

          <fieldset className="status-field">
            <legend>Status</legend>
            <p>
              Active sources appear in the default view. Inactive sources are
              kept for reference.
            </p>
            <div className="radio-row">
              <label>
                <input
                  checked={draft.status === 'Active'}
                  name="status"
                  type="radio"
                  value="Active"
                  onChange={(event) => updateField('status', event.target.value)}
                />
                Active
              </label>
              <label>
                <input
                  checked={draft.status === 'Inactive'}
                  name="status"
                  type="radio"
                  value="Inactive"
                  onChange={(event) => updateField('status', event.target.value)}
                />
                Inactive
              </label>
            </div>
          </fieldset>
        </div>

        <div className="form-actions">
          <button className="secondary-action" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary-action" disabled={isSaving} type="submit">
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </>
  );

  if (presentation === 'inline') {
    return formContent;
  }

  return (
    <main
      className={
        layout === 'embedded'
          ? 'settings-embedded-shell app-shell narrow-shell'
          : 'app-shell narrow-shell'
      }
    >
      <header className="page-header compact-header">
        <div className="page-header-text">
          <p className="eyebrow">Income Management</p>
          <h1>{title}</h1>
        </div>
      </header>
      {formContent}
    </main>
  );
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const formatMoney = (amount: number) => currencyFormatter.format(amount);

const formatMonthlyAmount = (yearlyAmount: number) =>
  formatMoney(calculateMonthlyAmount(yearlyAmount));

type IncomePeriodEditorProps = {
  period: IncomePeriodDraft;
  errors: IncomePeriodFormErrors;
  index: number;
  removable: boolean;
  onUpdate: (field: keyof IncomePeriodDraft, value: string) => void;
  onRemove: () => void;
};

function IncomePeriodEditor({
  period,
  errors,
  index,
  removable,
  onUpdate,
  onRemove,
}: IncomePeriodEditorProps) {
  const yearlyGrossAmount = Number(period.yearlyGrossAmount);
  const netPercentage = Number(period.netPercentage);
  const hasValidYearlyGrossAmount =
    Number.isFinite(yearlyGrossAmount) && yearlyGrossAmount > 0;
  const hasValidNetPercentage =
    Number.isFinite(netPercentage) && netPercentage > 0 && netPercentage <= 100;
  const calculatedNetAmount =
    hasValidYearlyGrossAmount && hasValidNetPercentage
      ? calculateYearlyNetAmount({
          id: period.id,
          startDate: period.startDate,
          endDate: period.endDate || undefined,
          yearlyGrossAmount,
          netPercentage,
        })
      : undefined;

  return (
    <article className="period-card">
      <div className="period-card-header">
        <h3>Period {index + 1}</h3>
        {removable ? (
          <button className="link-button link-button-danger" type="button" onClick={onRemove}>
            <span className="material-symbols-outlined" aria-hidden="true">delete</span>
            Remove
          </button>
        ) : null}
      </div>

      <div className="period-grid">
        <label className="field">
          <span>Start date</span>
          <input
            aria-invalid={errors.startDate ? 'true' : 'false'}
            type="date"
            value={period.startDate}
            onChange={(event) => onUpdate('startDate', event.target.value)}
          />
          {errors.startDate ? (
            <span className="field-error">
              <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }} aria-hidden="true">error</span>
              {errors.startDate}
            </span>
          ) : null}
        </label>

        <label className="field">
          <span>End date</span>
          <input
            aria-invalid={errors.endDate ? 'true' : 'false'}
            type="date"
            value={period.endDate}
            onChange={(event) => onUpdate('endDate', event.target.value)}
          />
          {errors.endDate ? (
            <span className="field-error">
              <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }} aria-hidden="true">error</span>
              {errors.endDate}
            </span>
          ) : null}
        </label>

        <label className="field">
          <span>Yearly gross pay</span>
          <div className="input-wrapper">
            <span className="input-prefix" aria-hidden="true">$</span>
            <input
              aria-invalid={errors.yearlyGrossAmount ? 'true' : 'false'}
              inputMode="decimal"
              min="0"
              step="0.01"
              type="number"
              data-has-prefix="true"
              value={period.yearlyGrossAmount}
              onChange={(event) =>
                onUpdate('yearlyGrossAmount', event.target.value)
              }
            />
          </div>
          {errors.yearlyGrossAmount ? (
            <span className="field-error">
              <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }} aria-hidden="true">error</span>
              {errors.yearlyGrossAmount}
            </span>
          ) : null}
        </label>

        <label className="field">
          <span>Net percentage</span>
          <div className="input-wrapper">
            <input
              aria-invalid={errors.netPercentage ? 'true' : 'false'}
              inputMode="decimal"
              max="100"
              min="0"
              step="0.1"
              type="number"
              data-has-suffix="true"
              value={period.netPercentage}
              onChange={(event) => onUpdate('netPercentage', event.target.value)}
            />
            <span className="input-suffix" aria-hidden="true">%</span>
          </div>
          {errors.netPercentage ? (
            <span className="field-error">
              <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }} aria-hidden="true">error</span>
              {errors.netPercentage}
            </span>
          ) : null}
        </label>
      </div>

      <div className="salary-summary" aria-live="polite">
        <div>
          <span>Gross monthly</span>
          <strong>
            {hasValidYearlyGrossAmount
              ? formatMonthlyAmount(yearlyGrossAmount)
              : '—'}
          </strong>
        </div>
        <div>
          <span>Gross yearly</span>
          <strong>
            {hasValidYearlyGrossAmount ? formatMoney(yearlyGrossAmount) : '—'}
          </strong>
        </div>
        <div>
          <span>Net monthly</span>
          <strong>
            {calculatedNetAmount === undefined
              ? '—'
              : formatMonthlyAmount(calculatedNetAmount)}
          </strong>
        </div>
        <div>
          <span>Net yearly</span>
          <strong>
            {calculatedNetAmount === undefined
              ? '—'
              : formatMoney(calculatedNetAmount)}
          </strong>
        </div>
      </div>
    </article>
  );
}
